//! notifications: the notification history and do-not-disturb.
//!
//! The desktop's own shell owns org.freedesktop.Notifications, so this
//! service watches the bus instead of serving it (a D-Bus monitor
//! connection): each Notify call and the id its reply carries make an entry;
//! NotificationClosed removes it. Dismissing asks the server to close the
//! notification, so it goes away there too. Actions cannot be invoked from
//! outside the server, so they are not offered. The history is kept in
//! $XDG_STATE_HOME/adwaita-shell, so restarting keeps it.
//!
//! topic  state  {"count": n, "dnd": bool}
//! topic  list   [{"id", "app", "summary", "body", "icon", "urgency": 0|1|2, "time": epoch s}]
//!               newest first; `body` is plain text (markup removed)
//! call   dismiss     {"id"}
//! call   clear
//! call   toggle_dnd
//! call   set_dnd     {"on": bool}

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;

use futures_lite::StreamExt;
use serde_json::{Value, json};
use tessela_service::dbus::{self, zbus};
use tessela_service::{Error, Result, Service, Timer, Topic};
use zbus::message::Type;
use zbus::zvariant::{OwnedValue, Value as Variant};
use zbus::{MatchRule, Message};

use crate::Start;
use crate::util::{now_s, save};

const KEEP: usize = 50;
const IFACE: &str = "org.freedesktop.Notifications";

fn store() -> PathBuf {
    crate::util::state_dir().join("adwaita-shell/notifications.json")
}

#[derive(Clone)]
struct Notifications {
    state: Topic<Value>,
    list: Topic<Vec<Value>>,
}

impl Notifications {
    fn load(&self) {
        let Some(saved) = std::fs::read_to_string(store())
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        else {
            return;
        };
        let mut list: Vec<Value> = saved["list"].as_array().cloned().unwrap_or_default();
        list.truncate(KEEP);
        let count = list.len();
        self.list.publish(list);
        let dnd = match &saved["dnd"] {
            Value::Bool(b) => *b,
            Value::Null => false,
            other => other.as_f64().is_some_and(|f| f != 0.0),
        };
        self.state.publish(json!({"count": count, "dnd": dnd}));
    }

    fn save(&self) {
        let text = json!({"list": self.list.get(), "dnd": self.state.get()["dnd"]}).to_string();
        save(&store(), &text);
    }

    fn publish(&self, mut items: Vec<Value>) {
        items.truncate(KEEP);
        let count = items.len();
        self.list.publish(items);
        self.state.update(|s| s["count"] = json!(count));
        self.save();
    }

    fn set_dnd(&self, on: bool) {
        self.state.update(|s| s["dnd"] = json!(on));
        self.save();
    }

    fn without(&self, id: u64) -> Vec<Value> {
        self.list
            .get()
            .into_iter()
            .filter(|n| n["id"] != id)
            .collect()
    }
}

/// The spec's markup (b, i, u, a, img, br) as plain text.
fn plain(body: &str) -> String {
    // <br>, <br/>, <BR />: a line break.
    let mut out = String::with_capacity(body.len());
    let mut rest = body;
    while let Some(i) = rest.find('<') {
        out.push_str(&rest[..i]);
        let tag = &rest[i..];
        let lower = tag.get(..3).map(str::to_ascii_lowercase);
        if lower.as_deref() == Some("<br") {
            let after = tag[3..].trim_start();
            let after = after.strip_prefix('/').unwrap_or(after);
            if let Some(after) = after.strip_prefix('>') {
                out.push('\n');
                rest = after;
                continue;
            }
        }
        // Any other tag goes away; a lone '<' stays.
        match tag[1..].find('>') {
            Some(j) if j > 0 => rest = &tag[j + 2..],
            _ => {
                out.push('<');
                rest = &tag[1..];
            }
        }
    }
    out.push_str(rest);
    unescape(&out).trim().to_string()
}

