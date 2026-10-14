//! media: the active MPRIS player, over D-Bus.
//!
//! topic  player   {"instance", "identity", "title", "artist", "album", "art", "artUrl",
//!                  "playing", "position": s, "length": s, "rate", "at": ms} | null
//! topic  players  [{"instance", "identity", "playing"}]
//! call   play_pause · next · previous · seek {position: s} · choose {instance}
//!
//! With several players it shows the one that started playing last, like
//! the reference; `choose` pins one until another starts playing or it goes
//! away. Players come and go with their `org.mpris.MediaPlayer2.*` names;
//! metadata, status and rate follow their PropertiesChanged signals, and a
//! seek their Seeked signal. MPRIS does not announce the position while
//! playing: it is read on track or status changes, after a seek, and once a
//! second while something plays, but only published when it drifted from
//! what `position + rate × (now − at)` predicts (the UI advances it by
//! itself between reports). Nothing runs while nothing plays.
//!
//! `art` is an image source the renderer may show, "" until there is one.
//! Every `mpris:artUrl` (local files, Chromium's extension-less temp files,
//! http(s) and data: URLs) is copied to ~/.cache/tessela/adwaita-shell/art/
//! ($XDG_CACHE_HOME), named by its content with the extension of its real
//! format; the newest 64 are kept.

use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::rc::Rc;
use std::time::{Duration, SystemTime};

use futures_lite::{StreamExt, future};
use serde_json::{Value, json};
use tessela_service::dbus::{self, zbus};
use tessela_service::{Error, Result, Service, Timer, Topic, Wake, spawn, unblock};
use zbus::message::Type;
use zbus::zvariant::{OwnedValue, Value as Variant};
use zbus::{Connection, MatchRule};

use crate::Start;
use crate::util::{now_ms, round_to};

const PREFIX: &str = "org.mpris.MediaPlayer2.";
const PATH: &str = "/org/mpris/MediaPlayer2";
const PLAYER: &str = "org.mpris.MediaPlayer2.Player";
const MAX_BYTES: usize = 8 << 20;
const KEEP: usize = 64;
/// Publish a periodic position only if it is this far from the prediction.
const DRIFT: f64 = 0.5;

fn art_dir() -> PathBuf {
    crate::util::cache_dir().join("tessela/adwaita-shell/art")
}

/// What playerctl's format line carried for one player.
#[derive(Debug, Clone, PartialEq, Default)]
struct Track {
    name: String,
    status: String,
    title: String,
    artist: String,
    album: String,
    art: String,
    /// mpris:length, µs.
    length: i64,
    trackid: Option<String>,
}

struct Player {
    bus: String,
    track: Track,
    rate: f64,
}

#[derive(Default)]
struct Media {
    players: BTreeMap<String, Player>,
    /// unique bus name → instances it owns
    owners: HashMap<String, Vec<String>>,
    /// Who started playing last, first.
    recent: Vec<String>,
    /// Chosen by hand ("" = automatic).
    pinned: String,
    /// The instance the topic describes.
    instance: String,
    /// cover key → image source ("" when it cannot be shown).
    covers: HashMap<String, String>,
}

fn unwrap_variant<'a>(v: &'a Variant<'a>) -> &'a Variant<'a> {
    match v {
        Variant::Value(inner) => unwrap_variant(inner),
        other => other,
    }
}

