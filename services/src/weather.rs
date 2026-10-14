//! weather: current conditions and the next hours, from wttr.in every 30 min.
//!
//! topic  state  {"place", "temperature", "feelsLike", "description", "icon",
//!                "color", "hours": [{"hour", "temperature", "icon", "color", "rain"}]} | null
//!
//! The last answer is cached in $XDG_CACHE_HOME/adwaita-shell/weather.json
//! (~/.cache by default), so the card starts filled even offline.

use std::path::PathBuf;
use std::time::Duration;

use serde_json::{Value, json};
use tessela_service::{Service, Topic, Wake, poll, unblock};

use crate::Start;
use crate::util::{now_local, save};

const URL: &str = "https://wttr.in/?format=j1&lang=pt";

fn cache() -> PathBuf {
    crate::util::cache_dir().join("adwaita-shell/weather.json")
}

fn description(code: i64) -> &'static str {
    match code {
        113 => "céu limpo",
        116 => "parcialmente nublado",
        119 => "nublado",
        122 => "encoberto",
        143 => "névoa",
        248 | 260 => "neblina",
        176 => "chuva isolada",
        263 | 266 => "garoa",
        293 | 296 => "chuva fraca",
        299 | 302 => "chuva",
        305 | 308 => "chuva forte",
        353 => "pancadas de chuva",
        356 => "pancadas fortes",
        359 => "temporal",
        200 => "trovoadas",
        386 => "chuva com trovões",
        389 => "tempestade",
        392 => "neve com trovões",
        395 => "neve forte",
        _ => "",
    }
}

const RAIN: [i64; 12] = [263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359, 176];

fn icon_for(code: i64, night: bool) -> &'static str {
    match code {
        113 if night => "moon-stars",
        113 => "sun",
        116 if night => "cloud-moon",
        116 => "cloud-sun",
        119 | 122 => "cloud",
        143 | 248 | 260 => "cloud-fog",
        200 | 386 | 389 | 392 | 395 => "cloud-lightning",
        179..=377 if !RAIN.contains(&code) => "cloud-snow",
        _ => "cloud-rain",
    }
}

fn color_for(icon: &str) -> &'static str {
    match icon {
        "sun" | "cloud-sun" => "$yellow",
        "moon-stars" | "cloud-moon" => "$purple",
        "cloud-rain" | "cloud-lightning" | "cloud-snow" => "$cyan",
        _ => "$textMuted",
    }
}

/// `int(x)` of wttr's numbers, which come as strings.
fn int(v: &Value) -> Option<i64> {
    match v {
        Value::String(s) => s.trim().parse().ok(),
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f.trunc() as i64)),
        _ => None,
    }
}

fn parse(data: &Value, hour: i64) -> Option<Value> {
    let current = data["current_condition"].get(0).filter(|c| !c.is_null())?;
    let night = !(6..18).contains(&hour);
    let code = int(&current["weatherCode"])?;
    let icon = icon_for(code, night);
    let mut upcoming = Vec::new();
    for (day_index, day) in data["weather"]
        .as_array()
        .into_iter()
        .flatten()
        .take(2)
        .enumerate()
    {
        for slot in day["hourly"].as_array().into_iter().flatten() {
            let slot_hour = int(&slot["time"])? / 100;
            if day_index == 0 && slot_hour <= hour {
                continue;
            }
            let slot_icon = icon_for(int(&slot["weatherCode"])?, !(6..18).contains(&slot_hour));
            upcoming.push(json!({
                "hour": format!("{slot_hour:02}h"),
                "temperature": int(&slot["tempC"])?,
                "icon": slot_icon,
                "color": color_for(slot_icon),
                "rain": int(&slot["chanceofrain"])? as f64 / 100.0,
            }));
        }
    }
    upcoming.truncate(3);
    let area = data["nearest_area"][0]["areaName"][0]["value"]
        .as_str()
        .unwrap_or("");
    Some(json!({
        "place": area.to_lowercase(),
        "temperature": int(&current["temp_C"])?,
        "feelsLike": int(&current["FeelsLikeC"])?,
        "description": description(code),
        "icon": icon,
        "color": color_for(icon),
        "hours": upcoming,
    }))
}

fn fetch() -> Result<Value, String> {
    let text = ureq::get(URL)
        .config()
        .timeout_global(Some(Duration::from_secs(20)))
        .build()
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_to_string()
        .map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    save(&cache(), &text);
    Ok(data)
}

async fn read(state: &Topic<Value>) {
    if state.get().is_null()
        && let Some(cached) = std::fs::read_to_string(cache())
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
        && let Some(v) = parse(&cached, now_local().hour as i64)
    {
        state.publish(v);
    }
    match unblock(fetch).await {
        // An answer missing fields keeps the last good one.
        Ok(data) => {
            if let Some(v) = parse(&data, now_local().hour as i64) {
                state.publish(v);
            }
        }
        Err(e) => eprintln!("weather: {e}"),
    }
}

pub fn service() -> (Service, Start) {
    let mut svc = Service::new("weather");
    let state = svc.topic("state", Value::Null);
    let start = async move {
        let wake = Wake::new();
        poll(Duration::from_secs(1800), &wake, || read(&state)).await;
    };
    (svc, Box::pin(start))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_like_the_python_version() {
        let data = json!({
            "current_condition": [{"weatherCode": "116", "temp_C": "24", "FeelsLikeC": "26"}],
            "nearest_area": [{"areaName": [{"value": "Belo Horizonte"}]}],
            "weather": [
                {"hourly": [
                    {"time": "1500", "weatherCode": "113", "tempC": "25", "chanceofrain": "0"},
                    {"time": "1800", "weatherCode": "296", "tempC": "22", "chanceofrain": "80"},
                    {"time": "2100", "weatherCode": "113", "tempC": "19", "chanceofrain": "5"}]},
                {"hourly": [{"time": "0", "weatherCode": "227", "tempC": "17", "chanceofrain": "10"},
                            {"time": "300", "weatherCode": "113", "tempC": "16", "chanceofrain": "0"}]}
            ]
        });
        assert_eq!(
            parse(&data, 16).unwrap(),
            json!({
                "place": "belo horizonte", "temperature": 24, "feelsLike": 26,
                "description": "parcialmente nublado", "icon": "cloud-sun", "color": "$yellow",
                "hours": [
                    {"hour": "18h", "temperature": 22, "icon": "cloud-rain", "color": "$cyan", "rain": 0.8},
                    {"hour": "21h", "temperature": 19, "icon": "moon-stars", "color": "$purple", "rain": 0.05},
                    {"hour": "00h", "temperature": 17, "icon": "cloud-snow", "color": "$cyan", "rain": 0.1},
                ],
            })
        );
    }
}
