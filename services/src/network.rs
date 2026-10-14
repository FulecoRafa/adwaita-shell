//! network: wifi, wired and bluetooth, from NetworkManager and BlueZ.
//!
//! topic  state      {"online", "wired", "wifiEnabled", "strength": 0..1, "ssid", "ip",
//!                    "bluetooth": {"present", "enabled", "connected": [names]}} | null
//! topic  wifi       [{"ssid", "strength": 0..1, "security": "wpa2"|"wpa3"|"aberta"|...,
//!                     "secure", "connected", "known"}]  strongest first, the active one on top
//! topic  bluetooth  {"discovering": bool, "devices": [{"address", "name", "paired", "connected",
//!                     "trusted", "battery": 0..100 | -1}]}  paired first, then (while
//!                    discovering) named devices nearby
//! call   set_wifi       {"enabled": bool}
//! call   set_bluetooth  {"enabled": bool}
//! call   scan           rescan wifi networks
//! call   connect        {"ssid", "password"?}   -> error text on failure
//! call   disconnect     {"ssid"}
//! call   forget         {"ssid"}
//! call   discover       {"on": bool}             bluetooth discovery (stops by itself after 60 s)
//! call   bt             {"action": "connect"|"disconnect"|"pair"|"cancel"|"forget", "address"}
//!
//! Reads come from the system bus (one GetManagedObjects each from
//! NetworkManager and BlueZ), again whenever either signals anything
//! (coalesced), and every 2 min as a safety net. Actions go through `nmcli`
//! and `bluetoothctl`, like before, for their agents and error messages.

use std::cell::{Cell, RefCell};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::rc::Rc;
use std::time::Duration;

use futures_lite::StreamExt;
use serde_json::{Value, json};
use tessela_service::dbus::{self, zbus};
use tessela_service::process::{command, run, run_status};
use tessela_service::{Error, Result, Service, Task, Timer, Topic, Wake, spawn};
use zbus::Connection;
use zbus::zvariant::{OwnedObjectPath, OwnedValue, Value as Variant};

use crate::Start;

const NM: &str = "org.freedesktop.NetworkManager";
const BLUEZ: &str = "org.bluez";

type Props = HashMap<String, OwnedValue>;
type Objects = HashMap<OwnedObjectPath, HashMap<String, Props>>;

async fn managed(conn: &Connection, name: &str, path: &str) -> zbus::Result<Objects> {
    conn.call_method(
        Some(name),
        path,
        Some("org.freedesktop.DBus.ObjectManager"),
        "GetManagedObjects",
        &(),
    )
    .await?
    .body()
    .deserialize()
}

fn prop<'a>(
    objs: &'a Objects,
    path: &str,
    iface: &str,
    name: &str,
) -> Option<&'a Variant<'static>> {
    let p = objs
        .iter()
        .find(|(k, _)| k.as_str() == path)?
        .1
        .get(iface)?
        .get(name)?;
    Some(p)
}

fn as_bool(v: Option<&Variant>) -> bool {
    matches!(v, Some(Variant::Bool(true)))
}

fn as_u32(v: Option<&Variant>) -> u32 {
    match v {
        Some(Variant::U32(x)) => *x,
        Some(Variant::U8(x)) => *x as u32,
        _ => 0,
    }
}

fn as_str(v: Option<&Variant>) -> String {
    match v {
        Some(Variant::Str(s)) => s.to_string(),
        Some(Variant::ObjectPath(p)) => p.to_string(),
        _ => String::new(),
    }
}

fn as_paths(v: Option<&Variant>) -> Vec<String> {
    match v {
        Some(Variant::Array(a)) => a.iter().map(|x| as_str(Some(x))).collect(),
        _ => Vec::new(),
    }
}