fn v_str(v: Option<&OwnedValue>) -> String {
    match v.map(|v| unwrap_variant(v)) {
        Some(Variant::Str(s)) => s.to_string(),
        Some(Variant::ObjectPath(p)) => p.to_string(),
        Some(Variant::Array(a)) => a
            .iter()
            .filter_map(|x| match unwrap_variant(x) {
                Variant::Str(s) => Some(s.to_string()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join(", "),
        _ => String::new(),
    }
}

fn v_i64(v: Option<&OwnedValue>) -> Option<i64> {
    Some(match unwrap_variant(v?) {
        Variant::I64(x) => *x,
        Variant::U64(x) => *x as i64,
        Variant::I32(x) => *x as i64,
        Variant::U32(x) => *x as i64,
        Variant::I16(x) => *x as i64,
        Variant::U16(x) => *x as i64,
        Variant::U8(x) => *x as i64,
        Variant::F64(x) => *x as i64,
        _ => return None,
    })
}

fn v_f64(v: Option<&OwnedValue>) -> Option<f64> {
    match unwrap_variant(v?) {
        Variant::F64(x) => Some(*x),
        _ => v_i64(v).map(|x| x as f64),
    }
}

/// Apply Player properties (from GetAll or PropertiesChanged) to a track.
fn apply(track: &mut Track, rate: &mut f64, props: &HashMap<String, OwnedValue>) {
    if let Some(s) = props.get("PlaybackStatus") {
        track.status = v_str(Some(s));
    }
    if let Some(r) = v_f64(props.get("Rate")) {
        *rate = r;
    }
    if let Some(m) = props.get("Metadata") {
        let meta: HashMap<String, OwnedValue> = m
            .try_clone()
            .ok()
            .and_then(|m| HashMap::try_from(m).ok())
            .unwrap_or_default();
        track.title = v_str(meta.get("xesam:title"));
        track.artist = v_str(meta.get("xesam:artist"));
        track.album = v_str(meta.get("xesam:album"));
        track.art = v_str(meta.get("mpris:artUrl"));
        track.length = v_i64(meta.get("mpris:length")).unwrap_or(0);
        track.trackid = meta
            .get("mpris:trackid")
            .map(|t| v_str(Some(t)))
            .filter(|t| !t.is_empty());
    }
}

// ---------------------------------------------------------------- covers

/// Extension of an image by its first bytes, "" if not one we draw.
fn sniff(data: &[u8]) -> &'static str {
    if data.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if data.starts_with(b"\xff\xd8\xff") {
        "jpg"
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        "gif"
    } else if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        "webp"
    } else if data.starts_with(b"BM") {
        "bmp"
    } else {
        ""
    }
}

fn percent_decode(s: &str) -> Vec<u8> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%'
            && i + 2 < b.len()
            && let Ok(x) =
                u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("zz"), 16)
        {
            out.push(x);
            i += 3;
            continue;
        }
        out.push(b[i]);
        i += 1;
    }
    out
}

/// The local path of a file: URL (`file:///a%20b`, `file://localhost/a`).
fn file_path(url: &str) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStringExt;
    let rest = url.strip_prefix("file:")?;
    let path = match rest.strip_prefix("//") {
        Some(r) => &r[r.find('/')?..],
        None => rest,
    };
    let path = path.split(['?', '#']).next().unwrap_or(path);
    Some(PathBuf::from(std::ffi::OsString::from_vec(percent_decode(
        path,
    ))))
}

/// The bytes behind an artUrl (blocking).
fn read_url(url: &str) -> std::result::Result<Vec<u8>, String> {
    if let Some(path) = file_path(url) {
        let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.len() > MAX_BYTES as u64 {
            return Ok(Vec::new());
        }
        return std::fs::read(&path).map_err(|e| e.to_string());
    }
    if url.starts_with("http://") || url.starts_with("https://") {
        let mut resp = ureq::get(url)
            .header("User-Agent", "adwaita-shell")
            .config()
            .timeout_global(Some(Duration::from_secs(10)))
            .build()
            .call()
            .map_err(|e| e.to_string())?;
        let mut data = resp
            .body_mut()
            .with_config()
            .limit(MAX_BYTES as u64 + 1)
            .read_to_vec()
            .map_err(|e| e.to_string())?;
        data.truncate(MAX_BYTES);
        return Ok(data);
    }
    if url.starts_with("data:")
        && let Some((_, b64)) = url.split_once(";base64,")
    {
        use base64::Engine;
        let mut data = base64::engine::general_purpose::STANDARD
            .decode(b64.trim())
            .map_err(|e| e.to_string())?;
        data.truncate(MAX_BYTES);
        return Ok(data);
    }
    Ok(Vec::new())
}

