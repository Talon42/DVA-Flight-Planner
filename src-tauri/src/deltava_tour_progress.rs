use chrono::{NaiveDate, SecondsFormat, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};
use tauri::{AppHandle, Manager};

use crate::append_sync_log;

const DELTAVA_TOUR_PROGRESS_FILE: &str = "dva-tour-progress.json";
const DELTAVA_TOURS_CACHE_FILE: &str = "dva-tours-cache.json";
const DELTAVA_LOGBOOK_FALLBACK_FILE: &str = "deltava-logbook.json";
const DELTAVA_TOUR_PROGRESS_SOURCE: &str = "deltava-logbook";
const AIRPORT_CATALOG_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/data/airports.json"
));

static AIRPORT_CROSSWALK: OnceLock<AirportCrosswalk> = OnceLock::new();

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeltaTourProgressCache {
    source: String,
    last_sync_at: Option<String>,
    tour_progress: BTreeMap<String, DeltaTourProgressTour>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaTourProgressTour {
    rows: BTreeMap<String, DeltaTourProgressRow>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaTourProgressRow {
    completed: bool,
    completed_at: Option<String>,
    completion_order: Option<u32>,
    source: String,
}

#[derive(Clone, Debug)]
struct LogbookEntryMatch {
    entry_index: usize,
    entry: Value,
    epoch_seconds: Option<i64>,
    completed_at: Option<String>,
}

#[derive(Clone, Debug)]
struct AirportIdentifiers {
    icao: Option<String>,
    iata: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct AirportCatalogRecord {
    icao: Option<String>,
    iata: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct AirportCatalogRoot {
    airports: Vec<AirportCatalogRecord>,
}

#[derive(Clone, Debug)]
struct AirportCrosswalk {
    by_icao: HashMap<String, AirportIdentifiers>,
    by_iata: HashMap<String, AirportIdentifiers>,
}

fn app_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app storage path: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Unable to create app data directory: {error}"))?;

    Ok(app_data_dir)
}

fn tour_progress_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_dir(app)?.join(DELTAVA_TOUR_PROGRESS_FILE))
}

fn tours_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_dir(app)?.join(DELTAVA_TOURS_CACHE_FILE))
}

fn build_logbook_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Unable to resolve logbook storage path: {error}"))?;
    let logbook_dir = base_dir.join("deltava-sync").join("logbook");
    fs::create_dir_all(&logbook_dir)
        .map_err(|error| format!("Unable to create logbook storage: {error}"))?;
    Ok(logbook_dir)
}

fn resolve_existing_logbook_json_path(app: &AppHandle) -> Option<PathBuf> {
    let logbook_dir = build_logbook_dir(app).ok()?;
    let fallback_path = logbook_dir.join(DELTAVA_LOGBOOK_FALLBACK_FILE);
    if fallback_path.is_file() {
        return Some(fallback_path);
    }

    fs::read_dir(logbook_dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let is_json = path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("json"))
                .unwrap_or(false);
            if !path.is_file() || !is_json {
                return None;
            }

            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

fn read_json_value(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&text).ok()
}

fn find_logbook_entries(json: &Value) -> Option<&Vec<Value>> {
    json.as_array()
        .or_else(|| json.get("flights").and_then(Value::as_array))
}

fn normalize_logbook_month(raw_month: u32) -> Option<u32> {
    if raw_month <= 11 {
        return raw_month.checked_add(1);
    }

    if raw_month == 12 {
        return Some(12);
    }

    None
}

fn extract_logbook_date_parts(entry: &Value) -> Option<(i32, u32, u32)> {
    let date = entry.get("date")?;
    let year = date
        .get("y")
        .and_then(Value::as_i64)
        .and_then(|number| i32::try_from(number).ok())?;
    let month = date
        .get("m")
        .and_then(Value::as_i64)
        .and_then(|number| u32::try_from(number).ok())?;
    let day = date
        .get("d")
        .and_then(Value::as_i64)
        .and_then(|number| u32::try_from(number).ok())?;

    if day < 1 {
        return None;
    }

    Some((year, month, day))
}

