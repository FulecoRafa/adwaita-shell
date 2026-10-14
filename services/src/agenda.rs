//! agenda: calcure events (~/.config/calcure/events.csv).
//!
//! topic  events  [{"date": "2026-10-12", "time": "15:00" | "", "title", "status"}]
//!
//! A time at the start of the name ("15:00 revisão") becomes the event's
//! time. Re-read when the file changes: inotify on its directory (every 30 s
//! a cheap stat while the directory does not exist).

use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde_json::{Value, json};
use tessela_service::{Service, Timer};

use crate::Start;

fn file() -> PathBuf {
    crate::util::home().join(".config/calcure/events.csv")
}

/// `^(\d+),(\d+),(\d+),(\d+),"((?:[^"]|"")*)",(\d+),(\w+),(\w+)`
fn parse(line: &str) -> Option<Value> {
    fn digits(s: &str) -> Option<(&str, &str)> {
        let n = s.bytes().take_while(u8::is_ascii_digit).count();
        (n > 0).then(|| s.split_at(n))
    }
    fn word(s: &str) -> Option<(&str, &str)> {
        let n: usize = s
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_')
            .map(char::len_utf8)
            .sum();
        (n > 0).then(|| s.split_at(n))
    }
    fn comma(s: &str) -> Option<&str> {
        s.strip_prefix(',')
    }
    let (_id, s) = digits(line)?;
    let (y, s) = digits(comma(s)?)?;
    let (m, s) = digits(comma(s)?)?;
    let (d, s) = digits(comma(s)?)?;
    let mut s = comma(s)?.strip_prefix('"')?;
    let mut name = String::new();
    loop {
        let i = s.find('"')?;
        name.push_str(&s[..i]);
        s = &s[i + 1..];
        if let Some(rest) = s.strip_prefix('"') {
            name.push('"');
            s = rest;
        } else {
            break;
        }
    }
    let (_repeat, s) = digits(comma(s)?)?;
    let (_frequency, s) = word(comma(s)?)?;
    let (status, _) = word(comma(s)?)?;
    let (time, title) = timed(&name).unwrap_or((String::new(), name.clone()));
    Some(json!({
        "date": format!("{:04}-{:02}-{:02}", y.parse::<u64>().ok()?, m.parse::<u64>().ok()?, d.parse::<u64>().ok()?),
        "time": time,
        "title": title,
        "status": status,
    }))
}

/// `^(\d{1,2}[:h]\d{2})\s*[-–—·]?\s*(.*)$`: ("HH:MM", rest).
fn timed(name: &str) -> Option<(String, String)> {
    let h = name.bytes().take_while(u8::is_ascii_digit).count();
    if !(1..=2).contains(&h) {
        return None;
    }
    let rest = &name[h..];
    let rest = rest.strip_prefix(':').or_else(|| rest.strip_prefix('h'))?;
    let m = rest.bytes().take_while(u8::is_ascii_digit).count();
    if m < 2 {
        return None;
    }
    let rest = &rest[2..];
    let rest = rest.trim_start();
    let rest = rest.strip_prefix(['-', '–', '—', '·']).unwrap_or(rest);
    let title = rest.trim_start();
    if title.contains('\n') {
        return None;
    }
    let time = format!("{:0>5}", format!("{}:{}", &name[..h], &name[h + 1..h + 3]));
    Some((time, title.to_string()))
}

fn read(path: &Path) -> Vec<Value> {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let mut events: Vec<Value> = text.lines().filter_map(parse).collect();
    events.sort_by(|a, b| {
        (a["date"].as_str(), a["time"].as_str()).cmp(&(b["date"].as_str(), b["time"].as_str()))
    });
    events
}

fn mtime(path: &Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

/// An inotify fd watching `dir` for files written, moved in or removed.
fn watch(dir: &Path) -> Option<OwnedFd> {
    use std::os::unix::ffi::OsStrExt;
    let c = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    // SAFETY: plain syscalls; the fd is owned right away.
    unsafe {
        let fd = libc::inotify_init1(libc::IN_NONBLOCK | libc::IN_CLOEXEC);
        if fd < 0 {
            return None;
        }
        let fd = OwnedFd::from_raw_fd(fd);
        let mask = libc::IN_CLOSE_WRITE
            | libc::IN_MOVED_TO
            | libc::IN_MOVED_FROM
            | libc::IN_CREATE
            | libc::IN_DELETE
            | libc::IN_DELETE_SELF
            | libc::IN_MOVE_SELF;
        (libc::inotify_add_watch(fd.as_raw_fd(), c.as_ptr(), mask) >= 0).then_some(fd)
    }
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("agenda");
    let events = svc.topic("events", Vec::<Value>::new());
    let start = async move {
        let path = file();
        let mut seen: Option<Option<SystemTime>> = None;
        let refresh = |seen: &mut Option<Option<SystemTime>>| {
            let m = mtime(&path);
            if *seen != Some(m) {
                *seen = Some(m);
                events.publish(if m.is_some() { read(&path) } else { Vec::new() });
            }
        };
        loop {
            refresh(&mut seen);
            let dir = path.parent().unwrap_or(Path::new("/"));
            let Some(fd) = watch(dir).and_then(|fd| async_io::Async::new(fd).ok()) else {
                Timer::after(Duration::from_secs(30)).await;
                continue;
            };
            // The directory may have changed between the read and the watch.
            refresh(&mut seen);
            let mut buf = [0u8; 4096];
            let gone = loop {
                let n = fd
                    .read_with(|fd| {
                        // SAFETY: reads into our buffer.
                        let n = unsafe {
                            libc::read(fd.as_raw_fd(), buf.as_mut_ptr().cast(), buf.len())
                        };
                        if n < 0 {
                            Err(std::io::Error::last_os_error())
                        } else {
                            Ok(n as usize)
                        }
                    })
                    .await;
                let Ok(n) = n else { break true };
                // Several events at once (an editor's save): one read.
                Timer::after(Duration::from_millis(100)).await;
                refresh(&mut seen);
                if events_say_gone(&buf[..n]) {
                    break true;
                }
            };
            if gone {
                Timer::after(Duration::from_secs(1)).await;
            }
        }
    };
    (svc, Box::pin(start))
}

/// Whether the watched directory itself went away (the watch is dead).
fn events_say_gone(mut buf: &[u8]) -> bool {
    let header = std::mem::size_of::<libc::inotify_event>();
    while buf.len() >= header {
        // SAFETY: the kernel wrote whole events; read the header unaligned.
        let ev: libc::inotify_event = unsafe { std::ptr::read_unaligned(buf.as_ptr().cast()) };
        if ev.mask & (libc::IN_DELETE_SELF | libc::IN_MOVE_SELF | libc::IN_IGNORED) != 0 {
            return true;
        }
        buf = &buf[(header + ev.len as usize).min(buf.len())..];
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lines_like_the_python_regexes() {
        assert_eq!(
            parse(r#"1,2026,10,12,"15:00 revisão",1,once,normal"#),
            Some(json!({"date":"2026-10-12","time":"15:00","title":"revisão","status":"normal"}))
        );
        assert_eq!(
            parse(r#"7,2026,1,5,"9h30 – dentista",1,once,important"#),
            Some(
                json!({"date":"2026-01-05","time":"09:30","title":"dentista","status":"important"})
            )
        );
        assert_eq!(
            parse(r#"3,2026,10,1,"diz ""oi""",1,once,normal"#),
            Some(json!({"date":"2026-10-01","time":"","title":"diz \"oi\"","status":"normal"}))
        );
        assert_eq!(parse("garbage"), None);
    }
}