/// Save a cover under its content hash; its image source, or "".
fn store(data: &[u8]) -> std::io::Result<String> {
    let ext = sniff(data);
    if ext.is_empty() {
        return Ok(String::new());
    }
    let dir = art_dir();
    std::fs::create_dir_all(&dir)?;
    let hash = sha1_smol::Sha1::from(data).digest().to_string();
    let path = dir.join(format!("{}.{ext}", &hash[..20]));
    if !path.exists() {
        let tmp = path.with_extension("part");
        std::fs::write(&tmp, data)?;
        std::fs::rename(&tmp, &path)?;
    }
    std::fs::File::options()
        .write(true)
        .open(&path)?
        .set_modified(SystemTime::now())?;
    let mut all: Vec<(SystemTime, PathBuf)> = std::fs::read_dir(&dir)?
        .flatten()
        .filter_map(|e| Some((e.metadata().ok()?.modified().ok()?, e.path())))
        .collect();
    all.sort_by_key(|e| std::cmp::Reverse(e.0));
    for (_, old) in all.into_iter().skip(KEEP) {
        let _ = std::fs::remove_file(old);
    }
    Ok(format!("file:{}", path.display()))
}

/// Local files can be rewritten in place (Chromium reuses temp names).
fn cover_key(url: &str) -> String {
    use std::os::unix::fs::MetadataExt;
    match file_path(url).map(std::fs::metadata) {
        Some(Ok(m)) => format!(
            "{url}@{}:{}",
            m.mtime() as i128 * 1_000_000_000 + m.mtime_nsec() as i128,
            m.size()
        ),
        _ => url.to_string(),
    }
}

// ---------------------------------------------------------------- player

#[derive(Clone)]
struct Ctx {
    media: Rc<RefCell<Media>>,
    player: Topic<Value>,
    players: Topic<Value>,
    conn: Rc<RefCell<Option<Connection>>>,
    /// Something started playing (the position loop wakes up).
    playing: Wake,
}

impl Ctx {
    fn conn(&self) -> Option<Connection> {
        self.conn.borrow().clone()
    }

    /// The player to show: the last one that started playing and still
    /// plays, else the last that played, else any.
    fn current(m: &Media) -> String {
        if m.players.contains_key(&m.pinned) {
            return m.pinned.clone();
        }
        let order: Vec<&String> = m
            .recent
            .iter()
            .filter(|i| m.players.contains_key(*i))
            .chain(m.players.keys().filter(|i| !m.recent.contains(i)))
            .collect();
        order
            .iter()
            .find(|i| m.players[**i].track.status == "Playing")
            .or(order.first())
            .map_or(String::new(), |s| s.to_string())
    }

    /// The topic value for a player.
    fn value(&self, m: &Media, inst: &str) -> Value {
        let p = &m.players[inst];
        let t = &p.track;
        let old = if m.instance == inst {
            self.player.get()
        } else {
            Value::Null
        };
        let same = old["title"] == t.title.as_str();
        let now = now_ms();
        let art = m
            .covers
            .get(&cover_key(&t.art))
            .cloned()
            .unwrap_or_else(|| {
                if old["artUrl"] == t.art.as_str() {
                    old["art"].as_str().unwrap_or("").to_string()
                } else {
                    String::new()
                }
            });
        json!({
            "instance": inst,
            "identity": t.name,
            "title": t.title,
            "artist": t.artist,
            "album": t.album,
            "art": art,
            "artUrl": t.art,
            "playing": t.status == "Playing",
            "position": if same { old.get("position").cloned().unwrap_or(json!(0)) } else { json!(0) },
            "at": if same { old.get("at").cloned().unwrap_or(json!(now)) } else { json!(now) },
            "rate": p.rate,
            "length": t.length as f64 / 1_000_000.0,
        })
    }