fn epoch_seconds_to_iso(epoch_seconds: i64) -> Option<String> {
    Utc.timestamp_opt(epoch_seconds, 0)
        .single()
        .map(|timestamp| timestamp.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn extract_logbook_entry_epoch_seconds(entry: &Value) -> Option<i64> {
    for key in [
        "epoch",
        "epochSeconds",
        "epoch_seconds",
        "timestamp",
        "time",
        "timeUtc",
        "completedAt",
        "completed_at",
    ] {
        if let Some(value) = entry.get(key).and_then(normalize_epoch_seconds) {
            return Some(value);
        }
    }

    let (year, raw_month, day) = extract_logbook_date_parts(entry)?;
    let month = normalize_logbook_month(raw_month)?;
    let date = NaiveDate::from_ymd_opt(year, month, day)?;
    date.and_hms_opt(0, 0, 0)
        .map(|datetime| Utc.from_utc_datetime(&datetime).timestamp())
}

fn build_logbook_entry_completed_at(entry: &Value) -> Option<String> {
    extract_logbook_entry_epoch_seconds(entry).and_then(epoch_seconds_to_iso)
}

fn normalize_text(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_compact_text(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_uppercase()
}

fn build_airport_crosswalk() -> AirportCrosswalk {
    let root =
        serde_json::from_str::<AirportCatalogRoot>(AIRPORT_CATALOG_JSON).unwrap_or_else(|_| {
            AirportCatalogRoot {
                airports: Vec::new(),
            }
        });

    let mut by_icao = HashMap::new();
    let mut by_iata = HashMap::new();

    for airport in root.airports {
        let icao = airport
            .icao
            .as_deref()
            .and_then(normalize_airport_code)
            .unwrap_or_default();
        let iata = airport
            .iata
            .as_deref()
            .and_then(normalize_airport_code)
            .filter(|code| code.len() == 3);

        if icao.is_empty() && iata.is_none() {
            continue;
        }

        let identifiers = AirportIdentifiers {
            icao: if icao.is_empty() {
                None
            } else {
                Some(icao.clone())
            },
            iata: iata.clone(),
        };

        if let Some(code) = &identifiers.icao {
            by_icao.insert(code.clone(), identifiers.clone());
        }

        if let Some(code) = &identifiers.iata {
            by_iata.insert(code.clone(), identifiers.clone());
        }
    }

    AirportCrosswalk { by_icao, by_iata }
}

fn airport_crosswalk() -> &'static AirportCrosswalk {
    AIRPORT_CROSSWALK.get_or_init(build_airport_crosswalk)
}

fn airport_identifiers_from_code(value: &str) -> Option<AirportIdentifiers> {
    let normalized = normalize_airport_code(value)?;
    let catalog = airport_crosswalk();

    if normalized.len() == 4 {
        if let Some(record) = catalog.by_icao.get(&normalized) {
            return Some(record.clone());
        }
        return Some(AirportIdentifiers {
            icao: Some(normalized),
            iata: None,
        });
    }

    if normalized.len() == 3 {
        if let Some(record) = catalog.by_iata.get(&normalized) {
            return Some(record.clone());
        }
        return Some(AirportIdentifiers {
            icao: None,
            iata: Some(normalized),
        });
    }

    None
}

fn airport_identifier_matches(left: &AirportIdentifiers, right: &AirportIdentifiers) -> bool {
    if let (Some(left_icao), Some(right_icao)) = (left.icao.as_ref(), right.icao.as_ref()) {
        if left_icao == right_icao {
            return true;
        }
    }

    if let (Some(left_iata), Some(right_iata)) = (left.iata.as_ref(), right.iata.as_ref()) {
        if left_iata == right_iata {
            return true;
        }
    }

    if let (Some(left_icao), Some(right_iata)) = (left.icao.as_ref(), right.iata.as_ref()) {
        if let Some(record) = airport_crosswalk().by_icao.get(left_icao) {
            if record.iata.as_ref() == Some(right_iata) {
                return true;
            }
        }
    }

    if let (Some(left_iata), Some(right_icao)) = (left.iata.as_ref(), right.icao.as_ref()) {
        if let Some(record) = airport_crosswalk().by_icao.get(right_icao) {
            if record.iata.as_ref() == Some(left_iata) {
                return true;
            }
        }
    }

    if let (Some(left_icao), Some(right_icao)) = (left.icao.as_ref(), right.icao.as_ref()) {
        if let (Some(left_record), Some(right_record)) = (
            airport_crosswalk().by_icao.get(left_icao),
            airport_crosswalk().by_icao.get(right_icao),
        ) {
            if left_record.icao == right_record.icao {
                return true;
            }
        }
    }

    false
}

fn extract_bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    for key in keys {
        if let Some(entry) = value.get(*key) {
            match entry {
                Value::Bool(flag) => return Some(*flag),
                Value::Number(number) => {
                    if number.as_i64() == Some(1) {
                        return Some(true);
                    }
                    if number.as_i64() == Some(0) {
                        return Some(false);
                    }
                }
                Value::String(text) => {
                    let normalized = text.trim().to_ascii_lowercase();
                    if ["true", "yes", "1", "y"].contains(&normalized.as_str()) {
                        return Some(true);
                    }
                    if ["false", "no", "0", "n"].contains(&normalized.as_str()) {
                        return Some(false);
                    }
                }
                _ => {}
            }
        }
    }

    None
}

fn extract_tour_window_seconds(tour: &Value) -> (Option<i64>, Option<i64>) {
    let start_seconds = tour
        .get("startDate")
        .or_else(|| tour.get("start_date"))
        .and_then(normalize_epoch_seconds);
    let end_seconds = tour
        .get("endDate")
        .or_else(|| tour.get("end_date"))
        .and_then(normalize_epoch_seconds);

    (start_seconds, end_seconds)
}

fn extract_leg_number(value: &Value, keys: &[&str]) -> Option<i64> {
    for key in keys {
        if let Some(number) = value.get(*key).and_then(Value::as_i64) {
            return Some(number);
        }
        if let Some(text) = value.get(*key).and_then(Value::as_str) {
            if let Ok(number) = text.trim().parse::<i64>() {
                return Some(number);
            }
        }
    }

    None
}

fn extract_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(text) = map.get(*key).and_then(Value::as_str) {
                    let normalized = normalize_text(text);
                    if !normalized.is_empty() {
                        return Some(normalized);
                    }
                }
            }

            for child in map.values() {
                if let Some(text) = extract_string_field(child, keys) {
                    return Some(text);
                }
            }

            None
        }
        Value::Array(items) => items
            .iter()
            .find_map(|item| extract_string_field(item, keys)),
        Value::String(text) => {
            let normalized = normalize_text(text);
            if normalized.is_empty() {
                None
            } else {
                Some(normalized)
            }
        }
        _ => None,
    }
}

