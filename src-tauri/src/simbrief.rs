use chrono::{SecondsFormat, Utc};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tokio::sync::oneshot;

const SIMBRIEF_DISPATCH_LABEL: &str = "simbrief-dispatch";
const SIMBRIEF_DISPATCH_TIMEOUT_SECONDS: u64 = 300;
const SIMBRIEF_FETCH_RETRY_COUNT: usize = 8;
const SIMBRIEF_FETCH_RETRY_DELAY_SECONDS: u64 = 2;
const SIMBRIEF_CALLBACK_URL_BASE: &str = "http://127.0.0.1:43123/simbrief-callback";
const SIMBRIEF_DISPATCH_URL: &str = "https://www.simbrief.com/ofp/ofp.loader.api.php";
const SIMBRIEF_FETCH_URL: &str = "https://www.simbrief.com/api/xml.fetcher.php";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimBriefDispatchPayload {
    pub flight_id: String,
    pub airline: String,
    pub flight_number: String,
    pub callsign: String,
    pub origin: String,
    pub destination: String,
    pub aircraft_type: String,
    pub departure_time_utc: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub pilot_id: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimBriefPlanSummary {
    pub status: String,
    pub generated_at_utc: String,
    pub static_id: String,
    pub aircraft_type: String,
    pub callsign: String,
    pub route: String,
    pub cruise_altitude: String,
    pub alternate: String,
    pub ete: String,
    pub block_fuel: String,
    pub ofp_url: String,
    pub pdf_url: String,
}

#[derive(Default)]
pub struct SimBriefDispatchManager {
    active: Mutex<Option<ActiveSimBriefDispatch>>,
}

struct ActiveSimBriefDispatch {
    label: String,
    sender: oneshot::Sender<Result<SimBriefPlanSummary, String>>,
}

impl SimBriefDispatchManager {
    fn begin(
        &self,
        label: String,
        sender: oneshot::Sender<Result<SimBriefPlanSummary, String>>,
    ) -> Result<(), String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "dispatch_failed: Unable to lock SimBrief dispatch state.".to_string())?;

        if active.is_some() {
            return Err("dispatch_failed: A SimBrief dispatch is already in progress.".into());
        }

        *active = Some(ActiveSimBriefDispatch { label, sender });
        Ok(())
    }

    fn finish(&self, label: &str, result: Result<SimBriefPlanSummary, String>) {
        let sender = self
            .active
            .lock()
            .ok()
            .and_then(|mut active| match active.take() {
                Some(session) if session.label == label => Some(session.sender),
                Some(session) => {
                    *active = Some(session);
                    None
                }
                None => None,
            });

        if let Some(sender) = sender {
            let _ = sender.send(result);
        }
    }
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn iso_now_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn simbrief_api_key() -> Result<String, String> {
    for name in ["SIMBRIEF_API_KEY", "TAURI_SIMBRIEF_API_KEY"] {
        if let Ok(value) = std::env::var(name) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(trimmed.to_string());
            }
        }
    }

    Err(
        "config_failed: SimBrief API key not found. Set SIMBRIEF_API_KEY or TAURI_SIMBRIEF_API_KEY for the desktop app."
            .into(),
    )
}

fn sanitize_static_id(value: &str) -> String {
    value.chars()
        .map(|character| match character {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '_' => character,
            _ => '_',
        })
        .collect()
}

fn build_static_id(flight_id: &str, timestamp: u64) -> String {
    let sanitized_flight_id = sanitize_static_id(flight_id);
    format!("FP_{}_{}", sanitized_flight_id, timestamp)
}

fn extract_departure_parts(iso_value: &str) -> Result<(String, String), String> {
    let trimmed = iso_value.trim();
    if trimmed.len() < 16 {
        return Err("validation_failed: Departure time must be an ISO timestamp in UTC.".into());
    }

    let hour = trimmed.get(11..13).unwrap_or_default().to_string();
    let minute = trimmed.get(14..16).unwrap_or_default().to_string();

    if hour.len() != 2
        || minute.len() != 2
        || !hour.chars().all(|character| character.is_ascii_digit())
        || !minute.chars().all(|character| character.is_ascii_digit())
    {
        return Err("validation_failed: Departure time must contain a valid UTC hour and minute.".into());
    }

    Ok((hour, minute))
}