    fn show(&self) {
        let (value, art) = {
            let mut m = self.media.borrow_mut();
            let listed: Vec<Value> = m
                .players
                .iter()
                .map(|(i, p)| json!({"instance": i, "identity": p.track.name, "playing": p.track.status == "Playing"}))
                .collect();
            self.players.publish(json!(listed));
            let inst = Self::current(&m);
            if inst.is_empty() {
                m.instance.clear();
                self.player.publish(Value::Null);
                return;
            }
            let value = self.value(&m, &inst);
            m.instance = inst;
            if value == self.player.get() {
                return;
            }
            let art = value["artUrl"].as_str().unwrap_or("").to_string();
            (value, art)
        };
        self.player.publish(value);
        if !art.is_empty() {
            spawn(self.clone().resolve_cover(art)).detach();
        }
        spawn(self.clone().refresh_position(false)).detach();
        self.playing.wake();
    }

    /// Take a player's track; a player that starts playing goes first.
    fn update(m: &mut Media, inst: &str, track: Track, rate: f64, bus: &str) {
        let was_playing = m.players.get(inst).map(|p| p.track.status == "Playing");
        let starts = track.status == "Playing" && was_playing != Some(true);
        m.players.insert(
            inst.to_string(),
            Player {
                bus: bus.to_string(),
                track,
                rate,
            },
        );
        if starts {
            m.recent.retain(|i| i != inst);
            m.recent.insert(0, inst.to_string());
            // Another player started: the choice by hand no longer holds.
            if m.pinned != inst {
                m.pinned.clear();
            }
        }
    }

    fn remove(&self, inst: &str) {
        let mut m = self.media.borrow_mut();
        m.players.remove(inst);
        m.recent.retain(|i| i != inst);
        if m.pinned == inst {
            m.pinned.clear();
        }
        for list in m.owners.values_mut() {
            list.retain(|i| i != inst);
        }
        m.owners.retain(|_, l| !l.is_empty());
    }

    async fn get_all(conn: &Connection, bus: &str) -> zbus::Result<HashMap<String, OwnedValue>> {
        conn.call_method(
            Some(bus),
            PATH,
            Some("org.freedesktop.DBus.Properties"),
            "GetAll",
            &(PLAYER,),
        )
        .await?
        .body()
        .deserialize()
    }

    /// Read a player from scratch (it appeared, or invalidated properties).
    async fn add(&self, bus: String, owner: String) {
        let Some(conn) = self.conn() else { return };
        let inst = bus[PREFIX.len()..].to_string();
        let props = Self::get_all(&conn, &bus).await.unwrap_or_default();
        let mut track = Track {
            name: inst.split('.').next().unwrap_or("").to_string(),
            ..Track::default()
        };
        let mut rate = 1.0;
        apply(&mut track, &mut rate, &props);
        {
            let mut m = self.media.borrow_mut();
            let list = m.owners.entry(owner).or_default();
            if !list.contains(&inst) {
                list.push(inst.clone());
            }
            Self::update(&mut m, &inst, track, rate, &bus);
        }
        self.show();
    }

    fn changed(&self, owner: &str, props: &HashMap<String, OwnedValue>) {
        let instances = self
            .media
            .borrow()
            .owners
            .get(owner)
            .cloned()
            .unwrap_or_default();
        let mut any = false;
        for inst in instances {
            let mut m = self.media.borrow_mut();
            let Some(p) = m.players.get(&inst) else {
                continue;
            };
            let (mut track, mut rate, bus) = (p.track.clone(), p.rate, p.bus.clone());
            apply(&mut track, &mut rate, props);
            let same = track == m.players[&inst].track;
            let rate_changed = rate != m.players[&inst].rate;
            if same && !rate_changed {
                continue;
            }
            if same {
                m.players.get_mut(&inst).expect("present").rate = rate;
                if m.instance == inst {
                    drop(m);
                    self.player.update(|v| {
                        if !v.is_null() {
                            v["rate"] = json!(rate);
                        }
                    });
                }
                continue;
            }
            Self::update(&mut m, &inst, track, rate, &bus);
            any = true;
        }
        if any {
            self.show();
        }
    }