fn extract_airport_code(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(child) = map.get(*key) {
                    if let Some(code) = extract_airport_code(child, &[]) {
                        return Some(code);
                    }
                }
            }

            for key in ["icao", "iata", "code", "airportCode", "fsIcao", "id"] {
                if let Some(text) = map.get(key).and_then(Value::as_str) {
                    if let Some(code) = normalize_airport_code(text) {
                        return Some(code);
                    }
                }
            }

            for child in map.values() {
                if let Some(code) = extract_airport_code(child, keys) {
                    return Some(code);
                }
            }

            None
        }
        Value::Array(items) => items
            .iter()
            .find_map(|item| extract_airport_code(item, keys)),
        Value::String(text) => normalize_airport_code(text),
        _ => None,
    }
}

fn extract_airline_code(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(child) = map.get(*key) {
                    if let Some(code) = extract_airline_code(child, &[]) {
                        return Some(code);
                    }
                }
            }

            for key in [
                "airlineIcao",
                "airlineCode",
                "icao",
                "iata",
                "code",
                "carrier",
            ] {
                if let Some(text) = map.get(key).and_then(Value::as_str) {
                    if let Some(code) = normalize_airline_code(text) {
                        return Some(code);
                    }
                }
            }

            for child in map.values() {
                if let Some(code) = extract_airline_code(child, keys) {
                    return Some(code);
                }
            }

            None
        }
        Value::Array(items) => items
            .iter()
            .find_map(|item| extract_airline_code(item, keys)),
        Value::String(text) => normalize_airline_code(text),
        _ => None,
    }
}

fn extract_flight_number(value: &Value, keys: &[&str]) -> Option<String> {
    extract_string_field(value, keys).and_then(|text| normalize_flight_number(&text))
}

fn extract_equipment(value: &Value, keys: &[&str]) -> Option<String> {
    extract_string_field(value, keys).and_then(|text| normalize_equipment(&text))
}

fn extract_tour_path(tour: &Value) -> Option<String> {
    extract_string_field(tour, &["tourPath", "path", "id"])
}

fn extract_tour_rows(tour: &Value) -> Vec<Value> {
    tour.get("rows")
        .and_then(Value::as_array)
        .or_else(|| tour.get("flights").and_then(Value::as_array))
        .cloned()
        .unwrap_or_default()
}

fn extract_tour_row_id(tour_path: &str, row: &Value, index: usize) -> String {
    extract_string_field(row, &["tourRowId", "flightId", "sourceId", "id"]).unwrap_or_else(|| {
        let tour_row_number = row
            .get("leg")
            .and_then(Value::as_i64)
            .unwrap_or((index + 1) as i64);
        format!("{tour_path}:leg-{tour_row_number}")
    })
}

struct MatchEvaluation {
    score: i32,
    reason: Option<String>,
}

fn format_reject_reason(context: &str, detail: impl Into<String>) -> String {
    format!("{context}:{}", detail.into())
}