fn build_outputpage(static_id: &str) -> Result<String, String> {
    Url::parse_with_params(SIMBRIEF_CALLBACK_URL_BASE, &[("static_id", static_id)])
        .map(|url| url.to_string())
        .map_err(|error| format!("dispatch_failed: Unable to build SimBrief callback URL: {error}"))
}

fn build_simbrief_dispatch_url(
    payload: &SimBriefDispatchPayload,
    api_key: &str,
    timestamp: u64,
    outputpage: &str,
    static_id: &str,
) -> Result<String, String> {
    let (departure_hour, departure_minute) = extract_departure_parts(&payload.departure_time_utc)?;
    let apicode_input = format!(
        "{api_key}{}{}{}{timestamp}{outputpage}",
        payload.origin.trim().to_uppercase(),
        payload.destination.trim().to_uppercase(),
        payload.aircraft_type.trim().to_uppercase(),
    );
    let apicode = format!("{:x}", md5::compute(apicode_input));

    let mut params = vec![
        ("airline", payload.airline.trim().to_uppercase()),
        ("fltnum", payload.flight_number.trim().to_uppercase()),
        ("callsign", payload.callsign.trim().to_uppercase()),
        ("orig", payload.origin.trim().to_uppercase()),
        ("dest", payload.destination.trim().to_uppercase()),
        ("type", payload.aircraft_type.trim().to_uppercase()),
        ("deph", departure_hour),
        ("depm", departure_minute),
        ("static_id", static_id.to_string()),
        ("timestamp", timestamp.to_string()),
        ("outputpage", outputpage.to_string()),
        ("apicode", apicode),
    ];

    let pilot_id = payload.pilot_id.trim();
    if !pilot_id.is_empty() {
        params.push(("pid", pilot_id.to_string()));
    }

    Url::parse_with_params(SIMBRIEF_DISPATCH_URL, params)
        .map(|url| url.to_string())
        .map_err(|error| format!("dispatch_failed: Unable to build SimBrief dispatch URL: {error}"))
}

fn build_fetch_urls(
    username: &str,
    pilot_id: &str,
    static_id: &str,
) -> Result<Vec<String>, String> {
    let mut urls = Vec::new();
    let normalized_username = username.trim();
    let normalized_pilot_id = pilot_id.trim();

    if !normalized_username.is_empty() {
        let url = Url::parse_with_params(
            SIMBRIEF_FETCH_URL,
            &[
                ("username", normalized_username),
                ("static_id", static_id),
                ("json", "v2"),
            ],
        )
        .map_err(|error| format!("fetch_failed: Unable to build SimBrief username fetch URL: {error}"))?;
        urls.push(url.to_string());
    }

    if !normalized_pilot_id.is_empty() {
        let url = Url::parse_with_params(
            SIMBRIEF_FETCH_URL,
            &[
                ("userid", normalized_pilot_id),
                ("static_id", static_id),
                ("json", "v2"),
            ],
        )
        .map_err(|error| format!("fetch_failed: Unable to build SimBrief pilot ID fetch URL: {error}"))?;
        urls.push(url.to_string());
    }

    if urls.is_empty() {
        return Err(
            "validation_failed: Save a SimBrief Navigraph Alias or Pilot ID before dispatching."
                .into(),
        );
    }

    Ok(urls)
}

fn is_simbrief_domain(url: &tauri::webview::Url) -> bool {
    url.scheme() == "https"
        && url
            .domain()
            .map(|domain| {
                domain.eq_ignore_ascii_case("simbrief.com")
                    || domain.eq_ignore_ascii_case("www.simbrief.com")
                    || domain.ends_with(".simbrief.com")
                    || domain.eq_ignore_ascii_case("navigraph.com")
                    || domain.ends_with(".navigraph.com")
            })
            .unwrap_or(false)
}

fn is_simbrief_callback_url(url: &tauri::webview::Url) -> bool {
    matches!(url.scheme(), "http" | "https")
        && url
            .domain()
            .map(|domain| domain == "127.0.0.1" || domain.eq_ignore_ascii_case("localhost"))
            .unwrap_or(false)
        && url.path() == "/simbrief-callback"
}

fn is_allowed_simbrief_url(url: &tauri::webview::Url) -> bool {
    is_simbrief_domain(url) || is_simbrief_callback_url(url)
}

fn close_simbrief_dispatch_window_internal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SIMBRIEF_DISPATCH_LABEL) {
        let _ = window.close();
    }
}