fn as_bytes(v: Option<&Variant>) -> Vec<u8> {
    match v {
        Some(Variant::Array(a)) => a
            .iter()
            .filter_map(|x| match x {
                Variant::U8(b) => Some(*b),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

// NM_802_11_AP_FLAGS / NM_802_11_AP_SEC_* bits.
const PRIVACY: u32 = 0x1;
const KEY_MGMT_PSK: u32 = 0x100;
const KEY_MGMT_802_1X: u32 = 0x200;
const KEY_MGMT_SAE: u32 = 0x400;
const KEY_MGMT_OWE: u32 = 0x800;
const KEY_MGMT_OWE_TM: u32 = 0x1000;
const KEY_MGMT_EAP_SUITE_B_192: u32 = 0x2000;

/// What `nmcli`'s SECURITY column would say, reduced like before.
fn security(flags: u32, wpa: u32, rsn: u32) -> &'static str {
    if rsn & (KEY_MGMT_OWE | KEY_MGMT_OWE_TM) != 0 {
        "aberta · owe"
    } else if (wpa | rsn) & (KEY_MGMT_802_1X | KEY_MGMT_EAP_SUITE_B_192) != 0 {
        "enterprise"
    } else if rsn & KEY_MGMT_SAE != 0 {
        "wpa3"
    } else if rsn & KEY_MGMT_PSK != 0 {
        "wpa2"
    } else if wpa != 0 {
        "wpa"
    } else if flags & PRIVACY != 0 && rsn == 0 {
        "wep"
    } else if rsn != 0 || flags & PRIVACY != 0 {
        "protegida"
    } else {
        "aberta"
    }
}

/// The wifi list and the network part of `state`, from NetworkManager.
async fn read_nm(conn: &Connection) -> (Value, Value) {
    let nm_path = "/org/freedesktop/NetworkManager";
    let objs = managed(conn, NM, "/org/freedesktop")
        .await
        .unwrap_or_default();
    let root = |n: &str| prop(&objs, nm_path, NM, n);
    let wifi_on = as_bool(root("WirelessEnabled"));
    let dev = |p: &str, n: &str| prop(&objs, p, "org.freedesktop.NetworkManager.Device", n);
    let devices = as_paths(root("Devices"));

    let wired = devices.iter().any(|d| {
        let kind = as_u32(dev(d, "DeviceType"));
        let state = as_u32(dev(d, "State"));
        let active = as_str(dev(d, "ActiveConnection"));
        // nmcli's plain "connected", not "connected (externally)".
        let external = as_u32(prop(
            &objs,
            &active,
            "org.freedesktop.NetworkManager.Connection.Active",
            "StateFlags",
        )) & 0x80
            != 0;
        matches!(kind, 1 | 20) && state == 100 && !external
    });
    let wifi_devices: Vec<&String> = devices
        .iter()
        .filter(|d| as_u32(dev(d, "DeviceType")) == 2)
        .collect();

    // Saved wifi connections, by name.
    let mut known = HashSet::new();
    for path in as_paths(prop(
        &objs,
        "/org/freedesktop/NetworkManager/Settings",
        "org.freedesktop.NetworkManager.Settings",
        "Connections",
    )) {
        let settings: Option<HashMap<String, Props>> = async {
            conn.call_method(
                Some(NM),
                path.as_str(),
                Some("org.freedesktop.NetworkManager.Settings.Connection"),
                "GetSettings",
                &(),
            )
            .await
            .ok()?
            .body()
            .deserialize()
            .ok()
        }
        .await;
        if let Some(c) = settings.as_ref().and_then(|s| s.get("connection"))
            && as_str(c.get("type").map(|v| &**v)) == "802-11-wireless"
        {
            known.insert(as_str(c.get("id").map(|v| &**v)));
        }
    }

    // One row per name: the access point in use, else the strongest.
    let mut order: Vec<String> = Vec::new();
    let mut networks: HashMap<String, Value> = HashMap::new();
    if wifi_on {
        for d in &wifi_devices {
            let wireless = |n: &str| {
                prop(
                    &objs,
                    d,
                    "org.freedesktop.NetworkManager.Device.Wireless",
                    n,
                )
            };
            let active_ap = as_str(wireless("ActiveAccessPoint"));
            for ap in as_paths(wireless("AccessPoints")) {
                let a = |n: &str| prop(&objs, &ap, "org.freedesktop.NetworkManager.AccessPoint", n);
                let ssid = String::from_utf8_lossy(&as_bytes(a("Ssid"))).into_owned();
                if ssid.is_empty() {
                    continue;
                }
                let sec = security(
                    as_u32(a("Flags")),
                    as_u32(a("WpaFlags")),
                    as_u32(a("RsnFlags")),
                );
                let strength = match a("Strength") {
                    Some(Variant::U8(s)) => *s as f64 / 100.0,
                    _ => 0.0,
                };
                let net = json!({
                    "ssid": ssid,
                    "strength": strength,
                    "security": sec,
                    "secure": !matches!(sec, "aberta" | "aberta · owe"),
                    "connected": ap == active_ap,
                    "known": known.contains(&ssid),
                });
                match networks.get(&ssid) {
                    None => {
                        order.push(ssid.clone());
                        networks.insert(ssid, net);
                    }
                    Some(old)
                        if net["connected"] == true
                            || (old["connected"] != true
                                && strength > old["strength"].as_f64().unwrap_or(0.0)) =>
                    {
                        networks.insert(ssid, net);
                    }
                    Some(_) => {}
                }
            }
        }
    }
    let mut listed: Vec<Value> = order
        .into_iter()
        .filter_map(|s| networks.remove(&s))
        .collect();
    listed.sort_by(|a, b| {
        let key = |n: &Value| {
            (
                n["connected"] != true,
                -n["strength"].as_f64().unwrap_or(0.0),
            )
        };
        key(a)
            .partial_cmp(&key(b))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let active = listed.iter().find(|n| n["connected"] == true).cloned();
    let mut ip = String::new();
    if let (Some(d), Some(_)) = (wifi_devices.first(), &active) {
        let cfg = as_str(dev(d, "Ip4Config"));
        if let Some(v) = prop(
            &objs,
            &cfg,
            "org.freedesktop.NetworkManager.IP4Config",
            "AddressData",
        ) && let Ok(v) = v.try_clone()
            && let Ok(list) = Vec::<HashMap<String, OwnedValue>>::try_from(v)
            && let Some(first) = list.first()
        {
            ip = as_str(first.get("address").map(|v| &**v));
        }
    }
    let state = json!({
        "online": wired || active.is_some(),
        "wired": wired,
        "wifiEnabled": wifi_on,
        "strength": active.as_ref().map_or(json!(0.0), |a| a["strength"].clone()),
        "ssid": active.as_ref().map_or(json!(""), |a| a["ssid"].clone()),
        "ip": ip,
    });
    (json!(listed), state)
}

/// BlueZ: the `bluetooth` part of `state`, and the devices.
async fn read_bluez(conn: &Connection, discovering: bool) -> (Value, Value) {
    let Ok(objs) = managed(conn, BLUEZ, "/").await else {
        return (
            json!({"present": false, "enabled": false, "connected": []}),
            json!({"discovering": false, "devices": []}),
        );
    };
    let sorted: BTreeMap<&str, &HashMap<String, Props>> =
        objs.iter().map(|(k, v)| (k.as_str(), v)).collect();
    let Some((adapter, ifaces)) = sorted
        .iter()
        .find(|(_, i)| i.contains_key("org.bluez.Adapter1"))
    else {
        return (
            json!({"present": false, "enabled": false, "connected": []}),
            json!({"discovering": false, "devices": []}),
        );
    };
    let enabled = as_bool(ifaces["org.bluez.Adapter1"].get("Powered").map(|v| &**v));
    let mut paired = Vec::new();
    let mut nearby = Vec::new();
    let mut connected = Vec::new();
    for ifaces in sorted.values() {
        let Some(d) = ifaces.get("org.bluez.Device1") else {
            continue;
        };
        let get = |n: &str| d.get(n).map(|v| &**v);
        if as_str(get("Adapter")) != *adapter {
            continue;
        }
        let address = as_str(get("Address"));
        let alias = as_str(get("Alias"));
        let is_connected = as_bool(get("Connected"));
        if enabled && is_connected {
            connected.push(alias.clone());
        }
        if as_bool(get("Paired")) {
            let battery = match ifaces
                .get("org.bluez.Battery1")
                .and_then(|b| b.get("Percentage"))
                .map(|v| &**v)
            {
                Some(Variant::U8(p)) => *p as i64,
                _ => -1,
            };
            paired.push(json!({
                "address": address,
                "name": if alias.is_empty() { address.clone() } else { alias },
                "paired": true,
                "connected": is_connected,
                "trusted": as_bool(get("Trusted")),
                "battery": battery,
            }));
        } else if discovering && !alias.is_empty() && alias.replace('-', ":") != address {
            // Unnamed devices show their address with dashes as the name.
            nearby.push(json!({"address": address, "name": alias, "paired": false, "connected": false, "trusted": false, "battery": -1}));
        }
    }
    paired.extend(nearby);
    (
        json!({"present": true, "enabled": enabled, "connected": connected}),
        json!({"discovering": discovering, "devices": paired}),
    )
}

#[derive(Clone)]
struct Net {
    state: Topic<Value>,
    wifi: Topic<Value>,
    bt: Topic<Value>,
    wake: Wake,
    discovery: Rc<RefCell<Option<Task<()>>>>,
    discovering: Rc<Cell<bool>>,
}

impl Net {
    async fn read(&self, conn: &Connection) {
        let (wifi, mut state) = read_nm(conn).await;
        let (summary, bt) = read_bluez(conn, self.discovering.get()).await;
        state["bluetooth"] = summary;
        self.wifi.publish(wifi);
        self.state.publish(state);
        self.bt.publish(bt);
    }

    async fn run(self) {
        let conn = match dbus::system().await {
            Ok(c) => c,
            Err(e) => {
                eprintln!("network: system bus: {e}");
                return;
            }
        };
        for name in [NM, BLUEZ] {
            match dbus::signals_from(&conn, name).await {
                Ok(mut changes) => {
                    let wake = self.wake.clone();
                    spawn(async move {
                        while changes.next().await.is_some() {
                            wake.wake();
                        }
                    })
                    .detach();
                }
                Err(e) => eprintln!("network: watching {name}: {e}"),
            }
        }
        loop {
            self.read(&conn).await;
            if self.wake.wait_for(Duration::from_secs(120)).await {
                // A burst of signals (a scan, a connection coming up): one read.
                Timer::after(Duration::from_millis(300)).await;
            }
        }
    }
}

fn arg_str(args: &Value, key: &str) -> Result<String> {
    match args.get(key) {
        Some(Value::String(s)) => Ok(s.clone()),
        Some(Value::Null) | None => Err(Error::msg(format!("'{key}'"))),
        Some(other) => Ok(other.to_string()),
    }
}

fn truthy(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64() != Some(0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
        _ => false,
    }
}

fn valid_address(a: &str) -> bool {
    let parts: Vec<&str> = a.split(':').collect();
    parts.len() == 6
        && parts
            .iter()
            .all(|p| p.len() == 2 && p.bytes().all(|b| b.is_ascii_hexdigit()))
}

fn contains_any(text: &str, words: &[&str]) -> bool {
    let t = text.to_lowercase();
    words.iter().any(|w| t.contains(w))
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("network");
    let net = Net {
        state: svc.topic("state", Value::Null),
        wifi: svc.topic("wifi", json!([])),
        bt: svc.topic("bluetooth", json!({"discovering": false, "devices": []})),
        wake: Wake::new(),
        discovery: Rc::default(),
        discovering: Rc::default(),
    };
    let t5 = Duration::from_secs(5);

    let w = net.wake.clone();
    svc.method("set_wifi", move |args: Value| {
        let w = w.clone();
        async move {
            let on = if truthy(args.get("enabled")) {
                "on"
            } else {
                "off"
            };
            run(&["nmcli", "radio", "wifi", on], t5).await;
            w.wake();
            Ok(())
        }
    });
    let w = net.wake.clone();
    svc.method("set_bluetooth", move |args: Value| {
        let w = w.clone();
        async move {
            let on = if truthy(args.get("enabled")) {
                "on"
            } else {
                "off"
            };
            run(&["bluetoothctl", "power", on], t5).await;
            w.wake();
            Ok(())
        }
    });
    let w = net.wake.clone();
    svc.method("scan", move |_: Value| {
        let w = w.clone();
        async move {
            run(
                &["nmcli", "device", "wifi", "rescan"],
                Duration::from_secs(15),
            )
            .await;
            w.wake();
            Ok(())
        }
    });
    let n = net.clone();
    svc.method("connect", move |args: Value| {
        let n = n.clone();
        async move {
            let ssid = arg_str(&args, "ssid")?;
            let password = args
                .get("password")
                .filter(|p| truthy(Some(p)))
                .map(|p| match p {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                });
            let known = n.wifi.get().as_array().is_some_and(|l| {
                l.iter()
                    .any(|w| w["ssid"] == ssid.as_str() && w["known"] == true)
            });
            let t = Duration::from_secs(45);
            let result = match (&password, known) {
                (None, true) => run_status(&["nmcli", "connection", "up", "id", &ssid], t).await,
                (Some(p), _) => {
                    run_status(
                        &["nmcli", "device", "wifi", "connect", &ssid, "password", p],
                        t,
                    )
                    .await
                }
                (None, false) => {
                    run_status(&["nmcli", "device", "wifi", "connect", &ssid], t).await
                }
            };
            n.wake.wake();
            Ok(match result {
                Ok(_) => "",
                Err(out) if contains_any(&out, &["secrets", "password", "802-1x", "psk"]) => {
                    "senha incorreta"
                }
                Err(out) if contains_any(&out, &["not found", "no network"]) => {
                    "rede fora de alcance"
                }
                Err(out) if contains_any(&out, &["timeout"]) => "tempo esgotado na autenticação",
                Err(_) => "não foi possível conectar",
            })
        }
    });
    for (method, verb) in [("disconnect", "down"), ("forget", "delete")] {
        let w = net.wake.clone();
        svc.method(method, move |args: Value| {
            let w = w.clone();
            async move {
                let ssid = arg_str(&args, "ssid")?;
                run(&["nmcli", "connection", verb, "id", &ssid], t5).await;
                w.wake();
                Ok(())
            }
        });
    }
    let n = net.clone();
    svc.method("discover", move |args: Value| {
        let n = n.clone();
        async move {
            // Dropping the task kills a running scan.
            n.discovery.borrow_mut().take();
            n.discovering.set(false);
            if truthy(args.get("on")) {
                let mut cmd = command(&["bluetoothctl", "--timeout", "60", "scan", "on"]);
                cmd.stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null());
                let mut child = cmd.spawn()?;
                n.discovering.set(true);
                let (flag, wake) = (n.discovering.clone(), n.wake.clone());
                let task = spawn(async move {
                    // New devices show up as BlueZ signals while it runs.
                    let _ = child.status().await;
                    flag.set(false);
                    wake.wake();
                });
                *n.discovery.borrow_mut() = Some(task);
            }
            n.wake.wake();
            Ok(())
        }
    });
    let w = net.wake.clone();
    svc.method("bt", move |args: Value| {
        let w = w.clone();
        async move {
            let address = match args.get("address") {
                Some(Value::String(s)) => s.clone(),
                None | Some(Value::Null) => String::new(),
                Some(other) => other.to_string(),
            };
            if !valid_address(&address) {
                return Err(Error::msg(format!("bad address '{address}'")));
            }
            let action = args.get("action").and_then(Value::as_str).unwrap_or("");
            let command = match action {
                "connect" => "connect",
                "disconnect" => "disconnect",
                "pair" => "pair",
                "cancel" => "cancel-pairing",
                "forget" => "remove",
                _ => {
                    let shown = match args.get("action") {
                        Some(Value::String(s)) => format!("'{s}'"),
                        None | Some(Value::Null) => "None".into(),
                        Some(other) => other.to_string(),
                    };
                    return Err(Error::msg(format!("unknown action {shown}")));
                }
            };
            let result = if action == "pair" {
                // Trusted, so it reconnects by itself later.
                let r = run_status(
                    &["bluetoothctl", "--timeout", "30", "pair", &address],
                    Duration::from_secs(40),
                )
                .await;
                if r.is_ok() {
                    run(&["bluetoothctl", "trust", &address], t5).await;
                    run(
                        &["bluetoothctl", "connect", &address],
                        Duration::from_secs(20),
                    )
                    .await;
                }
                r
            } else {
                run_status(
                    &["bluetoothctl", command, &address],
                    Duration::from_secs(20),
                )
                .await
            };
            w.wake();
            Ok(match result {
                Ok(_) => String::new(),
                Err(out) => out.lines().last().map_or("falhou".into(), str::to_string),
            })
        }
    });

    (svc, Box::pin(net.run()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn security_like_nmcli_reduced() {
        assert_eq!(security(0, 0, 0), "aberta");
        assert_eq!(security(1, 0, 0), "wep");
        assert_eq!(security(1, 0, 0x188), "wpa2");
        assert_eq!(security(1, 0x188, 0x188), "wpa2");
        assert_eq!(security(1, 0x188, 0), "wpa");
        assert_eq!(security(1, 0, 0x400 | 0x100), "wpa3");
        assert_eq!(security(1, 0, 0x200), "enterprise");
        assert_eq!(security(0, 0, 0x800), "aberta · owe");
    }

    #[test]
    fn addresses() {
        assert!(valid_address("AC:5A:fc:B1:D8:56"));
        assert!(!valid_address("AC:5A:FC:B1:D8"));
        assert!(!valid_address("../../x"));
    }
}