fn evaluate_logbook_entry_match(
    logbook_entry: &Value,
    tour_leg: &Value,
    tour_start_seconds: Option<i64>,
    tour_end_seconds: Option<i64>,
) -> MatchEvaluation {
    let entry_seconds = extract_logbook_entry_epoch_seconds(logbook_entry);
    if let Some(entry_seconds) = entry_seconds {
        if let Some(start_seconds) = tour_start_seconds {
            if entry_seconds < start_seconds {
                return MatchEvaluation {
                    score: 0,
                    reason: Some(format_reject_reason(
                        "date-window",
                        format!("before-start:{entry_seconds}<{start_seconds}"),
                    )),
                };
            }
        }

        if let Some(end_seconds) = tour_end_seconds {
            if entry_seconds > end_seconds {
                return MatchEvaluation {
                    score: 0,
                    reason: Some(format_reject_reason(
                        "date-window",
                        format!("after-end:{entry_seconds}>{end_seconds}"),
                    )),
                };
            }
        }
    }

    let log_departure = extract_airport_code(
        logbook_entry,
        &[
            "airportD",
            "departureAirport",
            "departure",
            "dep",
            "from",
            "origin",
            "fromIcao",
            "depIcao",
            "departureIcao",
        ],
    );
    let log_arrival = extract_airport_code(
        logbook_entry,
        &[
            "airportA",
            "arrivalAirport",
            "arrival",
            "arr",
            "to",
            "destination",
            "toIcao",
            "arrIcao",
            "arrivalIcao",
        ],
    );
    let leg_departure = extract_airport_code(
        tour_leg,
        &[
            "from",
            "departure",
            "departureAirport",
            "airportD",
            "dep",
            "fromAirport",
            "departureIcao",
        ],
    );
    let leg_arrival = extract_airport_code(
        tour_leg,
        &[
            "to",
            "destination",
            "arrivalAirport",
            "airportA",
            "arr",
            "toAirport",
            "arrivalIcao",
        ],
    );

    let log_airport_departure = log_departure
        .as_deref()
        .and_then(airport_identifiers_from_code);
    let log_airport_arrival = log_arrival
        .as_deref()
        .and_then(airport_identifiers_from_code);
    let leg_airport_departure = leg_departure
        .as_deref()
        .and_then(airport_identifiers_from_code);
    let leg_airport_arrival = leg_arrival
        .as_deref()
        .and_then(airport_identifiers_from_code);

    let log_airline = extract_airline_code(
        logbook_entry,
        &["airline", "airlineIcao", "airlineCode", "carrier"],
    );
    let leg_airline = extract_airline_code(
        tour_leg,
        &["airline", "airlineIcao", "airlineCode", "airlineName"],
    );

    let log_flight_number = extract_flight_number(
        logbook_entry,
        &[
            "flightNumber",
            "flight",
            "flightNo",
            "number",
            "callsign",
            "flightCode",
        ],
    );
    let leg_flight_number = extract_flight_number(
        tour_leg,
        &["flightNumber", "tourFlightNumber", "flight", "flightCode"],
    );

    let log_equipment = extract_equipment(
        logbook_entry,
        &["eqType", "equipment", "aircraft", "aircraftType", "type"],
    );
    let leg_equipment = extract_equipment(tour_leg, &["equipment", "aircraft"]);

    let log_leg = extract_leg_number(
        logbook_entry,
        &["leg", "flightLeg", "tourLeg", "tourLegNumber", "tour_leg"],
    );
    let leg_leg = extract_leg_number(tour_leg, &["leg", "tourLeg", "tourLegNumber"]);
    let require_leg = extract_bool_field(tour_leg, &["matchLeg", "match_leg"]).unwrap_or(false);
    let require_equipment =
        extract_bool_field(tour_leg, &["matchEQ", "matchEq", "match_eq"]).unwrap_or(false);

    let mut score = 0;
    let mut has_route_evidence = false;

    if let (Some(log_value), Some(leg_value)) = (
        log_airport_departure.as_ref(),
        leg_airport_departure.as_ref(),
    ) {
        if !airport_identifier_matches(log_value, leg_value) {
            return MatchEvaluation {
                score: 0,
                reason: Some(format_reject_reason(
                    "airport",
                    format!(
                        "departure-mismatch:{}!={}",
                        log_departure.unwrap_or_default(),
                        leg_departure.unwrap_or_default()
                    ),
                )),
            };
        }
        score += 40;
        has_route_evidence = true;
    }

    if let (Some(log_value), Some(leg_value)) =
        (log_airport_arrival.as_ref(), leg_airport_arrival.as_ref())
    {
        if !airport_identifier_matches(log_value, leg_value) {
            return MatchEvaluation {
                score: 0,
                reason: Some(format_reject_reason(
                    "airport",
                    format!(
                        "arrival-mismatch:{}!={}",
                        log_arrival.unwrap_or_default(),
                        leg_arrival.unwrap_or_default()
                    ),
                )),
            };
        }
        score += 40;
        has_route_evidence = true;
    }

    if let (Some(log_value), Some(leg_value)) = (log_airline.as_ref(), leg_airline.as_ref()) {
        if log_value != leg_value {
            return MatchEvaluation {
                score: 0,
                reason: Some(format_reject_reason(
                    "airline",
                    format!("mismatch:{log_value}!={leg_value}"),
                )),
            };
        }
        score += 10;
    }

    if let (Some(log_value), Some(leg_value)) =
        (log_flight_number.as_ref(), leg_flight_number.as_ref())
    {
        if log_value != leg_value {
            return MatchEvaluation {
                score: 0,
                reason: Some(format_reject_reason(
                    "flight-number",
                    format!("mismatch:{log_value}!={leg_value}"),
                )),
            };
        }
        score += 20;
    }

    if require_leg && log_leg.is_none() {
        return MatchEvaluation {
            score: 0,
            reason: Some("leg:missing-logbook-leg".to_string()),
        };
    }

    if let (Some(log_value), Some(leg_value)) = (log_leg, leg_leg) {
        if log_value != leg_value {
            return MatchEvaluation {
                score: 0,
                reason: Some(format_reject_reason(
                    "leg",
                    format!("mismatch:{log_value}!={leg_value}"),
                )),
            };
        }
        score += 10;
    }

    if require_equipment {
        if let (Some(log_value), Some(leg_value)) = (log_equipment.as_ref(), leg_equipment.as_ref())
        {
            if log_value != leg_value {
                return MatchEvaluation {
                    score: 0,
                    reason: Some(format_reject_reason(
                        "equipment",
                        format!("mismatch:{log_value}!={leg_value}"),
                    )),
                };
            }
            score += 5;
        }
    }

    if has_route_evidence || (log_airline.is_some() && log_flight_number.is_some()) {
        return MatchEvaluation {
            score: score.max(1),
            reason: None,
        };
    }

    MatchEvaluation {
        score: 0,
        reason: Some("insufficient-evidence:route-or-flight".to_string()),
    }
}

