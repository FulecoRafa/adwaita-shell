//! audio: PipeWire volumes, devices and app streams.
//!
//! topic  state    {"volume": 0..1, "muted": bool, "micVolume": 0..1, "micMuted": bool} | null
//! topic  devices  {"sinks": [Device], "sources": [Device], "streams": [Stream]}
//!                 Device = {"id", "name", "headphones": bool, "default": bool}
//!                 Stream = {"id", "app", "volume": 0..1}
//! call   change   {"delta": -1..1}  (or {"event": {"delta": ±1}} from a scroll action, 5 % a step)
//! call   set      {"value": 0..1}   (unmutes, like the reference)
//! call   toggle_mute
//! call   set_mic  {"value": 0..1}
//! call   toggle_mic_mute
//! call   set_default  {"id": node id}
//! call   set_stream   {"id": node id, "value": 0..1}
//!
//! Everything is read from `pw-dump --monitor`, which prints the graph once
//! and then every object that changes: no polling. Volumes are wpctl's
//! (cubic, as the mixer shows them); setting goes through `wpctl`. Devices
//! whose every route is unavailable (HDMI with nothing plugged, the headset
//! mic without a headset) are left out, like the reference.

use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::rc::Rc;
use std::time::Duration;

use futures_lite::{AsyncBufReadExt, StreamExt, io::BufReader};
use serde_json::{Value, json};
use tessela_service::process::{command, run};
use tessela_service::{Error, Result, Service, Timer, Topic};

use crate::Start;
use crate::util::round_to;

const SINK: &str = "@DEFAULT_AUDIO_SINK@";
const SOURCE: &str = "@DEFAULT_AUDIO_SOURCE@";

/// What we keep of a PipeWire node.
#[derive(Debug, Clone, Default)]
struct Node {
    class: String,
    name: String,
    app: Option<String>,
    description: Option<String>,
    nick: Option<String>,
    profile_description: Option<String>,
    form_factor: Option<String>,
    /// `"<device.id>:<card.profile.device>"`, as Python formats them.
    route_key: String,
    volumes: Vec<f64>,
    mute: bool,
}

/// What we keep of the whole graph.
#[derive(Default)]
struct Graph {
    nodes: BTreeMap<u64, Node>,
    /// device id → its EnumRoute entries: (available == "no", devices).
    routes: BTreeMap<u64, Vec<(bool, Vec<String>)>>,
    /// The `default` metadata object's id and its entries (key → name).
    defaults_id: Option<u64>,
    defaults: HashMap<String, String>,
}