    async fn read_position(&self) -> Option<f64> {
        let conn = self.conn()?;
        let bus = {
            let m = self.media.borrow();
            m.players.get(&m.instance)?.bus.clone()
        };
        let reply = conn
            .call_method(
                Some(bus.as_str()),
                PATH,
                Some("org.freedesktop.DBus.Properties"),
                "Get",
                &(PLAYER, "Position"),
            )
            .await
            .ok()?;
        let v: OwnedValue = reply.body().deserialize().ok()?;
        v_i64(Some(&v)).map(|us| us as f64 / 1_000_000.0)
    }

    fn publish_position(&self, seconds: f64, at: i64) {
        self.player.update(|v| {
            if !v.is_null() {
                v["position"] = json!(round_to(seconds, 3));
                v["at"] = json!(at);
            }
        });
    }

    /// Read the position now. `periodic`: publish only if it drifted.
    async fn refresh_position(self, periodic: bool) {
        if self.player.get().is_null() {
            return;
        }
        let Some(pos) = self.read_position().await else {
            return;
        };
        let at = now_ms();
        let p = self.player.get();
        if p.is_null() {
            return;
        }
        if periodic {
            let predicted = p["position"].as_f64().unwrap_or(0.0)
                + if p["playing"] == true {
                    p["rate"].as_f64().unwrap_or(1.0)
                } else {
                    0.0
                } * (at - p["at"].as_i64().unwrap_or(at)) as f64
                    / 1000.0;
            if (pos - predicted).abs() < DRIFT {
                return;
            }
        }
        self.publish_position(pos, at);
    }

    async fn resolve_cover(self, url: String) {
        let key = cover_key(&url);
        if self.media.borrow().covers.contains_key(&key) {
            return;
        }
        let u = url.clone();
        let source = unblock(move || -> std::result::Result<String, String> {
            let data = read_url(&u)?;
            if data.is_empty() {
                return Ok(String::new());
            }
            store(&data).map_err(|e| e.to_string())
        })
        .await
        .unwrap_or_else(|e| {
            // A dead link only costs the picture.
            eprintln!(
                "media: cover {}: {e}",
                url.chars().take(80).collect::<String>()
            );
            String::new()
        });
        self.media.borrow_mut().covers.insert(key, source.clone());
        self.player.update(|p| {
            if !p.is_null() && p["artUrl"] == url.as_str() {
                p["art"] = json!(source);
            }
        });
    }

    /// The bus name of the player commands go to.
    fn target(&self) -> Option<String> {
        let m = self.media.borrow();
        let inst = if m.players.contains_key(&m.instance) {
            m.instance.clone()
        } else {
            Self::current(&m)
        };
        m.players.get(&inst).map(|p| p.bus.clone())
    }

    async fn command(&self, method: &str) -> Result<()> {
        let (Some(conn), Some(bus)) = (self.conn(), self.target()) else {
            return Ok(());
        };
        conn.call_method(Some(bus.as_str()), PATH, Some(PLAYER), method, &())
            .await?;
        Ok(())
    }
}