fn score_logbook_entry_match(
    logbook_entry: &Value,
    tour_leg: &Value,
    tour_start_seconds: Option<i64>,
    tour_end_seconds: Option<i64>,
) -> Option<i32> {
    let evaluation = evaluate_logbook_entry_match(
        logbook_entry,
        tour_leg,
        tour_start_seconds,
        tour_end_seconds,
    );
    if evaluation.reason.is_some() && evaluation.score <= 0 {
        None
    } else {
        Some(evaluation.score)
    }
}

fn build_logbook_entry_matches(logbook_json: &Value) -> Vec<LogbookEntryMatch> {
    let Some(entries) = find_logbook_entries(logbook_json) else {
        return Vec::new();
    };

    entries
        .iter()
        .enumerate()
        .map(|(index, entry)| LogbookEntryMatch {
            entry_index: index,
            entry: entry.clone(),
            epoch_seconds: extract_logbook_entry_epoch_seconds(entry),
            completed_at: build_logbook_entry_completed_at(entry),
        })
        .collect()
}

fn build_tour_progress_rows_with_debug(
    entries: &[LogbookEntryMatch],
    tour_rows: &[Value],
    tour_path: &str,
    tour_start_seconds: Option<i64>,
    tour_end_seconds: Option<i64>,
    rejected_reasons: Option<&mut Vec<String>>,
    matched_row_ids: Option<&mut Vec<String>>,
) -> BTreeMap<String, DeltaTourProgressRow> {
    let mut matched_rows = Vec::new();
    let mut used_entry_indices = HashSet::new();
    let mut rejected_reasons = rejected_reasons;
    let mut matched_row_ids = matched_row_ids;

    for (index, row) in tour_rows.iter().enumerate() {
        let tour_row_id = extract_tour_row_id(tour_path, row, index);

        let mut best_match: Option<(i32, Option<i64>, usize)> = None;
        for entry in entries {
            if used_entry_indices.contains(&entry.entry_index) {
                continue;
            }

            let evaluation = evaluate_logbook_entry_match(
                &entry.entry,
                row,
                tour_start_seconds,
                tour_end_seconds,
            );
            if evaluation.score <= 0 {
                if let Some(reason) = evaluation.reason {
                    if let Some(rejected_reasons) = rejected_reasons.as_deref_mut() {
                        if rejected_reasons.len() < 10 {
                            rejected_reasons.push(format!(
                                "tour={tour_path} row={tour_row_id} entry#{} reason={reason}",
                                entry.entry_index
                            ));
                        }
                    }
                }
                continue;
            }

            let score = evaluation.score;
            let candidate = (score, entry.epoch_seconds, entry.entry_index);
            if is_better_match(best_match, candidate) {
                best_match = Some(candidate);
            }
        }

        let Some((_, epoch_seconds, entry_index)) = best_match else {
            continue;
        };

        used_entry_indices.insert(entry_index);
        if let Some(matched_row_ids) = matched_row_ids.as_deref_mut() {
            if matched_row_ids.len() < 10 {
                matched_row_ids.push(tour_row_id.clone());
            }
        }
        let completed_at = entries
            .iter()
            .find(|entry| entry.entry_index == entry_index)
            .and_then(|entry| entry.completed_at.clone())
            .or_else(|| epoch_seconds.and_then(epoch_seconds_to_iso));

        matched_rows.push((
            tour_row_id,
            epoch_seconds,
            index,
            DeltaTourProgressRow {
                completed: true,
                completed_at,
                completion_order: None,
                source: DELTAVA_TOUR_PROGRESS_SOURCE.to_string(),
            },
        ));
    }

    matched_rows.sort_by(|left, right| {
        left.1
            .unwrap_or(i64::MAX)
            .cmp(&right.1.unwrap_or(i64::MAX))
            .then_with(|| left.2.cmp(&right.2))
            .then_with(|| left.0.cmp(&right.0))
    });

    let mut rows = BTreeMap::new();
    for (completion_index, (tour_row_id, _, _, mut row)) in matched_rows.into_iter().enumerate() {
        row.completion_order = u32::try_from(completion_index + 1).ok();
        rows.insert(tour_row_id, row);
    }

    rows
}