/// The entities notification bodies use (html.unescape covers more).
fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let tail = &rest[i + 1..];
        let end = tail.find(';').filter(|&e| e <= 10);
        let decoded = end.and_then(|e| {
            let name = &tail[..e];
            let c = match name {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                "nbsp" => Some('\u{a0}'),
                _ if name.starts_with("#x") || name.starts_with("#X") => {
                    u32::from_str_radix(&name[2..], 16)
                        .ok()
                        .and_then(char::from_u32)
                }
                _ if name.starts_with('#') => name[1..].parse().ok().and_then(char::from_u32),
                _ => None,
            };
            c.map(|c| (c, e))
        });
        match decoded {
            Some((c, e)) => {
                out.push(c);
                rest = &tail[e + 1..];
            }
            None => {
                out.push('&');
                rest = tail;
            }
        }
    }
    out.push_str(rest);
    out
}

fn hint_str(hints: &HashMap<String, OwnedValue>, key: &str) -> Option<String> {
    match &**hints.get(key)? {
        Variant::Str(s) => Some(s.to_string()),
        _ => None,
    }
}

fn hint_int(hints: &HashMap<String, OwnedValue>, key: &str) -> Option<i64> {
    Some(match &**hints.get(key)? {
        Variant::U8(v) => *v as i64,
        Variant::I16(v) => *v as i64,
        Variant::U16(v) => *v as i64,
        Variant::I32(v) => *v as i64,
        Variant::U32(v) => *v as i64,
        Variant::I64(v) => *v,
        Variant::U64(v) => *v as i64,
        _ => return None,
    })
}

type Notify = (
    String,
    u32,
    String,
    String,
    String,
    Vec<String>,
    HashMap<String, OwnedValue>,
    i32,
);

/// Notify calls waiting for their reply: (sender, serial) → entry, oldest first.
#[derive(Default)]
struct Pending(VecDeque<((String, u32), (u32, Value))>);

fn on_message(n: &Notifications, pending: &RefCell<Pending>, msg: &Message) {
    let h = msg.header();
    match h.message_type() {
        Type::MethodCall if h.member().is_some_and(|m| m == "Notify") => {
            let Ok((app, replaces, icon, summary, body, _actions, hints, _timeout)) =
                msg.body().deserialize::<Notify>()
            else {
                return;
            };
            let image = hint_str(&hints, "image-path")
                .or_else(|| hint_str(&hints, "image_path"))
                .filter(|s| !s.is_empty())
                .unwrap_or_default();
            let icon = [
                icon,
                if image.starts_with("file://") {
                    String::new()
                } else {
                    image
                },
                hint_str(&hints, "desktop-entry").unwrap_or_default(),
            ]
            .into_iter()
            .find(|s| !s.is_empty())
            .unwrap_or_default();
            // Python's `hint(...) or 1`: urgency 0 (low) also reads as 1.
            let urgency = hint_int(&hints, "urgency").filter(|u| *u != 0).unwrap_or(1);
            let sender = h.sender().map(|s| s.to_string()).unwrap_or_default();
            let entry = json!({
                "app": app, "summary": summary, "body": plain(&body), "icon": icon,
                "urgency": urgency, "time": now_s(),
            });
            let mut p = pending.borrow_mut();
            p.0.push_back(((sender, h.primary().serial_num().get()), (replaces, entry)));
            // A sender that never gets a reply (it died) must not pile up.
            while p.0.len() > 64 {
                p.0.pop_front();
            }
        }
        Type::MethodReturn => {
            let (Some(dest), Some(serial)) = (h.destination(), h.reply_serial()) else {
                return;
            };
            let key = (dest.to_string(), serial.get());
            let found = {
                let mut p = pending.borrow_mut();
                p.0.iter()
                    .position(|(k, _)| *k == key)
                    .and_then(|i| p.0.remove(i))
            };
            let Some((_, (replaces, mut entry))) = found else {
                return;
            };
            let Ok((id,)) = msg.body().deserialize::<(u32,)>() else {
                return;
            };
            entry["id"] = json!(id);
            let mut items: Vec<Value> = n
                .list
                .get()
                .into_iter()
                .filter(|x| x["id"] != id && x["id"] != replaces)
                .collect();
            items.insert(0, entry);
            n.publish(items);
        }
        Type::Signal if h.member().is_some_and(|m| m == "NotificationClosed") => {
            let Ok((id, _reason)) = msg.body().deserialize::<(u32, u32)>() else {
                return;
            };
            if n.list.get().iter().any(|x| x["id"] == id) {
                n.publish(n.without(id as u64));
            }
        }
        _ => {}
    }
}