async fn watch(ctx: Ctx) -> zbus::Result<()> {
    let conn = dbus::session().await?;
    *ctx.conn.borrow_mut() = Some(conn.clone());
    let owners_rule = MatchRule::builder()
        .msg_type(Type::Signal)
        .interface("org.freedesktop.DBus")?
        .member("NameOwnerChanged")?
        .arg0ns("org.mpris.MediaPlayer2")?
        .build();
    let props_rule = MatchRule::builder()
        .msg_type(Type::Signal)
        .interface("org.freedesktop.DBus.Properties")?
        .member("PropertiesChanged")?
        .path(PATH)?
        .arg(0, PLAYER)?
        .build();
    let seeked_rule = MatchRule::builder()
        .msg_type(Type::Signal)
        .interface(PLAYER)?
        .member("Seeked")?
        .path(PATH)?
        .build();
    let mut owners = dbus::watch(&conn, owners_rule).await?;
    let mut props = dbus::watch(&conn, props_rule).await?;
    let mut seeked = dbus::watch(&conn, seeked_rule).await?;

    // Who is there already.
    let dbusp = zbus::fdo::DBusProxy::new(&conn).await?;
    for name in dbusp.list_names().await? {
        let name = name.to_string();
        if !name.starts_with(PREFIX) || name == "org.mpris.MediaPlayer2.playerctld" {
            continue;
        }
        if let Ok(owner) = dbusp.get_name_owner(name.as_str().try_into()?).await {
            ctx.add(name, owner.to_string()).await;
        }
    }
    ctx.show();

    enum Ev {
        Owner(zbus::Message),
        Props(zbus::Message),
        Seeked(zbus::Message),
    }
    loop {
        let ev = future::or(
            async { owners.next().await.map(|m| m.map(Ev::Owner)) },
            future::or(
                async { props.next().await.map(|m| m.map(Ev::Props)) },
                async { seeked.next().await.map(|m| m.map(Ev::Seeked)) },
            ),
        )
        .await;
        let Some(ev) = ev else { return Ok(()) };
        match ev? {
            Ev::Owner(msg) => {
                let Ok((name, _old, new)) = msg.body().deserialize::<(String, String, String)>()
                else {
                    continue;
                };
                if !name.starts_with(PREFIX) || name == "org.mpris.MediaPlayer2.playerctld" {
                    continue;
                }
                if new.is_empty() {
                    ctx.remove(&name[PREFIX.len()..]);
                    ctx.show();
                } else {
                    ctx.add(name, new).await;
                }
            }
            Ev::Props(msg) => {
                let owner = msg
                    .header()
                    .sender()
                    .map(|s| s.to_string())
                    .unwrap_or_default();
                let Ok((_iface, changed, invalidated)) =
                    msg.body()
                        .deserialize::<(String, HashMap<String, OwnedValue>, Vec<String>)>()
                else {
                    continue;
                };
                if !invalidated.is_empty() {
                    // Read everything again.
                    let buses: Vec<String> = {
                        let m = ctx.media.borrow();
                        m.owners
                            .get(&owner)
                            .into_iter()
                            .flatten()
                            .filter_map(|i| m.players.get(i).map(|p| p.bus.clone()))
                            .collect()
                    };
                    for bus in buses {
                        ctx.add(bus, owner.clone()).await;
                    }
                }
                ctx.changed(&owner, &changed);
            }
            Ev::Seeked(msg) => {
                let owner = msg
                    .header()
                    .sender()
                    .map(|s| s.to_string())
                    .unwrap_or_default();
                let Ok(us) = msg.body().deserialize::<i64>() else {
                    continue;
                };
                let current = {
                    let m = ctx.media.borrow();
                    m.owners
                        .get(&owner)
                        .is_some_and(|l| l.contains(&m.instance))
                };
                if current {
                    ctx.publish_position(us as f64 / 1_000_000.0, now_ms());
                }
            }
        }
    }
}

/// While the shown player plays, check its position once a second.
async fn positions(ctx: Ctx) {
    loop {
        if ctx.player.get()["playing"] != true {
            ctx.playing.wait().await;
            continue;
        }
        Timer::after(Duration::from_secs(1)).await;
        ctx.clone().refresh_position(true).await;
    }
}