fn is_better_match(
    current: Option<(i32, Option<i64>, usize)>,
    candidate: (i32, Option<i64>, usize),
) -> bool {
    match current {
        None => true,
        Some(existing) => {
            candidate.0 > existing.0
                || (candidate.0 == existing.0
                    && candidate.1.unwrap_or(i64::MAX) < existing.1.unwrap_or(i64::MAX))
                || (candidate.0 == existing.0
                    && candidate.1 == existing.1
                    && candidate.2 < existing.2)
        }
    }
}

#[cfg(debug_assertions)]
fn log_tour_progress_debug(message: &str) {
    append_sync_log(message);
}

#[cfg(not(debug_assertions))]
fn log_tour_progress_debug(_: &str) {}

fn build_tour_progress_from_value(
    tours_json: &Value,
    logbook_json: &Value,
) -> DeltaTourProgressCache {
    let entries = build_logbook_entry_matches(logbook_json);
    let total_logbook_entries_considered = entries.len();
    let total_logbook_entries_with_usable_dates = entries
        .iter()
        .filter(|entry| entry.epoch_seconds.is_some())
        .count();
    let mut tour_progress = BTreeMap::new();
    let tours = tours_json
        .as_array()
        .cloned()
        .or_else(|| tours_json.get("tours").and_then(Value::as_array).cloned())
        .unwrap_or_default();
    let mut total_current_tours = 0usize;
    let mut total_upcoming_tours = 0usize;
    let mut total_expired_tours = 0usize;
    let mut total_tour_rows = 0usize;
    let mut total_matched_tour_completions = 0usize;
    let mut total_unmatched_candidates = 0usize;

    for tour in tours {
        let Some(tour_path) = extract_tour_path(&tour) else {
            continue;
        };

        let tour_name =
            extract_string_field(&tour, &["name", "label"]).unwrap_or_else(|| tour_path.clone());
        let active = extract_bool_field(&tour, &["active"]).unwrap_or(false);
        let (start_seconds, end_seconds) = extract_tour_window_seconds(&tour);
        let visibility_status = if end_seconds.is_some_and(|value| value < Utc::now().timestamp()) {
            "expired"
        } else if active && start_seconds.is_some_and(|value| value > Utc::now().timestamp()) {
            "upcoming"
        } else {
            "current"
        };
        match visibility_status {
            "current" => total_current_tours += 1,
            "upcoming" => total_upcoming_tours += 1,
            "expired" => total_expired_tours += 1,
            _ => {}
        }

        let tour_rows = extract_tour_rows(&tour);
        total_tour_rows += tour_rows.len();

        let mut matched_row_ids = Vec::new();
        let mut rejected_reasons = Vec::new();
        let rows = build_tour_progress_rows_with_debug(
            &entries,
            &tour_rows,
            &tour_path,
            start_seconds,
            end_seconds,
            Some(&mut rejected_reasons),
            Some(&mut matched_row_ids),
        );
        total_matched_tour_completions += rows.len();
        total_unmatched_candidates += entries
            .iter()
            .filter(|entry| entry.epoch_seconds.is_some())
            .count()
            .saturating_sub(rows.len());

        log_tour_progress_debug(&format!(
            "tour-progress:tour {}",
            serde_json::json!({
                "tourId": tour_path,
                "tourName": tour_name,
                "visibilityStatus": visibility_status,
                "rawActive": active,
                "startDateSeconds": start_seconds,
                "endDateSeconds": end_seconds,
                "rowCount": tour_rows.len(),
                "progressCount": rows.len(),
                "matchedRowIds": matched_row_ids,
                "rejectedReasons": rejected_reasons
            })
        ));

        if rows.is_empty() {
            continue;
        }

        tour_progress.insert(tour_path, DeltaTourProgressTour { rows });
    }

    log_tour_progress_debug(&format!(
        "tour-progress:summary {}",
        serde_json::json!({
            "totalSyncedTours": total_current_tours + total_upcoming_tours + total_expired_tours,
            "totalCurrentTours": total_current_tours,
            "totalUpcomingTours": total_upcoming_tours,
            "totalExpiredTours": total_expired_tours,
            "totalTourRows": total_tour_rows,
            "totalLogbookEntriesConsidered": total_logbook_entries_considered,
            "totalLogbookEntriesWithUsableDates": total_logbook_entries_with_usable_dates,
            "totalMatchedTourCompletions": total_matched_tour_completions,
            "totalUnmatchedCandidates": total_unmatched_candidates,
            "derivedCompletionOutputKey": DELTAVA_TOUR_PROGRESS_FILE
        })
    ));

    DeltaTourProgressCache {
        source: DELTAVA_TOUR_PROGRESS_SOURCE.to_string(),
        last_sync_at: None,
        tour_progress,
    }
}

