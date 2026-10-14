//! ai: Claude Code and Codex quota windows, from `ai-usage show` every 5 min.
//!
//! topic  state  {"claude": Quota, "codex": Quota, "updatedAt": epoch s} | null
//!        Quota = {"percent": 0..100 | -1, "resetsAt": epoch s | null}
//!        (the session windows, for the bar's chip)
//! topic  details  {"claude": Provider, "codex": Provider, "updatedAt": epoch s,
//!                  "history": {"claude": [7 daily peaks, oldest first], "codex": [...]}} | null
//!        Provider = {"available": bool, "model", "plan", "stale": bool,
//!                    "limits": [{"key", "percent", "resetsAt"}]}
//!        claude keys: session, week, opus, sonnet; codex keys: session, week
//! call   refresh
//!
//! The daily peak of each session window is kept for 14 days in
//! $XDG_STATE_HOME/adwaita-shell/ai-history.json, seeded from the reference
//! shell's state file the first time.

use std::cell::RefCell;
use std::path::PathBuf;
use std::rc::Rc;
use std::time::Duration;

use serde_json::{Map, Value, json};
use tessela_service::process::run;
use tessela_service::{Service, Topic, Wake, poll};

use crate::Start;
use crate::util::{days_ago, parse_iso, save, state_dir};

fn store() -> PathBuf {
    state_dir().join("adwaita-shell/ai-history.json")
}

fn reference() -> PathBuf {
    state_dir().join("fuleco-shell/state.json")
}

fn epoch(raw: &Value) -> Value {
    match raw {
        Value::Number(n) => json!(n.as_f64().map_or(0, |f| f.trunc() as i64)),
        Value::Null => Value::Null,
        // Python's str(raw) of a bool reads "True"/"False": not a date either.
        Value::String(s) => parse_iso(&s.replace('Z', "+00:00")).map_or(Value::Null, |t| json!(t)),
        _ => Value::Null,
    }
}

fn quota(limit: Option<&Value>) -> Value {
    match limit.and_then(|l| Some((l, l.get("usedPercent")?.as_f64()?))) {
        // bools are not numbers in JSON (they are ints in Python; ai-usage sends numbers).
        Some((l, used)) => json!({
            "percent": used.clamp(0.0, 100.0),
            "resetsAt": epoch(l.get("resetsAt").unwrap_or(&Value::Null)),
        }),
        None => json!({"percent": -1, "resetsAt": null}),
    }
}

fn limits(pairs: &[(&str, Option<&Value>)]) -> Value {
    pairs
        .iter()
        .filter(|(_, raw)| raw.is_some_and(Value::is_object))
        .map(|(key, raw)| {
            let mut q = quota(*raw);
            q["key"] = json!(key);
            q
        })
        .collect()
}

fn load_history() -> Map<String, Value> {
    if let Some(Value::Object(m)) = std::fs::read_to_string(store())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
    {
        return m;
    }
    if let Some(data) = std::fs::read_to_string(reference())
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
    {
        let h = data.get("aiHistory").cloned().unwrap_or(data);
        if let Value::Object(m) = h {
            return m;
        }
    }
    Map::new()
}

/// Keep the day's peak; drop days older than 14.
fn record(history: &mut Map<String, Value>, name: &str, percent: f64) {
    if percent < 0.0 {
        return;
    }
    let today = days_ago(0);
    let days = history
        .entry(name)
        .or_insert_with(|| json!({}))
        .as_object_mut();
    let Some(days) = days else { return };
    if days.get(&today).and_then(Value::as_f64).unwrap_or(-1.0) >= percent {
        return;
    }
    days.insert(today, json!(percent));
    let mut keys: Vec<String> = days.keys().cloned().collect();
    keys.sort();
    let drop = keys.len().saturating_sub(14);
    for old in &keys[..drop] {
        days.remove(old);
    }
    save(&store(), &Value::Object(history.clone()).to_string());
}

fn week(history: &Map<String, Value>, name: &str) -> Value {
    (0..7)
        .rev()
        .map(|i| {
            history
                .get(name)
                .and_then(|d| d.get(days_ago(i)))
                .cloned()
                .unwrap_or(json!(0))
        })
        .collect()
}

fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    v.get(key).filter(|x| !x.is_null())
}

/// Python truthiness, for `x or {}` and `bool(x)`.
fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64() != Some(0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
    }
}

fn or_empty(v: Option<&Value>) -> Value {
    if truthy(v) {
        v.cloned().unwrap_or(json!({}))
    } else {
        json!({})
    }
}

fn text(v: Option<&Value>) -> String {
    match v {
        Some(v) if truthy(Some(v)) => match v {
            Value::String(s) => s.to_lowercase(),
            other => other.to_string().to_lowercase(),
        },
        _ => String::new(),
    }
}

async fn read(state: &Topic<Value>, details: &Topic<Value>, history: &RefCell<Map<String, Value>>) {
    let out = run(&["ai-usage", "show"], Duration::from_secs(30)).await;
    if out.is_empty() {
        return;
    }
    let Ok(data) = serde_json::from_str::<Value>(&out) else {
        eprintln!("ai: ai-usage sent something that is not JSON");
        return;
    };
    let claude = or_empty(data.get("claude"));
    let codex = or_empty(data.get("codex"));
    let cl = or_empty(claude.get("limits"));
    let cx = &codex;
    let session_claude = quota(get(&cl, "five_hour"));
    let session_codex = quota(get(cx, "primary"));
    let updated = |p: &Value| -> Value {
        p.get("updatedAt")
            .filter(|v| truthy(Some(v)))
            .cloned()
            .unwrap_or(json!(0))
    };
    let (uc, ux) = (updated(&claude), updated(&codex));
    let updated = if ux.as_f64().unwrap_or(0.0) > uc.as_f64().unwrap_or(0.0) {
        ux
    } else {
        uc
    };
    {
        let mut h = history.borrow_mut();
        for (name, q) in [("claude", &session_claude), ("codex", &session_codex)] {
            record(&mut h, name, q["percent"].as_f64().unwrap_or(-1.0));
        }
    }
    state.publish(json!({"claude": session_claude, "codex": session_codex, "updatedAt": updated}));
    let h = history.borrow();
    details.publish(json!({
        "claude": {
            "available": claude.get("available") == Some(&json!(true)),
            "model": text(claude.get("model")),
            "plan": "",
            "stale": truthy(claude.get("stale")),
            "limits": limits(&[("session", get(&cl, "five_hour")), ("week", get(&cl, "seven_day")),
                               ("opus", get(&cl, "seven_day_opus")), ("sonnet", get(&cl, "seven_day_sonnet"))]),
        },
        "codex": {
            "available": codex.get("available") == Some(&json!(true)),
            "model": "",
            "plan": text(codex.get("planType")),
            "stale": truthy(codex.get("stale")),
            "limits": limits(&[("session", get(cx, "primary")), ("week", get(cx, "secondary"))]),
        },
        "updatedAt": updated,
        "history": {"claude": week(&h, "claude"), "codex": week(&h, "codex")},
    }));
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("ai");
    let state = svc.topic("state", Value::Null);
    let details = svc.topic("details", Value::Null);
    let wake = Wake::new();
    let w = wake.clone();
    svc.method_sync("refresh", move |_: Value| {
        w.wake();
        Ok(())
    });
    let history = Rc::new(RefCell::new(load_history()));
    let start = async move {
        poll(Duration::from_secs(300), &wake, || {
            read(&state, &details, &history)
        })
        .await;
    };
    (svc, Box::pin(start))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotas_like_python() {
        assert_eq!(quota(None), json!({"percent": -1, "resetsAt": null}));
        assert_eq!(
            quota(Some(&json!({"usedPercent": 11.0, "resetsAt": null}))),
            json!({"percent": 11.0, "resetsAt": null})
        );
        assert_eq!(
            quota(Some(
                &json!({"usedPercent": 140, "resetsAt": "2026-10-13T15:00:00Z"})
            )),
            json!({"percent": 100.0, "resetsAt": 1791903600})
        );
        assert_eq!(
            quota(Some(&json!({"usedPercent": 5, "resetsAt": 17.9}))),
            json!({"percent": 5.0, "resetsAt": 17})
        );
    }
}
