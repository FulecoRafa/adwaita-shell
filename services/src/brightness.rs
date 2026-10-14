//! brightness: the screen backlight, read from sysfs, set with brightnessctl.
//!
//! topic  state  {"value": 0..1} | null   (null: no backlight)
//! call   set    {"value": 0..1}          (at least 1 %, so the screen never goes black)
//! call   step   {"delta": -1..1}
//!
//! sysfs does not announce changes reliably for every driver: read every
//! 2 s (two small files, no process), and right after a set.

use std::cell::Cell;
use std::path::PathBuf;
use std::rc::Rc;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tessela_service::process::run;
use tessela_service::{Service, Topic, Wake, poll};

use crate::Start;

fn device() -> Option<PathBuf> {
    let mut all: Vec<PathBuf> = std::fs::read_dir("/sys/class/backlight")
        .ok()?
        .flatten()
        .map(|e| e.path())
        .collect();
    all.sort();
    all.into_iter().next()
}

fn number(p: PathBuf) -> Option<i64> {
    std::fs::read_to_string(p).ok()?.trim().parse().ok()
}

fn read(state: &Topic<Value>, last_set: &Cell<Option<Instant>>) {
    let Some(d) = device() else {
        state.publish(Value::Null);
        return;
    };
    let (Some(current), Some(max)) = (
        number(d.join("brightness")),
        number(d.join("max_brightness")),
    ) else {
        return;
    };
    // Right after a write sysfs may still report the old level.
    let settled = last_set
        .get()
        .is_none_or(|t| t.elapsed() > Duration::from_millis(1500));
    if max > 0 && settled {
        state.publish(json!({"value": crate::util::round_to(current as f64 / max as f64, 2)}));
    }
}

async fn set_level(state: &Topic<Value>, last_set: &Cell<Option<Instant>>, value: f64) -> f64 {
    let percent = (value.clamp(0.01, 1.0) * 100.0).round_ties_even();
    last_set.set(Some(Instant::now()));
    state.publish(json!({"value": percent / 100.0}));
    run(
        &["brightnessctl", "-q", "set", &format!("{percent}%")],
        Duration::from_secs(5),
    )
    .await;
    percent / 100.0
}

fn arg(args: &Value, key: &str) -> f64 {
    args.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("brightness");
    let state = svc.topic("state", Value::Null);
    let last_set = Rc::new(Cell::new(None));
    let wake = Wake::new();

    let (st, ls) = (state.clone(), last_set.clone());
    svc.method("set", move |args: Value| {
        let (st, ls) = (st.clone(), ls.clone());
        async move { Ok(set_level(&st, &ls, arg(&args, "value")).await) }
    });
    let (st, ls) = (state.clone(), last_set.clone());
    svc.method("step", move |args: Value| {
        let (st, ls) = (st.clone(), ls.clone());
        async move {
            let current = st.get()["value"].as_f64().unwrap_or(0.0);
            let target = ((current + arg(&args, "delta")) * 20.0).round_ties_even() / 20.0;
            Ok(set_level(&st, &ls, target).await)
        }
    });

    let start = async move {
        poll(Duration::from_secs(2), &wake, || {
            read(&state, &last_set);
            async {}
        })
        .await;
    };
    (svc, Box::pin(start))
}
