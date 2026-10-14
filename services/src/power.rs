//! power: the power-profiles-daemon profile, and caffeine (no idle suspend).
//!
//! topic  profile   "power-saver" | "balanced" | "performance" | null
//! topic  caffeine  {"on": bool, "until": epoch ms (0 = no end), "minutes": n}
//! call   set       {"profile": ...}
//! call   caffeine  {"minutes": n}   on for n minutes; 0 = until turned off
//! call   caffeine_off
//!
//! The profile comes from power-profiles-daemon on the system bus, read
//! again when it signals a change (no polling). Caffeine holds a logind
//! idle inhibitor (what `systemd-inhibit --what=idle` takes), which hypridle
//! honors, like the reference's idle inhibitor on the bar.

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use futures_lite::StreamExt;
use serde_json::{Value, json};
use tessela_service::dbus::{self, zbus};
use tessela_service::{Error, Result, Service, Task, Timer, Topic, spawn};
use zbus::zvariant::OwnedFd;

use crate::Start;

const PROFILES: [&str; 3] = ["power-saver", "balanced", "performance"];
/// The current name first, then the one older daemons own.
const PPD: [(&str, &str, &str); 2] = [
    (
        "org.freedesktop.UPower.PowerProfiles",
        "/org/freedesktop/UPower/PowerProfiles",
        "org.freedesktop.UPower.PowerProfiles",
    ),
    (
        "net.hadess.PowerProfiles",
        "/net/hadess/PowerProfiles",
        "net.hadess.PowerProfiles",
    ),
];

async fn proxy(conn: &zbus::Connection, i: usize) -> zbus::Result<zbus::Proxy<'static>> {
    let (name, path, iface) = PPD[i];
    zbus::proxy::Builder::new(conn)
        .destination(name)?
        .path(path)?
        .interface(iface)?
        .cache_properties(zbus::proxy::CacheProperties::No)
        .build()
        .await
}

async fn read_profile(conn: &zbus::Connection) -> Option<String> {
    for i in 0..PPD.len() {
        if let Ok(p) = proxy(conn, i).await
            && let Ok(v) = p.get_property::<String>("ActiveProfile").await
        {
            return PROFILES.contains(&v.as_str()).then_some(v);
        }
    }
    None
}

async fn watch_profile(profile: Topic<Value>) {
    let conn = match dbus::system().await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("power: system bus: {e}");
            return;
        }
    };
    let mut changes = match dbus::signals_from(&conn, PPD[0].0).await {
        Ok(s) => s.boxed_local(),
        Err(e) => {
            eprintln!("power: {e}");
            futures_lite::stream::pending().boxed_local()
        }
    };
    loop {
        profile.publish(read_profile(&conn).await.map_or(Value::Null, Value::from));
        changes.next().await;
    }
}

#[derive(Default)]
struct Caffeine {
    /// The logind inhibitor: held while open.
    lock: Option<OwnedFd>,
    /// Ends a timed caffeine; dropping it cancels that.
    _timer: Option<Task<()>>,
}

fn off() -> Value {
    json!({"on": false, "until": 0, "minutes": 0})
}

async fn inhibit() -> zbus::Result<OwnedFd> {
    let conn = dbus::system().await?;
    let reply = conn
        .call_method(
            Some("org.freedesktop.login1"),
            "/org/freedesktop/login1",
            Some("org.freedesktop.login1.Manager"),
            "Inhibit",
            &("idle", "adwaita-shell", "cafeína", "block"),
        )
        .await?;
    reply.body().deserialize::<OwnedFd>()
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("power");
    let profile = svc.topic("profile", Value::Null);
    let caffeine = svc.topic("caffeine", off());
    let held = Rc::new(RefCell::new(Caffeine::default()));

    let pr = profile.clone();
    svc.method("set", move |args: Value| {
        let pr = pr.clone();
        async move {
            let p = args.get("profile").cloned().unwrap_or(Value::Null);
            let Some(name) = p.as_str().filter(|n| PROFILES.contains(n)) else {
                let shown = match &p {
                    Value::String(s) => format!("'{s}'"),
                    Value::Null => "None".into(),
                    other => other.to_string(),
                };
                return Err(Error::msg(format!("unknown profile {shown}")));
            };
            let conn = dbus::system().await?;
            let mut last = None;
            for i in 0..PPD.len() {
                match proxy(&conn, i)
                    .await?
                    .set_property("ActiveProfile", name)
                    .await
                {
                    Ok(()) => {
                        last = None;
                        break;
                    }
                    Err(e) => last = Some(e),
                }
            }
            if let Some(e) = last {
                return Err(e.into());
            }
            pr.publish(json!(name));
            Ok(name.to_string())
        }
    });

    let (caf, h) = (caffeine.clone(), held.clone());
    svc.method("caffeine", move |args: Value| {
        let (caf, h) = (caf.clone(), h.clone());
        async move {
            let minutes = args
                .get("minutes")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
                .max(0.0) as u64;
            *h.borrow_mut() = Caffeine::default();
            let lock = match inhibit().await {
                Ok(fd) => fd,
                Err(e) => {
                    caf.publish(off());
                    return Err(Error::msg(format!("cannot inhibit idle: {e}")));
                }
            };
            let until = if minutes > 0 {
                crate::util::now_ms() + minutes as i64 * 60_000
            } else {
                0
            };
            let timer = (minutes > 0).then(|| {
                let (caf, h) = (caf.clone(), h.clone());
                spawn(async move {
                    Timer::after(Duration::from_secs(minutes * 60)).await;
                    // Dropping the fd releases the inhibitor.
                    h.borrow_mut().lock = None;
                    caf.publish(off());
                })
            });
            *h.borrow_mut() = Caffeine {
                lock: Some(lock),
                _timer: timer,
            };
            caf.publish(json!({"on": true, "until": until, "minutes": minutes}));
            Ok(())
        }
    });
    let (caf, h) = (caffeine.clone(), held.clone());
    svc.method_sync("caffeine_off", move |_: Value| -> Result<()> {
        *h.borrow_mut() = Caffeine::default();
        caf.publish(off());
        Ok(())
    });

    (svc, Box::pin(watch_profile(profile)))
}