fn f64_arg(args: &Value, key: &str) -> Result<f64> {
    args.get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| Error::msg(format!("'{key}'")))
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("media");
    let ctx = Ctx {
        media: Rc::default(),
        player: svc.topic("player", Value::Null),
        players: svc.topic("players", json!([])),
        conn: Rc::default(),
        playing: Wake::new(),
    };

    for (name, method) in [
        ("play_pause", "PlayPause"),
        ("next", "Next"),
        ("previous", "Previous"),
    ] {
        let c = ctx.clone();
        svc.method(name, move |_: Value| {
            let c = c.clone();
            async move { c.command(method).await }
        });
    }
    let c = ctx.clone();
    svc.method("seek", move |args: Value| {
        let c = c.clone();
        async move {
            let p = c.player.get();
            if p.is_null() {
                return Ok(());
            }
            let wanted = f64_arg(&args, "position")?;
            let length = p["length"].as_f64().filter(|l| *l != 0.0).unwrap_or(wanted);
            let position = wanted.min(length).max(0.0);
            let (Some(conn), Some(bus)) = (c.conn(), c.target()) else {
                return Ok(());
            };
            let trackid = {
                let m = c.media.borrow();
                m.players
                    .get(&m.instance)
                    .and_then(|p| p.track.trackid.clone())
            };
            let us = (position * 1_000_000.0) as i64;
            match trackid.and_then(|t| zbus::zvariant::ObjectPath::try_from(t).ok()) {
                Some(path) => {
                    conn.call_method(
                        Some(bus.as_str()),
                        PATH,
                        Some(PLAYER),
                        "SetPosition",
                        &(path, us),
                    )
                    .await?;
                }
                None => {
                    let now = c.read_position().await.unwrap_or(0.0);
                    let offset = us - (now * 1_000_000.0) as i64;
                    conn.call_method(Some(bus.as_str()), PATH, Some(PLAYER), "Seek", &(offset,))
                        .await?;
                }
            }
            c.clone().refresh_position(false).await;
            Ok(())
        }
    });
    let c = ctx.clone();
    svc.method_sync("choose", move |args: Value| {
        let inst = args
            .get("instance")
            .and_then(Value::as_str)
            .ok_or("'instance'")?;
        let known = c.media.borrow().players.contains_key(inst);
        if known {
            c.media.borrow_mut().pinned = inst.to_string();
            c.show();
        }
        Ok(())
    });

    let start = async move {
        spawn(positions(ctx.clone())).detach();
        loop {
            if let Err(e) = watch(ctx.clone()).await {
                eprintln!("media: {e}");
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
    fn file_urls_and_sniffing() {
        assert_eq!(
            file_path("file:///tmp/a%20b.png"),
            Some(PathBuf::from("/tmp/a b.png"))
        );
        assert_eq!(
            file_path("file://localhost/tmp/x"),
            Some(PathBuf::from("/tmp/x"))
        );
        assert_eq!(file_path("https://x/y"), None);
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\nrest"), "png");
        assert_eq!(sniff(b"RIFF1234WEBPVP8 "), "webp");
        assert_eq!(sniff(b"<svg"), "");
    }

    #[test]
    fn picks_the_last_player_that_started() {
        let mut m = Media::default();
        let t = |status: &str| Track {
            status: status.into(),
            ..Track::default()
        };
        Ctx::update(&mut m, "a", t("Playing"), 1.0, "x.a");
        Ctx::update(&mut m, "b", t("Paused"), 1.0, "x.b");
        assert_eq!(Ctx::current(&m), "a");
        Ctx::update(&mut m, "b", t("Playing"), 1.0, "x.b");
        assert_eq!(Ctx::current(&m), "b");
        m.pinned = "a".into();
        assert_eq!(Ctx::current(&m), "a");
        // Another one starting drops the pin.
        Ctx::update(&mut m, "c", t("Playing"), 1.0, "x.c");
        assert_eq!(Ctx::current(&m), "c");
        assert!(m.pinned.is_empty());
    }
}