fn build_webview_data_directory(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("dispatch_failed: Unable to resolve SimBrief webview data path: {error}"))?
        .join("simbrief-webview");
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("dispatch_failed: Unable to create SimBrief webview data path: {error}"))?;
    Ok(data_dir)
}

fn value_as_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(boolean) => Some(boolean.to_string()),
        _ => None,
    }
}

fn find_path_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }

    value_as_string(current)
}

fn find_key_recursively(value: &Value, target_key: &str) -> Option<String> {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                if key.eq_ignore_ascii_case(target_key) {
                    if let Some(text) = value_as_string(child) {
                        return Some(text);
                    }
                }

                if let Some(found) = find_key_recursively(child, target_key) {
                    return Some(found);
                }
            }

            None
        }
        Value::Array(items) => items
            .iter()
            .find_map(|child| find_key_recursively(child, target_key)),
        _ => None,
    }
}

fn find_first_string(value: &Value, paths: &[&[&str]], keys: &[&str]) -> String {
    for path in paths {
        if let Some(found) = find_path_string(value, path) {
            return found;
        }
    }

    for key in keys {
        if let Some(found) = find_key_recursively(value, key) {
            return found;
        }
    }

    String::new()
}

fn collect_urls(value: &Value, urls: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for child in map.values() {
                collect_urls(child, urls);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_urls(child, urls);
            }
        }
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                urls.push(trimmed.to_string());
            }
        }
        _ => {}
    }
}

fn normalize_simbrief_plan(json: &Value, static_id: &str) -> SimBriefPlanSummary {
    let mut urls = Vec::new();
    collect_urls(json, &mut urls);
    let generated_at_utc = find_first_string(
        json,
        &[
            &["params", "time_generated"],
            &["general", "time_generated"],
            &["times", "generated"],
        ],
        &["time_generated", "generated", "created"],
    );

    let pdf_url = urls
        .iter()
        .find(|url| url.to_ascii_lowercase().contains(".pdf"))
        .cloned()
        .unwrap_or_default();
    let ofp_url = urls
        .iter()
        .find(|url| *url != &pdf_url && url.contains("simbrief.com"))
        .cloned()
        .unwrap_or_default();

    SimBriefPlanSummary {
        status: "ready".into(),
        generated_at_utc: if generated_at_utc.is_empty() {
            iso_now_utc()
        } else {
            generated_at_utc
        },
        static_id: static_id.to_string(),
        aircraft_type: find_first_string(
            json,
            &[
                &["params", "type"],
                &["aircraft", "icao"],
                &["general", "icao_aircraft"],
            ],
            &["type", "icao_aircraft", "icao"],
        ),
        callsign: find_first_string(json, &[&["params", "callsign"]], &["callsign"]),
        route: find_first_string(
            json,
            &[&["general", "route"], &["atc", "route"], &["params", "route"]],
            &["route"],
        ),
        cruise_altitude: find_first_string(
            json,
            &[
                &["general", "initial_altitude"],
                &["params", "initial_altitude"],
                &["params", "fl"],
            ],
            &["initial_altitude", "fl"],
        ),
        alternate: find_first_string(
            json,
            &[&["general", "alternate"], &["params", "altn"]],
            &["alternate", "altn"],
        ),
        ete: find_first_string(
            json,
            &[
                &["times", "est_time_enroute"],
                &["general", "ete"],
                &["times", "enroute_time"],
            ],
            &["est_time_enroute", "ete", "enroute_time"],
        ),
        block_fuel: find_first_string(
            json,
            &[
                &["fuel", "plan_ramp"],
                &["fuel", "block"],
                &["fuel", "block_fuel"],
            ],
            &["plan_ramp", "block", "block_fuel"],
        ),
        ofp_url,
        pdf_url,
    }
}

fn truncate_for_error(text: &str) -> String {
    let mut truncated = text.trim().replace('\n', " ");
    if truncated.len() > 180 {
        truncated.truncate(180);
        truncated.push_str("...");
    }
    truncated
}