fn write_tour_progress_cache(
    app: &AppHandle,
    cache: &DeltaTourProgressCache,
) -> Result<(), String> {
    let path = tour_progress_cache_path(app)?;
    let serialized = serde_json::to_string_pretty(cache).map_err(|error| {
        format!("download_failed: Unable to serialize Delta Virtual tour progress cache: {error}")
    })?;

    fs::write(&path, serialized).map_err(|error| {
        format!("download_failed: Unable to write Delta Virtual tour progress cache: {error}")
    })?;
    append_sync_log(&format!("tour-progress:write {}", path.display()));
    Ok(())
}

fn read_tours_cache_json(app: &AppHandle) -> Value {
    let Ok(path) = tours_cache_path(app) else {
        return Value::Null;
    };

    read_json_value(&path).unwrap_or(Value::Null)
}

fn read_logbook_json(app: &AppHandle) -> Value {
    let Some(path) = resolve_existing_logbook_json_path(app) else {
        return Value::Null;
    };

    read_json_value(&path).unwrap_or(Value::Null)
}

pub(crate) fn reconcile_deltava_tour_progress_internal(app: &AppHandle) -> Result<(), String> {
    let tours_json = read_tours_cache_json(app);
    let logbook_json = read_logbook_json(app);
    let mut cache = build_tour_progress_from_value(&tours_json, &logbook_json);
    cache.last_sync_at = Some(Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true));
    write_tour_progress_cache(app, &cache)
}

pub fn build_dva_tour_completion_from_logbook(
    logbook_json: &Value,
    tours_json: &Value,
) -> DeltaTourProgressCache {
    build_tour_progress_from_value(tours_json, logbook_json)
}

pub fn match_logbook_entry_to_tour_leg(logbook_entry: &Value, tour_leg: &Value) -> bool {
    score_logbook_entry_match(logbook_entry, tour_leg, None, None).is_some()
}

pub fn normalize_airport_code(value: &str) -> Option<String> {
    let normalized = normalize_compact_text(value);
    if (3..=4).contains(&normalized.len()) {
        return Some(normalized);
    }

    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .map(normalize_compact_text)
        .find(|part| (3..=4).contains(&part.len()))
}

pub fn normalize_airline_code(value: &str) -> Option<String> {
    let normalized = normalize_compact_text(value);
    if (2..=3).contains(&normalized.len()) {
        return Some(normalized);
    }

    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .map(normalize_compact_text)
        .find(|part| (2..=3).contains(&part.len()))
}

pub fn normalize_flight_number(value: &str) -> Option<String> {
    let normalized = normalize_compact_text(value);
    if normalized.is_empty() {
        return None;
    }

    for prefix_len in 2..=3 {
        if normalized.len() <= prefix_len {
            continue;
        }

        let (prefix, suffix) = normalized.split_at(prefix_len);
        if prefix
            .chars()
            .all(|character| character.is_ascii_alphabetic())
            && suffix
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_digit())
        {
            let stripped = suffix.trim_start_matches('0');
            return Some(if stripped.is_empty() {
                suffix.to_string()
            } else {
                stripped.to_string()
            });
        }
    }

    let stripped = normalized.trim_start_matches('0');
    Some(if stripped.is_empty() {
        normalized
    } else {
        stripped.to_string()
    })
}

