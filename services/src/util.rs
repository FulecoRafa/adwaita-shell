//! Small things every module needs: rounding like Python, clocks, local
//! dates, the user's directories.

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// `round(x, places)`, as Python does it.
pub fn round_to(x: f64, places: i32) -> f64 {
    let m = 10f64.powi(places);
    // Python rounds halves to even.
    (x * m).round_ties_even() / m
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

pub fn now_s() -> i64 {
    now_ms() / 1000
}

pub fn home() -> PathBuf {
    std::env::var_os("HOME").map_or_else(|| PathBuf::from("/"), PathBuf::from)
}

fn xdg(var: &str, fallback: &str) -> PathBuf {
    std::env::var_os(var)
        .filter(|v| !v.is_empty())
        .map_or_else(|| home().join(fallback), PathBuf::from)
}

/// `$XDG_STATE_HOME`, else `~/.local/state`.
pub fn state_dir() -> PathBuf {
    xdg("XDG_STATE_HOME", ".local/state")
}

/// `$XDG_CACHE_HOME`, else `~/.cache`.
pub fn cache_dir() -> PathBuf {
    xdg("XDG_CACHE_HOME", ".cache")
}

/// Write a file, creating its directory; complain on stderr if it fails.
pub fn save(path: &std::path::Path, text: &str) {
    let r = path
        .parent()
        .map_or(Ok(()), std::fs::create_dir_all)
        .and_then(|_| std::fs::write(path, text));
    if let Err(e) = r {
        eprintln!("cannot save {}: {e}", path.display());
    }
}

/// A local calendar date and hour.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Local {
    pub year: i64,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
}

pub fn local(epoch: i64) -> Local {
    // SAFETY: localtime_r only writes the struct we hand it.
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    let t = epoch as libc::time_t;
    unsafe {
        libc::localtime_r(&t, &mut tm);
    }
    Local {
        year: tm.tm_year as i64 + 1900,
        month: tm.tm_mon as u32 + 1,
        day: tm.tm_mday as u32,
        hour: tm.tm_hour as u32,
    }
}

pub fn now_local() -> Local {
    local(now_s())
}

pub fn iso_date(year: i64, month: u32, day: u32) -> String {
    format!("{year:04}-{month:02}-{day:02}")
}

/// Days since 1970-01-01 of a proleptic Gregorian date.
pub fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = m as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

pub fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m, d)
}

/// The local date `days` before today, as `YYYY-MM-DD`.
pub fn days_ago(days: i64) -> String {
    let t = now_local();
    let (y, m, d) = civil_from_days(days_from_civil(t.year, t.month, t.day) - days);
    iso_date(y, m, d)
}

/// Python's `int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())`
/// for the shapes APIs send: a date, or a date and time with optional
/// fraction and offset (none means local time).
pub fn parse_iso(s: &str) -> Option<i64> {
    let s = s.trim();
    let num = |t: &str| -> Option<i64> {
        (!t.is_empty() && t.bytes().all(|b| b.is_ascii_digit()))
            .then(|| t.parse().ok())
            .flatten()
    };
    let (date, rest) = s.split_at(s.len().min(10));
    let mut dp = date.split('-');
    let (y, mo, d) = (num(dp.next()?)?, num(dp.next()?)?, num(dp.next()?)?);
    if dp.next().is_some() || !(1..=12).contains(&mo) || !(1..=31).contains(&d) {
        return None;
    }
    let (mut h, mut mi, mut sec, mut frac, mut offset) = (0, 0, 0, 0.0, None);
    if !rest.is_empty() {
        let rest = rest.strip_prefix(['T', ' '])?;
        // Split off the offset: Z, +HH:MM, -HH:MM (after the time).
        let (time, off) = match rest.find(['Z', '+', '-']) {
            Some(i) => (&rest[..i], Some(&rest[i..])),
            None => (rest, None),
        };
        let (hms, f) = match time.split_once(['.', ',']) {
            Some((a, b)) => (a, Some(b)),
            None => (time, None),
        };
        let mut tp = hms.split(':');
        h = num(tp.next()?)?;
        mi = tp.next().map_or(Some(0), num)?;
        sec = tp.next().map_or(Some(0), num)?;
        if let Some(f) = f {
            num(f)?;
            frac = format!("0.{f}").parse().ok()?;
        }
        if let Some(off) = off {
            offset = Some(if off == "Z" {
                0
            } else {
                let sign = if off.starts_with('-') { -1 } else { 1 };
                let o = off[1..].replace(':', "");
                let (oh, om) = o.split_at(o.len().min(2));
                sign * (num(oh)? * 3600
                    + if om.is_empty() {
                        0
                    } else {
                        num(&om[..2.min(om.len())])? * 60
                    })
            });
        }
    }
    let naive = days_from_civil(y, mo as u32, d as u32) * 86400 + h * 3600 + mi * 60 + sec;
    let t = match offset {
        Some(o) => naive - o,
        None => {
            // Local wall time: let mktime find the offset.
            // SAFETY: mktime reads and normalizes the struct we own.
            let mut tm: libc::tm = unsafe { std::mem::zeroed() };
            tm.tm_year = (y - 1900) as i32;
            tm.tm_mon = mo as i32 - 1;
            tm.tm_mday = d as i32;
            tm.tm_hour = h as i32;
            tm.tm_min = mi as i32;
            tm.tm_sec = sec as i32;
            tm.tm_isdst = -1;
            (unsafe { libc::mktime(&mut tm) }) as i64
        }
    };
    // int() truncates toward zero.
    Some((t as f64 + frac).trunc() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_round_trip() {
        for days in [-1000, 0, 1, 365, 20000, 20739] {
            let (y, m, d) = civil_from_days(days);
            assert_eq!(days_from_civil(y, m, d), days);
        }
        assert_eq!(days_from_civil(2026, 10, 13), 20739);
    }

    #[test]
    fn iso_timestamps_like_python() {
        assert_eq!(parse_iso("2026-10-13T15:00:00Z"), Some(1791903600));
        assert_eq!(parse_iso("2026-10-13T15:00:00+00:00"), Some(1791903600));
        assert_eq!(parse_iso("2026-10-13T12:00:00-03:00"), Some(1791903600));
        assert_eq!(
            parse_iso("2026-10-13T15:00:00.987654+00:00"),
            Some(1791903600)
        );
        assert_eq!(parse_iso("2026-10-13T15:00Z"), Some(1791903600));
        assert_eq!(parse_iso("soon"), None);
        assert_eq!(parse_iso("2026-13-01"), None);
    }

    #[test]
    fn rounding() {
        assert_eq!(round_to(0.789_9, 2), 0.79);
        assert_eq!(round_to(12.345_67, 3), 12.346);
    }
}