async fn fetch_json_from_url(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("fetch_failed: SimBrief fetch request failed: {error}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("fetch_failed: Unable to read SimBrief fetch response: {error}"))?;

    if !status.is_success() {
        return Err(format!(
            "fetch_failed: SimBrief returned HTTP {} while fetching OFP data: {}",
            status,
            truncate_for_error(&body)
        ));
    }

    serde_json::from_str::<Value>(&body).map_err(|error| {
        format!(
            "fetch_failed: SimBrief returned a non-JSON OFP payload: {} ({error})",
            truncate_for_error(&body)
        )
    })
}

async fn fetch_simbrief_plan_summary(
    payload: &SimBriefDispatchPayload,
    static_id: &str,
) -> Result<SimBriefPlanSummary, String> {
    let fetch_urls = build_fetch_urls(&payload.username, &payload.pilot_id, static_id)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("flight-planner-app/0.1.0")
        .build()
        .map_err(|error| format!("fetch_failed: Unable to initialize SimBrief HTTP client: {error}"))?;

    let mut last_error = String::from("fetch_failed: Unable to retrieve SimBrief OFP data.");

    for attempt in 0..SIMBRIEF_FETCH_RETRY_COUNT {
        for url in &fetch_urls {
            match fetch_json_from_url(&client, url).await {
                Ok(json) => return Ok(normalize_simbrief_plan(&json, static_id)),
                Err(error) => {
                    last_error = error;
                }
            }
        }

        if attempt + 1 < SIMBRIEF_FETCH_RETRY_COUNT {
            tokio::time::sleep(Duration::from_secs(SIMBRIEF_FETCH_RETRY_DELAY_SECONDS)).await;
        }
    }

    Err(last_error)
}

#[tauri::command]
pub fn close_simbrief_dispatch_window(app: AppHandle) {
    close_simbrief_dispatch_window_internal(&app);
}

#[tauri::command]
pub async fn start_simbrief_dispatch(
    app: AppHandle,
    manager: State<'_, SimBriefDispatchManager>,
    payload: SimBriefDispatchPayload,
) -> Result<SimBriefPlanSummary, String> {
    let normalized_payload = SimBriefDispatchPayload {
        flight_id: payload.flight_id.trim().to_string(),
        airline: payload.airline.trim().to_uppercase(),
        flight_number: payload.flight_number.trim().to_string(),
        callsign: payload.callsign.trim().to_uppercase(),
        origin: payload.origin.trim().to_uppercase(),
        destination: payload.destination.trim().to_uppercase(),
        aircraft_type: payload.aircraft_type.trim().to_uppercase(),
        departure_time_utc: payload.departure_time_utc.trim().to_string(),
        username: payload.username.trim().to_string(),
        pilot_id: payload.pilot_id.trim().to_string(),
    };

    if normalized_payload.airline.is_empty()
        || normalized_payload.flight_number.is_empty()
        || normalized_payload.callsign.is_empty()
        || normalized_payload.origin.is_empty()
        || normalized_payload.destination.is_empty()
        || normalized_payload.aircraft_type.is_empty()
        || normalized_payload.departure_time_utc.is_empty()
    {
        return Err("validation_failed: SimBrief dispatch requires flight number, callsign, origin, destination, aircraft type, and departure time.".into());
    }

    let api_key = simbrief_api_key()?;
    let timestamp = unix_timestamp();
    let static_id = build_static_id(&normalized_payload.flight_id, timestamp);
    let outputpage = build_outputpage(&static_id)?;
    let dispatch_url = build_simbrief_dispatch_url(
        &normalized_payload,
        &api_key,
        timestamp,
        &outputpage,
        &static_id,
    )?;

    close_simbrief_dispatch_window_internal(&app);

    let (sender, receiver) = oneshot::channel();
    manager.begin(SIMBRIEF_DISPATCH_LABEL.to_string(), sender)?;

    let app_for_navigation = app.clone();
    let app_for_close = app.clone();
    let app_for_timeout = app.clone();
    let payload_for_navigation = normalized_payload.clone();
    let static_id_for_navigation = static_id.clone();
    let dispatch_url = dispatch_url
        .parse()
        .map_err(|error| format!("dispatch_failed: Invalid SimBrief dispatch URL: {error}"))?;

    let window = WebviewWindowBuilder::new(
        &app,
        SIMBRIEF_DISPATCH_LABEL,
        WebviewUrl::External(dispatch_url),
    )
    .title("SimBrief Dispatch")
    .inner_size(560.0, 820.0)
    .min_inner_size(500.0, 720.0)
    .resizable(true)
    .center()
    .data_directory(build_webview_data_directory(&app)?)
    .on_navigation(move |url| {
        if is_simbrief_callback_url(url) {
            let app_handle = app_for_navigation.clone();
            let payload = payload_for_navigation.clone();
            let static_id = static_id_for_navigation.clone();

            tauri::async_runtime::spawn(async move {
                let result = fetch_simbrief_plan_summary(&payload, &static_id).await;
                app_handle
                    .state::<SimBriefDispatchManager>()
                    .finish(SIMBRIEF_DISPATCH_LABEL, result);
                close_simbrief_dispatch_window_internal(&app_handle);
            });

            return false;
        }

        is_allowed_simbrief_url(url)
    })
    .build()
    .map_err(|error| format!("dispatch_failed: Unable to open SimBrief dispatch window: {error}"))?;

    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
            app_for_close.state::<SimBriefDispatchManager>().finish(
                SIMBRIEF_DISPATCH_LABEL,
                Err("cancelled: SimBrief dispatch window was closed before the flight plan returned.".into()),
            );
        }
    });

    match tokio::time::timeout(Duration::from_secs(SIMBRIEF_DISPATCH_TIMEOUT_SECONDS), receiver)
        .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("dispatch_failed: SimBrief dispatch stopped unexpectedly.".into()),
        Err(_) => {
            app_for_timeout.state::<SimBriefDispatchManager>().finish(
                SIMBRIEF_DISPATCH_LABEL,
                Err("auth_failed: Timed out waiting for SimBrief login or flight plan generation.".into()),
            );
            close_simbrief_dispatch_window_internal(&app_for_timeout);
            Err("auth_failed: Timed out waiting for SimBrief login or flight plan generation.".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_payload() -> SimBriefDispatchPayload {
        SimBriefDispatchPayload {
            flight_id: "DAL|1234|KATL|KLAX|2026-04-01T12:30:00.000Z|0".into(),
            airline: "DAL".into(),
            flight_number: "1234".into(),
            callsign: "DAL1234".into(),
            origin: "KATL".into(),
            destination: "KLAX".into(),
            aircraft_type: "A321".into(),
            departure_time_utc: "2026-04-01T12:30:00.000Z".into(),
            username: "captainjake".into(),
            pilot_id: "1234567".into(),
        }
    }

    #[test]
    fn build_simbrief_dispatch_url_includes_required_fields_and_apicode() {
        let payload = sample_payload();
        let outputpage = build_outputpage("FP_TEST_1").expect("outputpage");
        let url = build_simbrief_dispatch_url(&payload, "secret", 1_716_778_800, &outputpage, "FP_TEST_1")
            .expect("dispatch url");

        let parsed = Url::parse(&url).expect("url parse");
        let pairs: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
        let expected_apicode = format!(
            "{:x}",
            md5::compute(format!(
                "secret{}{}{}{}{}",
                payload.origin, payload.destination, payload.aircraft_type, 1_716_778_800, outputpage
            ))
        );

        assert_eq!(pairs.get("airline"), Some(&"DAL".to_string()));
        assert_eq!(pairs.get("fltnum"), Some(&"1234".to_string()));
        assert_eq!(pairs.get("callsign"), Some(&"DAL1234".to_string()));
        assert_eq!(pairs.get("orig"), Some(&"KATL".to_string()));
        assert_eq!(pairs.get("dest"), Some(&"KLAX".to_string()));
        assert_eq!(pairs.get("type"), Some(&"A321".to_string()));
        assert_eq!(pairs.get("deph"), Some(&"12".to_string()));
        assert_eq!(pairs.get("depm"), Some(&"30".to_string()));
        assert_eq!(pairs.get("static_id"), Some(&"FP_TEST_1".to_string()));
        assert_eq!(pairs.get("timestamp"), Some(&"1716778800".to_string()));
        assert_eq!(pairs.get("outputpage"), Some(&outputpage));
        assert_eq!(pairs.get("apicode"), Some(&expected_apicode));
    }

    #[test]
    fn build_fetch_urls_prefers_alias_before_pilot_id() {
        let urls = build_fetch_urls("captainjake", "1234567", "FP_TEST_1").expect("fetch urls");

        assert_eq!(urls.len(), 2);
        assert!(urls[0].contains("username=captainjake"));
        assert!(urls[0].contains("static_id=FP_TEST_1"));
        assert!(urls[1].contains("userid=1234567"));
    }

    #[test]
    fn build_fetch_urls_errors_when_no_user_identifier_exists() {
        let error = build_fetch_urls("", "", "FP_TEST_1").expect_err("missing user id should fail");
        assert!(error.contains("Navigraph Alias or Pilot ID"));
    }
}