fn s(v: &Value) -> Option<String> {
    match v {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

/// Python's `f"{x}"` of a props value (ints, strings, None).
fn py(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => "None".into(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

impl Graph {
    /// Take a batch; whether it touched anything the topics use (clients
    /// and ports come and go all the time).
    fn apply(&mut self, objects: &[Value]) -> bool {
        let mut relevant = false;
        for o in objects {
            let Some(id) = o["id"].as_u64() else { continue };
            let kind = o["type"].as_str();
            if o.get("info").is_some_and(Value::is_null) && kind.is_none() {
                // Removed.
                relevant |= self.nodes.remove(&id).is_some() | self.routes.remove(&id).is_some();
                if self.defaults_id == Some(id) {
                    relevant = true;
                    self.defaults_id = None;
                    self.defaults.clear();
                }
                continue;
            }
            if matches!(
                kind,
                Some(
                    "PipeWire:Interface:Node"
                        | "PipeWire:Interface:Device"
                        | "PipeWire:Interface:Metadata"
                ) | None
            ) {
                relevant = true;
            }
            match kind {
                Some("PipeWire:Interface:Node") => {
                    let info = &o["info"];
                    let p = &info["props"];
                    let props0 = &info["params"]["Props"][0];
                    let node = Node {
                        class: p["media.class"].as_str().unwrap_or("").into(),
                        name: p["node.name"].as_str().unwrap_or("").into(),
                        app: s(&p["application.name"]),
                        description: s(&p["node.description"]),
                        nick: s(&p["node.nick"]),
                        profile_description: s(&p["device.profile.description"]),
                        form_factor: s(&p["device.form-factor"]),
                        route_key: format!(
                            "{}:{}",
                            py(p.get("device.id")),
                            py(p.get("card.profile.device"))
                        ),
                        volumes: props0["channelVolumes"]
                            .as_array()
                            .map(|a| a.iter().filter_map(Value::as_f64).collect())
                            .unwrap_or_default(),
                        mute: props0["mute"].as_bool().unwrap_or(false),
                    };
                    if node.class.starts_with("Audio/") || node.class == "Stream/Output/Audio" {
                        self.nodes.insert(id, node);
                    } else {
                        self.nodes.remove(&id);
                    }
                }
                Some("PipeWire:Interface:Device") => {
                    let routes = o["info"]["params"]["EnumRoute"]
                        .as_array()
                        .map(|rs| {
                            rs.iter()
                                .map(|r| {
                                    let devices = r["devices"]
                                        .as_array()
                                        .map(|d| d.iter().map(|x| py(Some(x))).collect())
                                        .unwrap_or_default();
                                    (r["available"] == "no", devices)
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    self.routes.insert(id, routes);
                }
                Some("PipeWire:Interface:Metadata") | None if o.get("metadata").is_some() => {
                    let is_default = o["props"]["metadata.name"] == "default";
                    if !is_default && self.defaults_id != Some(id) {
                        continue;
                    }
                    self.defaults_id = Some(id);
                    // Updates may carry only the changed keys; null removes.
                    for e in o["metadata"].as_array().into_iter().flatten() {
                        let Some(key) = e["key"].as_str() else {
                            continue;
                        };
                        match e["value"]["name"].as_str() {
                            Some(name) => {
                                self.defaults.insert(key.into(), name.into());
                            }
                            None if e["value"].is_null() => {
                                self.defaults.remove(key);
                            }
                            None => {}
                        }
                    }
                }
                _ => {}
            }
        }
        relevant
    }

    /// Node names whose device routes are all unavailable.
    fn unavailable(&self) -> HashSet<&str> {
        let mut off: HashSet<String> = HashSet::new();
        for (id, routes) in &self.routes {
            // A node may serve several routes (speaker and headphones): one
            // available route is enough for it to count.
            for (no, devices) in routes {
                if *no {
                    off.extend(devices.iter().map(|d| format!("{id}:{d}")));
                }
            }
            for (no, devices) in routes {
                if !*no {
                    for d in devices {
                        off.remove(&format!("{id}:{d}"));
                    }
                }
            }
        }
        self.nodes
            .values()
            .filter(|n| off.contains(&n.route_key))
            .map(|n| n.name.as_str())
            .collect()
    }

    fn default_node(&self, key: &str, class: &str) -> Option<&Node> {
        let name = self.defaults.get(key)?;
        self.nodes
            .values()
            .find(|n| &n.name == name && n.class == class)
    }

    /// What `wpctl get-volume` says: the cubic volume (2 decimals) and mute.
    fn level(node: &Node) -> (f64, bool) {
        let n = node.volumes.len().max(1) as f64;
        let avg = node.volumes.iter().sum::<f64>() / n;
        (round_to(avg.cbrt(), 2), node.mute)
    }

    fn state(&self) -> Value {
        let Some(sink) = self.default_node("default.audio.sink", "Audio/Sink") else {
            return Value::Null;
        };
        let (volume, muted) = Self::level(sink);
        let (mic, mic_muted) = self
            .default_node("default.audio.source", "Audio/Source")
            .map_or((0.0, false), Self::level);
        json!({"volume": volume, "muted": muted, "micVolume": mic, "micMuted": mic_muted})
    }

    fn devices(&self) -> Value {
        let off = self.unavailable();
        let (mut sinks, mut sources, mut streams) = (vec![], vec![], vec![]);
        for (id, n) in &self.nodes {
            if n.class == "Stream/Output/Audio" {
                let app = n
                    .app
                    .clone()
                    .or_else(|| n.description.clone())
                    .or_else(|| (!n.name.is_empty()).then(|| n.name.clone()))
                    .unwrap_or_else(|| "app".into());
                let loudest = n
                    .volumes
                    .iter()
                    .cloned()
                    .fold(None, |m: Option<f64>, v| Some(m.map_or(v, |m| m.max(v))));
                streams.push(json!({"id": id, "app": app, "volume": round_to(loudest.unwrap_or(0.0).cbrt(), 2)}));
                continue;
            }
            let lower = n.name.to_lowercase();
            if !(n.class == "Audio/Sink" || n.class == "Audio/Source")
                || lower.ends_with("monitor")
                || lower.contains("dummy")
                || lower.contains("null-sink")
            {
                continue;
            }
            let is_sink = n.class == "Audio/Sink";
            let key = if is_sink {
                "default.audio.sink"
            } else {
                "default.audio.source"
            };
            let default = self.defaults.get(key) == Some(&n.name);
            if off.contains(n.name.as_str()) && !default {
                continue;
            }
            let label = n
                .profile_description
                .clone()
                .or_else(|| n.nick.clone())
                .or_else(|| n.description.clone())
                .unwrap_or_else(|| n.name.clone());
            let form = n.form_factor.clone().unwrap_or_default();
            let d = json!({
                "id": id,
                "name": label.to_lowercase(),
                "headphones": form.contains("head") || lower.contains("headphone"),
                "default": default,
            });
            if is_sink {
                sinks.push(d)
            } else {
                sources.push(d)
            }
        }
        json!({"sinks": sinks, "sources": sources, "streams": streams})
    }
}

/// Follow `pw-dump --monitor`: each top-level JSON array (pretty-printed,
/// closed by a `]` alone on a line) is a batch of objects.
async fn monitor(graph: Rc<RefCell<Graph>>, state: Topic<Value>, devices: Topic<Value>) {
    loop {
        let mut cmd = command(&["pw-dump", "--monitor", "--no-colors"]);
        cmd.stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        match cmd.spawn() {
            Ok(mut child) => {
                *graph.borrow_mut() = Graph::default();
                let out = child.stdout.take().expect("piped");
                let mut lines = BufReader::new(out).lines();
                let mut batch = String::new();
                while let Some(Ok(line)) = lines.next().await {
                    let end = line == "]"
                        || (batch.is_empty() && line.starts_with('[') && line.ends_with(']'));
                    batch.push_str(&line);
                    batch.push('\n');
                    if !end {
                        continue;
                    }
                    match serde_json::from_str::<Vec<Value>>(&batch) {
                        Ok(objects) => {
                            let mut g = graph.borrow_mut();
                            if g.apply(&objects) {
                                state.publish(g.state());
                                devices.publish(g.devices());
                            }
                        }
                        Err(e) => eprintln!("audio: pw-dump batch: {e}"),
                    }
                    batch.clear();
                }
                let _ = child.status().await;
                eprintln!("audio: pw-dump exited");
            }
            Err(e) => eprintln!("audio: pw-dump: {e}"),
        }
        state.publish(Value::Null);
        Timer::after(Duration::from_secs(2)).await;
    }
}

fn arg_f64(args: &Value, key: &str) -> Result<f64> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(0.0),
        Some(v) => v
            .as_f64()
            .ok_or_else(|| Error::msg(format!("{key}: not a number"))),
    }
}

fn arg_id(args: &Value) -> Result<String> {
    let id = args.get("id").ok_or("'id'")?;
    id.as_f64()
        .map(|f| (f.trunc() as i64).to_string())
        .ok_or_else(|| Error::msg(format!("bad id {id}")))
}

async fn set_volume(target: &str, value: f64) -> f64 {
    let value = value.clamp(0.0, 1.0);
    run(
        &["wpctl", "set-volume", target, &format!("{value:.2}")],
        Duration::from_secs(5),
    )
    .await;
    value
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("audio");
    let state = svc.topic("state", Value::Null);
    let devices = svc.topic(
        "devices",
        json!({"sinks": [], "sources": [], "streams": []}),
    );
    let t = Duration::from_secs(5);

    let st = state.clone();
    svc.method("change", move |args: Value| {
        let st = st.clone();
        async move {
            let delta = match args.get("delta") {
                Some(d) if !d.is_null() => d.as_f64().ok_or("delta: not a number")?,
                _ => 0.05 * args["event"]["delta"].as_f64().unwrap_or(0.0),
            };
            let current = st.get()["volume"].as_f64().unwrap_or(0.0);
            Ok(set_volume(SINK, current + delta).await)
        }
    });
    let st = state.clone();
    svc.method("set", move |args: Value| {
        let st = st.clone();
        async move {
            if st.get()["muted"] == true {
                run(&["wpctl", "set-mute", SINK, "0"], t).await;
            }
            Ok(set_volume(SINK, arg_f64(&args, "value")?).await)
        }
    });
    svc.method("toggle_mute", move |_: Value| async move {
        run(&["wpctl", "set-mute", SINK, "toggle"], t).await;
        Ok(())
    });
    svc.method("set_mic", |args: Value| async move {
        Ok(set_volume(SOURCE, arg_f64(&args, "value")?).await)
    });
    svc.method("toggle_mic_mute", move |_: Value| async move {
        run(&["wpctl", "set-mute", SOURCE, "toggle"], t).await;
        Ok(())
    });
    svc.method("set_default", move |args: Value| async move {
        run(&["wpctl", "set-default", &arg_id(&args)?], t).await;
        Ok(())
    });
    svc.method("set_stream", |args: Value| async move {
        let id = arg_id(&args)?;
        Ok(set_volume(&id, arg_f64(&args, "value")?).await)
    });

    let graph = Rc::new(RefCell::new(Graph::default()));
    (svc, Box::pin(monitor(graph, state, devices)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graph_from_a_dump_and_updates() {
        let mut g = Graph::default();
        g.apply(&serde_json::from_value::<Vec<Value>>(json!([
            {"id": 30, "type": "PipeWire:Interface:Device", "info": {"params": {"EnumRoute": [
                {"available": "no", "devices": [1]}, {"available": "yes", "devices": [2]}]}}},
            {"id": 40, "type": "PipeWire:Interface:Metadata", "props": {"metadata.name": "default"},
             "metadata": [{"subject": 0, "key": "default.audio.sink", "value": {"name": "spk"}},
                          {"subject": 0, "key": "default.audio.source", "value": {"name": "mic"}}]},
            {"id": 57, "type": "PipeWire:Interface:Node", "info": {"props": {"media.class": "Audio/Sink",
                "node.name": "spk", "device.id": 30, "card.profile.device": 2, "device.profile.description": "Speaker"},
                "params": {"Props": [{"channelVolumes": [0.493026, 0.493026], "mute": false}]}}},
            {"id": 56, "type": "PipeWire:Interface:Node", "info": {"props": {"media.class": "Audio/Sink",
                "node.name": "hdmi", "device.id": 30, "card.profile.device": 1, "node.description": "HDMI"},
                "params": {"Props": [{"channelVolumes": [1.0], "mute": false}]}}},
            {"id": 59, "type": "PipeWire:Interface:Node", "info": {"props": {"media.class": "Audio/Source",
                "node.name": "mic", "node.nick": "Mic", "device.form-factor": "headset"},
                "params": {"Props": [{"channelVolumes": [1.0], "mute": true}]}}},
            {"id": 80, "type": "PipeWire:Interface:Node", "info": {"props": {"media.class": "Stream/Output/Audio",
                "node.name": "x", "application.name": "Firefox"},
                "params": {"Props": [{"channelVolumes": [0.125, 0.064]}]}}},
            {"id": 81, "type": "PipeWire:Interface:Node", "info": {"props": {"media.class": "Audio/Sink",
                "node.name": "spk.monitor"}, "params": {}}},
        ]))
        .unwrap());
        assert_eq!(
            g.state(),
            json!({"volume": 0.79, "muted": false, "micVolume": 1.0, "micMuted": true})
        );
        assert_eq!(
            g.devices(),
            json!({
                "sinks": [{"id": 57, "name": "speaker", "headphones": false, "default": true}],
                "sources": [{"id": 59, "name": "mic", "headphones": true, "default": true}],
                "streams": [{"id": 80, "app": "Firefox", "volume": 0.5}],
            })
        );
        // An update replaces the node; a removal drops the stream; a
        // partial metadata update moves the default.
        g.apply(&serde_json::from_value::<Vec<Value>>(json!([
            {"id": 57, "type": "PipeWire:Interface:Node", "info": {"props": {"media.class": "Audio/Sink",
                "node.name": "spk", "device.id": 30, "card.profile.device": 2},
                "params": {"Props": [{"channelVolumes": [0.0], "mute": true}]}}},
            {"id": 80, "info": null},
            {"id": 40, "metadata": [{"subject": 0, "key": "default.audio.source", "value": null}]},
        ]))
        .unwrap());
        assert_eq!(
            g.state(),
            json!({"volume": 0.0, "muted": true, "micVolume": 0.0, "micMuted": false})
        );
        assert_eq!(g.devices()["streams"], json!([]));
    }
}