async fn monitor(n: &Notifications, pending: &RefCell<Pending>) -> zbus::Result<()> {
    let conn = dbus::connect(zbus::connection::Builder::session()?).await?;
    let rules = [
        MatchRule::builder()
            .msg_type(Type::MethodCall)
            .interface(IFACE)?
            .member("Notify")?
            .build(),
        MatchRule::builder()
            .msg_type(Type::MethodReturn)
            .sender(IFACE)?
            .build(),
        MatchRule::builder()
            .msg_type(Type::Signal)
            .interface(IFACE)?
            .member("NotificationClosed")?
            .build(),
    ];
    zbus::fdo::MonitoringProxy::new(&conn)
        .await?
        .become_monitor(&rules, 0)
        .await?;
    let mut messages = zbus::MessageStream::from(&conn);
    while let Some(msg) = messages.next().await {
        on_message(n, pending, &msg?);
    }
    Ok(())
}

async fn close(id: u64) {
    let Ok(conn) = dbus::session().await else {
        return;
    };
    let _ = conn
        .call_method(
            Some(IFACE),
            "/org/freedesktop/Notifications",
            Some(IFACE),
            "CloseNotification",
            &(id as u32,),
        )
        .await;
}

fn arg_id(args: &Value) -> Result<u64> {
    let id = args.get("id").ok_or("'id'")?;
    id.as_f64()
        .filter(|f| *f >= 0.0)
        .map(|f| f.trunc() as u64)
        .ok_or_else(|| Error::msg(format!("bad id {id}")))
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("notifications");
    let n = Notifications {
        state: svc.topic("state", json!({"count": 0, "dnd": false})),
        list: svc.topic("list", Vec::<Value>::new()),
    };
    n.load();

    let nn = n.clone();
    svc.method("dismiss", move |args: Value| {
        let nn = nn.clone();
        async move {
            let id = arg_id(&args)?;
            nn.publish(nn.without(id));
            close(id).await;
            Ok(())
        }
    });
    let nn = n.clone();
    svc.method("clear", move |_: Value| {
        let nn = nn.clone();
        async move {
            let ids: Vec<u64> = nn
                .list
                .get()
                .iter()
                .filter_map(|x| x["id"].as_u64())
                .collect();
            nn.publish(Vec::new());
            for id in ids {
                close(id).await;
            }
            Ok(())
        }
    });
    let nn = n.clone();
    svc.method_sync("toggle_dnd", move |_: Value| {
        nn.set_dnd(nn.state.get()["dnd"] != true);
        Ok(())
    });
    let nn = n.clone();
    svc.method_sync("set_dnd", move |args: Value| {
        nn.set_dnd(
            args.get("on")
                .is_some_and(|v| v == true || v.as_f64().is_some_and(|f| f != 0.0)),
        );
        Ok(())
    });

    let start = async move {
        let pending = Rc::new(RefCell::new(Pending::default()));
        loop {
            if let Err(e) = monitor(&n, &pending).await {
                eprintln!("notifications: bus monitor: {e}");
            }
            Timer::after(Duration::from_secs(5)).await;
        }
    };
    (svc, Box::pin(start))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markup_becomes_plain_text() {
        assert_eq!(
            plain("<b>Oi</b> &amp; tchau<br/>linha<BR >dois"),
            "Oi & tchau\nlinha\ndois"
        );
        // Like `<[^>]+>`: a lone "<" swallows up to the next ">".
        assert_eq!(plain("  a < b &lt;3 <a href=\"x\">link</a>  "), "a link");
        assert_eq!(plain("3 &lt; 4 &#233;&#x41;"), "3 < 4 éA");
        assert_eq!(plain("&unknown; <>"), "&unknown; <>");
    }
}