pub fn normalize_equipment(value: &str) -> Option<String> {
    let normalized = normalize_compact_text(value);
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub fn normalize_epoch_seconds(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => {
            if let Some(epoch) = number.as_i64() {
                if epoch > 10_000_000_000 {
                    Some(epoch / 1000)
                } else {
                    Some(epoch)
                }
            } else {
                number.as_f64().and_then(|float_value| {
                    if !float_value.is_finite() || float_value <= 0.0 {
                        return None;
                    }

                    let epoch = float_value as i64;
                    Some(if epoch > 10_000_000_000 {
                        epoch / 1000
                    } else {
                        epoch
                    })
                })
            }
        }
        Value::String(text) => {
            let normalized = text.trim();
            if normalized.is_empty()
                || normalized.eq_ignore_ascii_case("null")
                || normalized.eq_ignore_ascii_case("undefined")
            {
                return None;
            }

            normalized.parse::<f64>().ok().and_then(|float_value| {
                if !float_value.is_finite() || float_value <= 0.0 {
                    return None;
                }

                let epoch = float_value as i64;
                Some(if epoch > 10_000_000_000 {
                    epoch / 1000
                } else {
                    epoch
                })
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalize_helpers_handle_expected_variants() {
        assert_eq!(normalize_airport_code(" kAtl "), Some("KATL".to_string()));
        assert_eq!(normalize_airline_code(" dal "), Some("DAL".to_string()));
        assert_eq!(
            normalize_flight_number(" DAL 0123 "),
            Some("123".to_string())
        );
        assert_eq!(
            normalize_equipment(" a320-200 "),
            Some("A320200".to_string())
        );
        assert_eq!(
            normalize_epoch_seconds(&json!(1_717_000_000_000_i64)),
            Some(1_717_000_000)
        );
    }

    #[test]
    fn match_logbook_entry_to_tour_leg_requires_route_or_flight_evidence() {
        let logbook_entry = json!({
            "departureAirport": { "icao": "KATL" },
            "arrivalAirport": { "icao": "KJFK" },
            "airline": "DAL",
            "flightNumber": "0123",
            "eqType": "A320",
            "date": { "y": 2026, "m": 3, "d": 11 }
        });
        let tour_leg = json!({
            "from": "KATL",
            "to": "KJFK",
            "airlineIcao": "DAL",
            "tourFlightNumber": "123",
            "equipment": "A320"
        });

        assert!(match_logbook_entry_to_tour_leg(&logbook_entry, &tour_leg));
    }

    #[test]
    fn match_logbook_entry_to_tour_leg_accepts_iata_to_icao_crosswalk() {
        let logbook_entry = json!({
            "departureAirport": { "iata": "ATL" },
            "arrivalAirport": { "iata": "JFK" },
            "airline": "DAL",
            "flightNumber": "123",
            "date": { "y": 2026, "m": 3, "d": 11 }
        });
        let tour_leg = json!({
            "from": "KATL",
            "to": "KJFK",
            "airlineIcao": "DAL",
            "tourFlightNumber": "123"
        });

        assert!(match_logbook_entry_to_tour_leg(&logbook_entry, &tour_leg));
    }

    #[test]
    fn match_logbook_entry_to_tour_leg_rejects_missing_leg_when_required() {
        let logbook_entry = json!({
            "departureAirport": { "icao": "KATL" },
            "arrivalAirport": { "icao": "KJFK" },
            "airline": "DAL",
            "flightNumber": "123",
            "date": { "y": 2026, "m": 3, "d": 11 }
        });
        let tour_leg = json!({
            "from": "KATL",
            "to": "KJFK",
            "airlineIcao": "DAL",
            "tourFlightNumber": "123",
            "matchLeg": true,
            "leg": 1
        });

        assert!(!match_logbook_entry_to_tour_leg(&logbook_entry, &tour_leg));
    }

    #[test]
    fn build_completion_map_uses_tour_scoped_row_ids() {
        let logbook_json = json!({
            "flights": [
                {
                    "departureAirport": { "icao": "KATL" },
                    "arrivalAirport": { "icao": "KJFK" },
                    "airline": "DAL",
                    "flightNumber": "123",
                    "date": { "y": 2026, "m": 3, "d": 11 }
                }
            ]
        });
        let tours_json = json!({
            "tours": [
                {
                    "path": "dva:tour-1",
                    "rows": [
                        {
                            "tourRowId": "dva:tour-1:leg-1",
                            "from": "KATL",
                            "to": "KJFK",
                            "airline": "DAL",
                            "tourFlightNumber": "123"
                        },
                        {
                            "tourRowId": "dva:tour-1:leg-2",
                            "from": "KJFK",
                            "to": "KLAX",
                            "airline": "DAL",
                            "tourFlightNumber": "456"
                        }
                    ]
                }
            ]
        });

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        let tour = cache
            .tour_progress
            .get("dva:tour-1")
            .expect("tour progress");
        let row = tour.rows.get("dva:tour-1:leg-1").expect("completed row");
        assert!(row.completed);
        assert_eq!(row.source, DELTAVA_TOUR_PROGRESS_SOURCE);
        assert_eq!(row.completion_order, Some(1));
        assert!(!tour.rows.contains_key("dva:tour-1:leg-2"));
    }

    #[test]
    fn build_completion_map_respects_tour_date_window() {
        let logbook_json = json!({
            "flights": [
                {
                    "departureAirport": { "icao": "KATL" },
                    "arrivalAirport": { "icao": "KJFK" },
                    "airline": "DAL",
                    "flightNumber": "123",
                    "epochSeconds": 1_770_000_000
                }
            ]
        });
        let tours_json = json!({
            "tours": [
                {
                    "path": "dva:tour-1",
                    "startDate": 1_760_000_000,
                    "endDate": 1_780_000_000,
                    "rows": [
                        {
                            "tourRowId": "dva:tour-1:leg-1",
                            "from": "KATL",
                            "to": "KJFK",
                            "airline": "DAL",
                            "tourFlightNumber": "123"
                        }
                    ]
                },
                {
                    "path": "dva:tour-2",
                    "startDate": 1_700_000_000,
                    "endDate": 1_710_000_000,
                    "rows": [
                        {
                            "tourRowId": "dva:tour-2:leg-1",
                            "from": "KATL",
                            "to": "KJFK",
                            "airline": "DAL",
                            "tourFlightNumber": "123"
                        }
                    ]
                }
            ]
        });

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(cache.tour_progress.contains_key("dva:tour-1"));
        assert!(!cache.tour_progress.contains_key("dva:tour-2"));
    }
}
