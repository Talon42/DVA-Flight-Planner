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
use crate::services::deltava::logbook::normalize_logbook_entries;

const DELTAVA_TOUR_PROGRESS_FILE: &str = "dva-tour-progress.json";
const DELTAVA_TOURS_CACHE_FILE: &str = "dva-tours-cache.json";
const DELTAVA_TOUR_PROGRESS_SOURCE: &str = "deltava-logbook";
const DVA_TOUR_PROGRESS_VERBOSE_LOGGING: bool = false;
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
    match_type: Option<String>,
    credited_tour_name: Option<String>,
    credited_tour_leg: Option<i64>,
    logbook_entry_id: Option<String>,
}

#[derive(Clone, Debug)]
struct LogbookTourCreditCandidate {
    entry_index: usize,
    epoch_seconds: Option<i64>,
    completed_at: Option<String>,
    logbook_entry_id: Option<String>,
    logbook_status: Option<String>,
    logbook_departure: Option<String>,
    logbook_arrival: Option<String>,
    credited_tour_name: Option<String>,
    credited_tour_leg: Option<i64>,
    credit_message: Option<String>,
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

fn read_json_value(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&text).ok()
}

fn normalize_logbook_month(raw_month: u32) -> Option<u32> {
    if raw_month <= 11 {
        return Some(raw_month + 1);
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
        "startTime",
        "submittedOn",
        "disposedOn",
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

fn normalize_tour_name_key(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
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

fn extract_logbook_status(value: &Value) -> Option<String> {
    extract_direct_string_field(value, &["status"]).map(|status| status.to_ascii_lowercase())
}

fn is_eligible_logbook_status(status: Option<&str>) -> bool {
    crate::domain::deltava::logbook_status::LogbookStatus::from_raw(status)
        .include_in_tour_eligibility()
}

fn extract_logbook_airport_code(value: &Value, key: &str) -> Option<String> {
    let airport = value.get(key)?;
    airport
        .get("icao")
        .and_then(Value::as_str)
        .and_then(normalize_airport_code)
        .or_else(|| {
            airport
                .get("iata")
                .and_then(Value::as_str)
                .and_then(normalize_airport_code)
        })
        .or_else(|| airport.as_str().and_then(normalize_airport_code))
}

fn extract_logbook_entry_id(value: &Value) -> Option<String> {
    extract_direct_string_field(
        value,
        &[
            "id",
            "logbookId",
            "pirepId",
            "entryId",
            "flightId",
            "sourceId",
        ],
    )
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

fn extract_direct_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    let Value::Object(map) = value else {
        return None;
    };

    for key in keys {
        if let Some(text) = map.get(*key).and_then(Value::as_str) {
            let normalized = normalize_text(text);
            if !normalized.is_empty() {
                return Some(normalized);
            }
        }
    }

    None
}

fn parse_system_tour_credit_message(message: &str) -> Option<(String, i64)> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return None;
    }

    let lower = trimmed.to_ascii_lowercase();
    let prefix = "leg ";
    let suffix = " in flight tour ";

    if !lower.starts_with(prefix) {
        return None;
    }

    let mut index = prefix.len();
    let bytes = trimmed.as_bytes();
    let leg_start = index;
    while index < bytes.len() && bytes[index].is_ascii_digit() {
        index += 1;
    }
    if index == leg_start {
        return None;
    }

    if !lower[index..].starts_with(suffix) {
        return None;
    }

    let tour_name_start = index + suffix.len();
    let tour_name = trimmed[tour_name_start..].trim();
    if tour_name.is_empty() {
        return None;
    }

    let leg = trimmed[leg_start..index].parse::<i64>().ok()?;
    Some((tour_name.to_string(), leg))
}

fn update_indicates_system_credit(update: &Value) -> bool {
    if let Some(flag) = extract_bool_field(update, &["system", "isSystem", "systemUpdate"]) {
        return flag;
    }

    extract_direct_string_field(update, &["type", "status", "source", "kind", "updateType"])
        .map(|value| value.trim().eq_ignore_ascii_case("system"))
        .unwrap_or(false)
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

fn extract_tour_path(tour: &Value) -> Option<String> {
    extract_string_field(tour, &["tourPath", "path", "id"])
        .map(|value| normalize_tour_identifier(&value))
}

fn extract_tour_rows(tour: &Value) -> Vec<Value> {
    tour.get("rows")
        .and_then(Value::as_array)
        .or_else(|| tour.get("flights").and_then(Value::as_array))
        .cloned()
        .unwrap_or_default()
}

fn extract_tour_row_id(tour_path: &str, row: &Value, index: usize) -> String {
    extract_string_field(row, &["tourRowId", "flightId", "sourceId", "id"])
        .map(|value| normalize_tour_identifier(&value))
        .unwrap_or_else(|| {
            let tour_row_number = row
                .get("leg")
                .and_then(Value::as_i64)
                .unwrap_or((index + 1) as i64);
            format!("{tour_path}:leg-{tour_row_number}")
        })
}

// Reads legacy double-prefixed caches while all newly derived progress uses one `dva:` prefix.
fn normalize_tour_identifier(value: &str) -> String {
    let mut normalized = value.trim().to_string();
    while normalized.starts_with("dva:dva:") {
        normalized = normalized.replacen("dva:dva:", "dva:", 1);
    }
    normalized
}

#[derive(Default)]
struct TourProgressMatchStats {
    total_system_tour_credit_candidates: usize,
    total_entries_with_valid_completed_status: usize,
    total_entries_with_date_metadata: usize,
    total_matched_tour_rows: usize,
    total_skipped_tour_name_mismatches: usize,
    total_skipped_route_mismatches: usize,
    total_skipped_ambiguous_routes: usize,
}

#[derive(Debug, Default)]
struct LogbookTourCreditScanResult {
    total_logbook_entries_considered: usize,
    total_entries_with_system_updates: usize,
    credits: Vec<LogbookTourCreditCandidate>,
}

fn build_logbook_tour_credit_scan_from_values(
    logbook_jsons: &[Value],
) -> LogbookTourCreditScanResult {
    let mut result = LogbookTourCreditScanResult::default();
    let mut seen_serializations = HashSet::new();

    for json in logbook_jsons {
        for entry in normalize_logbook_entries(json) {
            let Ok(serialized) = serde_json::to_string(&entry) else {
                continue;
            };

            if !seen_serializations.insert(serialized) {
                continue;
            }

            result.total_logbook_entries_considered += 1;

            let epoch_seconds = extract_logbook_entry_epoch_seconds(&entry);
            let completed_at = build_logbook_entry_completed_at(&entry);
            let logbook_status = extract_logbook_status(&entry);
            let logbook_departure = extract_logbook_airport_code(&entry, "airportD");
            let logbook_arrival = extract_logbook_airport_code(&entry, "airportA");
            let logbook_entry_id = extract_logbook_entry_id(&entry);
            let entry_index = result.total_logbook_entries_considered.saturating_sub(1);
            let mut entry_has_system_update = false;

            let Some(updates) = entry.get("updates").and_then(Value::as_array) else {
                continue;
            };

            for update in updates {
                if !update_indicates_system_credit(update) {
                    continue;
                }

                let Some(message) = extract_direct_string_field(update, &["msg", "message"]) else {
                    continue;
                };

                if let Some((credited_tour_name, credited_tour_leg)) =
                    parse_system_tour_credit_message(&message)
                {
                    entry_has_system_update = true;
                    result.credits.push(LogbookTourCreditCandidate {
                        entry_index,
                        epoch_seconds,
                        completed_at: completed_at.clone(),
                        logbook_entry_id: logbook_entry_id.clone(),
                        logbook_status: logbook_status.clone(),
                        logbook_departure: logbook_departure.clone(),
                        logbook_arrival: logbook_arrival.clone(),
                        credited_tour_name: Some(credited_tour_name),
                        credited_tour_leg: Some(credited_tour_leg),
                        credit_message: Some(message),
                    });
                }
            }

            if entry_has_system_update {
                result.total_entries_with_system_updates += 1;
            }
        }
    }

    result
}

#[allow(clippy::too_many_arguments)] // Reconciliation diagnostics are explicit for deterministic tests.
fn build_tour_progress_rows_with_debug(
    credits: &[LogbookTourCreditCandidate],
    tour_rows: &[Value],
    tour_path: &str,
    tour_name: &str,
    _tour_start_seconds: Option<i64>,
    _tour_end_seconds: Option<i64>,
    stats: &mut TourProgressMatchStats,
    rejected_reasons: Option<&mut Vec<String>>,
    matched_row_ids: Option<&mut Vec<String>>,
) -> BTreeMap<String, DeltaTourProgressRow> {
    let mut matched_rows = Vec::new();
    let mut used_row_ids = HashSet::new();
    let mut rejected_reasons = rejected_reasons;
    let mut matched_row_ids = matched_row_ids;
    let normalized_tour_name = normalize_tour_name_key(tour_name);

    for credit in credits {
        let Some(credited_tour_name) = credit.credited_tour_name.as_deref() else {
            continue;
        };

        stats.total_system_tour_credit_candidates += 1;

        if normalize_tour_name_key(credited_tour_name) != normalized_tour_name {
            stats.total_skipped_tour_name_mismatches += 1;
            if let Some(rejected_reasons) = rejected_reasons.as_deref_mut() {
                if rejected_reasons.len() < 10 {
                    rejected_reasons.push(format!(
                        "tour={tour_path} creditedTourName={credited_tour_name} reason=tour-name-mismatch"
                    ));
                }
            }
            log_tour_progress_credit_skip_debug(
                tour_path,
                tour_name,
                credit,
                "tour-name-mismatch",
                None,
            );
            continue;
        }

        let Some(status) = credit.logbook_status.as_deref() else {
            if let Some(rejected_reasons) = rejected_reasons.as_deref_mut() {
                if rejected_reasons.len() < 10 {
                    rejected_reasons.push(format!(
                        "tour={tour_path} creditedTourName={credited_tour_name} reason=status-missing"
                    ));
                }
            }
            log_tour_progress_credit_skip_debug(
                tour_path,
                tour_name,
                credit,
                "status-missing",
                Some((tour_path.to_string(), tour_name.to_string())),
            );
            continue;
        };

        if !is_eligible_logbook_status(Some(status)) {
            if let Some(rejected_reasons) = rejected_reasons.as_deref_mut() {
                if rejected_reasons.len() < 10 {
                    rejected_reasons.push(format!(
                        "tour={tour_path} creditedTourName={credited_tour_name} reason=status:{status}"
                    ));
                }
            }
            log_tour_progress_credit_skip_debug(
                tour_path,
                tour_name,
                credit,
                "status-not-eligible",
                Some((tour_path.to_string(), tour_name.to_string())),
            );
            continue;
        }
        stats.total_entries_with_valid_completed_status += 1;

        let entry_seconds = credit.epoch_seconds;
        if entry_seconds.is_some() {
            stats.total_entries_with_date_metadata += 1;
        }

        let log_departure = credit.logbook_departure.as_deref();
        let log_arrival = credit.logbook_arrival.as_deref();
        let mut route_matches = Vec::new();
        for (index, row) in tour_rows.iter().enumerate() {
            let tour_row_id = extract_tour_row_id(tour_path, row, index);
            if used_row_ids.contains(&tour_row_id) {
                continue;
            }

            let row_departure = extract_airport_code(
                row,
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
            let row_arrival = extract_airport_code(
                row,
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

            let Some(log_departure) = log_departure else {
                continue;
            };
            let Some(log_arrival) = log_arrival else {
                continue;
            };

            let Some(row_departure) = row_departure.as_deref() else {
                continue;
            };
            let Some(row_arrival) = row_arrival.as_deref() else {
                continue;
            };

            let Some(log_departure_ids) = airport_identifiers_from_code(log_departure) else {
                continue;
            };
            let Some(log_arrival_ids) = airport_identifiers_from_code(log_arrival) else {
                continue;
            };
            let Some(row_departure_ids) = airport_identifiers_from_code(row_departure) else {
                continue;
            };
            let Some(row_arrival_ids) = airport_identifiers_from_code(row_arrival) else {
                continue;
            };

            if airport_identifier_matches(&log_departure_ids, &row_departure_ids)
                && airport_identifier_matches(&log_arrival_ids, &row_arrival_ids)
            {
                route_matches.push((
                    index,
                    tour_row_id,
                    row_departure.to_string(),
                    row_arrival.to_string(),
                ));
            }
        }

        if route_matches.is_empty() {
            stats.total_skipped_route_mismatches += 1;
            if let Some(rejected_reasons) = rejected_reasons.as_deref_mut() {
                if rejected_reasons.len() < 10 {
                    rejected_reasons.push(format!(
                        "tour={tour_path} creditedTourName={credited_tour_name} reason=route-mismatch departure={} arrival={}",
                        log_departure.unwrap_or_default(),
                        log_arrival.unwrap_or_default()
                    ));
                }
            }
            log_tour_progress_credit_skip_debug(
                tour_path,
                tour_name,
                credit,
                "route-mismatch",
                Some((tour_path.to_string(), tour_name.to_string())),
            );
            continue;
        }

        let selected_route_match = if route_matches.len() == 1 {
            Some(route_matches.remove(0))
        } else if let Some(credited_leg) = credit
            .credited_tour_leg
            .and_then(|value| usize::try_from(value).ok())
        {
            route_matches
                .iter()
                .find(|(index, _, _, _)| index.saturating_add(1) == credited_leg)
                .cloned()
        } else {
            None
        };

        let Some((index, tour_row_id, _, _)) = selected_route_match else {
            stats.total_skipped_ambiguous_routes += 1;
            if let Some(rejected_reasons) = rejected_reasons.as_deref_mut() {
                if rejected_reasons.len() < 10 {
                    rejected_reasons.push(format!(
                        "tour={tour_path} creditedTourName={credited_tour_name} reason=ambiguous-route count={}",
                        route_matches.len()
                    ));
                }
            }
            log_tour_progress_credit_skip_debug(
                tour_path,
                tour_name,
                credit,
                "ambiguous-route",
                Some((tour_path.to_string(), tour_name.to_string())),
            );
            continue;
        };

        if used_row_ids.contains(&tour_row_id) {
            if let Some(rejected_reasons) = rejected_reasons.as_deref_mut() {
                if rejected_reasons.len() < 10 {
                    rejected_reasons.push(format!(
                        "tour={tour_path} row={tour_row_id} creditedTourName={credited_tour_name} reason=duplicate-row"
                    ));
                }
            }
            log_tour_progress_credit_skip_debug(
                tour_path,
                tour_name,
                credit,
                "duplicate-row",
                Some((tour_path.to_string(), tour_name.to_string())),
            );
            continue;
        }

        used_row_ids.insert(tour_row_id.clone());
        if let Some(matched_row_ids) = matched_row_ids.as_deref_mut() {
            if matched_row_ids.len() < 10 {
                matched_row_ids.push(tour_row_id.clone());
            }
        }
        let completed_at = credit
            .completed_at
            .clone()
            .or_else(|| credit.epoch_seconds.and_then(epoch_seconds_to_iso));

        matched_rows.push((
            tour_row_id,
            credit.epoch_seconds,
            index,
            DeltaTourProgressRow {
                completed: true,
                completed_at,
                completion_order: None,
                source: DELTAVA_TOUR_PROGRESS_SOURCE.to_string(),
                match_type: Some("dva-system-tour-credit".to_string()),
                credited_tour_name: credit.credited_tour_name.clone(),
                credited_tour_leg: credit.credited_tour_leg,
                logbook_entry_id: credit.logbook_entry_id.clone(),
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

#[cfg(debug_assertions)]
fn log_tour_progress_debug(message: &str) {
    if DVA_TOUR_PROGRESS_VERBOSE_LOGGING {
        append_sync_log(message);
    }
}

#[cfg(not(debug_assertions))]
fn log_tour_progress_debug(_: &str) {}

fn log_tour_progress_summary(message: &str) {
    append_sync_log(message);
}

#[cfg(debug_assertions)]
fn log_tour_progress_candidate_debug(
    tour_path: &str,
    tour_name: &str,
    tour_rows: &[Value],
    credits: &[LogbookTourCreditCandidate],
    tour_start_seconds: Option<i64>,
    tour_end_seconds: Option<i64>,
) {
    if !DVA_TOUR_PROGRESS_VERBOSE_LOGGING {
        return;
    }

    let candidate_rows = tour_rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            let row_id = extract_tour_row_id(tour_path, row, index);
            serde_json::json!({
                "rowId": row_id,
                "rowIndex": index + 1,
                "route": serde_json::json!({
                    "departure": extract_airport_code(row, &["from", "departure", "departureAirport", "airportD", "dep", "fromAirport", "departureIcao"]),
                    "arrival": extract_airport_code(row, &["to", "destination", "arrivalAirport", "airportA", "arr", "toAirport", "arrivalIcao"])
                }),
                "raw": row
            })
        })
        .collect::<Vec<_>>();

    let candidate_entries = credits
        .iter()
        .map(|credit| {
            serde_json::json!({
                "entryIndex": credit.entry_index,
                "epochSeconds": credit.epoch_seconds,
                "completedAt": credit.completed_at,
                "logbookEntryId": credit.logbook_entry_id,
                "status": credit.logbook_status,
                "departure": credit.logbook_departure,
                "arrival": credit.logbook_arrival,
                "creditedTourName": credit.credited_tour_name,
                "creditedTourLeg": credit.credited_tour_leg,
                "creditMessage": credit.credit_message,
            })
        })
        .collect::<Vec<_>>();

    append_sync_log(&format!(
        "tour-progress:candidate-debug {}",
        serde_json::json!({
            "tourId": tour_path,
            "tourName": tour_name,
            "startDateSeconds": tour_start_seconds,
            "endDateSeconds": tour_end_seconds,
            "candidateRows": candidate_rows,
            "candidateEntries": candidate_entries
        })
    ));
}

#[cfg(not(debug_assertions))]
fn log_tour_progress_candidate_debug(
    _: &str,
    _: &str,
    _: &[Value],
    _: &[LogbookTourCreditCandidate],
    _: Option<i64>,
    _: Option<i64>,
) {
}

#[cfg(debug_assertions)]
fn log_tour_progress_credit_skip_debug(
    tour_path: &str,
    tour_name: &str,
    credit: &LogbookTourCreditCandidate,
    reject_reason: &str,
    matched_tour_candidate: Option<(String, String)>,
) {
    if !DVA_TOUR_PROGRESS_VERBOSE_LOGGING {
        return;
    }

    append_sync_log(&format!(
        "tour-progress:credit-skip {}",
        serde_json::json!({
            "tourId": tour_path,
            "tourName": tour_name,
            "creditedTourName": credit.credited_tour_name,
            "creditedTourLeg": credit.credited_tour_leg,
            "logbookEntryId": credit.logbook_entry_id,
            "status": credit.logbook_status,
            "departure": credit.logbook_departure,
            "arrival": credit.logbook_arrival,
            "completedAt": credit.completed_at,
            "rejectReason": reject_reason,
            "matchedSyncedTourCandidate": matched_tour_candidate.map(|(tour_id, tour_name)| serde_json::json!({
                "tourId": tour_id,
                "tourName": tour_name
            })),
            "updateMessage": credit.credit_message
        })
    ));
}

#[cfg(not(debug_assertions))]
fn log_tour_progress_credit_skip_debug(
    _: &str,
    _: &str,
    _: &LogbookTourCreditCandidate,
    _: &str,
    _: Option<(String, String)>,
) {
}

// Retained for the existing test helpers that build progress from one logbook document.
#[allow(dead_code)]
fn build_tour_progress_from_value(
    tours_json: &Value,
    logbook_json: &Value,
) -> DeltaTourProgressCache {
    build_tour_progress_from_values(tours_json, std::slice::from_ref(logbook_json))
}

fn build_tour_progress_from_values(
    tours_json: &Value,
    logbook_jsons: &[Value],
) -> DeltaTourProgressCache {
    let scan = build_logbook_tour_credit_scan_from_values(logbook_jsons);
    let credits = scan.credits;
    let total_logbook_entries_considered = scan.total_logbook_entries_considered;
    let total_logbook_entries_with_system_updates = scan.total_entries_with_system_updates;
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
    let mut stats = TourProgressMatchStats::default();

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
        log_tour_progress_candidate_debug(
            &tour_path,
            &tour_name,
            &tour_rows,
            &credits,
            start_seconds,
            end_seconds,
        );

        let mut matched_row_ids = Vec::new();
        let mut rejected_reasons = Vec::new();
        let rows = build_tour_progress_rows_with_debug(
            &credits,
            &tour_rows,
            &tour_path,
            &tour_name,
            start_seconds,
            end_seconds,
            &mut stats,
            Some(&mut rejected_reasons),
            Some(&mut matched_row_ids),
        );
        stats.total_matched_tour_rows += rows.len();

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
                "matchedTourRows": rows.keys().take(10).cloned().collect::<Vec<_>>(),
                "rejectedReasons": rejected_reasons
            })
        ));

        if rows.is_empty() {
            continue;
        }

        tour_progress.insert(tour_path, DeltaTourProgressTour { rows });
    }

    log_tour_progress_summary(&format!(
        "tour-progress:summary {}",
        serde_json::json!({
            "totalSyncedTours": total_current_tours + total_upcoming_tours + total_expired_tours,
            "totalCurrentTours": total_current_tours,
            "totalUpcomingTours": total_upcoming_tours,
            "totalExpiredTours": total_expired_tours,
            "totalTourRows": total_tour_rows,
            "totalLogbookEntriesConsidered": total_logbook_entries_considered,
            "totalEntriesWithSystemUpdates": total_logbook_entries_with_system_updates,
            "totalSystemTourCreditCandidates": stats.total_system_tour_credit_candidates,
            "totalEntriesWithValidCompletedStatus": stats.total_entries_with_valid_completed_status,
            "totalEntriesWithDateMetadata": stats.total_entries_with_date_metadata,
            "totalMatchedTourRows": stats.total_matched_tour_rows,
            "totalSkippedTourNameMismatches": stats.total_skipped_tour_name_mismatches,
            "totalSkippedRouteMismatches": stats.total_skipped_route_mismatches,
            "totalSkippedAmbiguousRoutes": stats.total_skipped_ambiguous_routes,
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
    debug_enabled: bool,
) -> Result<(), String> {
    let path = tour_progress_cache_path(app)?;
    let serialized = serde_json::to_string_pretty(cache).map_err(|error| {
        format!("download_failed: Unable to serialize Delta Virtual tour progress cache: {error}")
    })?;

    fs::write(&path, serialized).map_err(|error| {
        format!("download_failed: Unable to write Delta Virtual tour progress cache: {error}")
    })?;
    crate::append_sync_log_debug(
        debug_enabled,
        &format!("tour-progress:write {}", path.display()),
    );
    Ok(())
}

fn read_tours_cache_json(app: &AppHandle) -> Value {
    let Ok(path) = tours_cache_path(app) else {
        return Value::Null;
    };

    read_json_value(&path).unwrap_or(Value::Null)
}

fn resolve_existing_logbook_json_paths(app: &AppHandle) -> Vec<PathBuf> {
    let Ok(logbook_dir) = build_logbook_dir(app) else {
        return Vec::new();
    };

    let mut paths = fs::read_dir(logbook_dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    .map(|extension| extension.eq_ignore_ascii_case("json"))
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    paths.sort();
    paths
}

fn read_logbook_json_values(app: &AppHandle) -> Vec<Value> {
    resolve_existing_logbook_json_paths(app)
        .into_iter()
        .filter_map(|path| read_json_value(&path))
        .collect()
}

pub(crate) fn reconcile_deltava_tour_progress_internal(
    app: &AppHandle,
    debug_enabled: bool,
) -> Result<(), String> {
    let tours_json = read_tours_cache_json(app);
    let logbook_jsons = read_logbook_json_values(app);
    let mut cache = build_tour_progress_from_values(&tours_json, &logbook_jsons);
    cache.last_sync_at = Some(Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true));
    write_tour_progress_cache(app, &cache, debug_enabled)
}

// Keeps the older logbook-to-progress entry point available for tests and compatibility.
#[allow(dead_code)]
pub fn build_dva_tour_completion_from_logbook(
    logbook_json: &Value,
    tours_json: &Value,
) -> DeltaTourProgressCache {
    build_tour_progress_from_value(tours_json, logbook_json)
}

// Used by the existing tour-progress tests and the logbook reconciliation logic.
#[allow(dead_code)]
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

// Used by the existing tour-progress tests and the logbook reconciliation logic.
#[allow(dead_code)]
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

// Used by the existing tour-progress tests and the logbook reconciliation logic.
#[allow(dead_code)]
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

// Used by the existing tour-progress tests and the logbook reconciliation logic.
#[allow(dead_code)]
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

    fn build_tours_json(rows: Vec<Value>, name: &str) -> Value {
        json!({
            "tours": [
                {
                    "path": "dva:16",
                    "name": name,
                    "active": true,
                    "startDate": 1_600_000_000,
                    "endDate": 1_800_000_000,
                    "rows": rows
                }
            ]
        })
    }

    fn system_credit_entry(
        tour_name: &str,
        credited_leg: i64,
        departure: &str,
        arrival: &str,
        date: Value,
    ) -> Value {
        json!({
            "airline": "DL",
            "flight": 9515,
            "leg": 99,
            "status": "OK",
            "eqType": "B737-800",
            "date": date,
            "airportD": { "icao": departure, "iata": departure.trim_start_matches('K') },
            "airportA": { "icao": arrival, "iata": arrival.trim_start_matches('K') },
            "updates": [
                {
                    "type": "SYSTEM",
                    "msg": format!("Leg {credited_leg} in Flight Tour {tour_name}")
                }
            ]
        })
    }

    fn completed_row_id(cache: &DeltaTourProgressCache, tour_key: &str, row_id: &str) -> bool {
        let normalized_row_id = normalize_tour_identifier(row_id);
        cache
            .tour_progress
            .get(tour_key)
            .and_then(|tour| tour.rows.get(&normalized_row_id))
            .is_some_and(|row| row.completed)
    }

    #[test]
    fn normalize_helpers_handle_expected_variants() {
        assert_eq!(normalize_airport_code(" kAtl "), Some("KATL".to_string()));
        assert_eq!(normalize_airline_code(" dal "), Some("DAL".to_string()));
        assert_eq!(
            normalize_flight_number(" DAL 0123 "),
            Some("123".to_string())
        );
        assert_eq!(normalize_flight_number("DL9517"), Some("9517".to_string()));
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
    fn extract_logbook_date_handles_zero_based_months() {
        let november_entry = json!({ "date": { "y": 2023, "m": 10, "d": 25 } });
        let january_entry = json!({ "date": { "y": 2024, "m": 0, "d": 8 } });

        let november_epoch =
            extract_logbook_entry_epoch_seconds(&november_entry).expect("november epoch");
        let january_epoch =
            extract_logbook_entry_epoch_seconds(&january_entry).expect("january epoch");

        assert_eq!(
            Utc.timestamp_opt(november_epoch, 0)
                .single()
                .expect("november timestamp")
                .date_naive(),
            NaiveDate::from_ymd_opt(2023, 11, 25).expect("november date")
        );
        assert_eq!(
            Utc.timestamp_opt(january_epoch, 0)
                .single()
                .expect("january timestamp")
                .date_naive(),
            NaiveDate::from_ymd_opt(2024, 1, 8).expect("january date")
        );
    }

    #[test]
    fn system_credit_update_completes_matching_row_even_when_date_would_not_match() {
        let logbook_json = json!({
            "flights": [
                system_credit_entry(
                    "Example Tour",
                    7,
                    "KBUR",
                    "KSAN",
                    json!({ "y": 2020, "m": 0, "d": 1 })
                )
            ]
        });
        let tours_json = build_tours_json(
            vec![json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": true,
                "leg": 1,
                "equipment": "B737"
            })],
            "Example Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(cache
            .tour_progress
            .get("dva:16")
            .expect("tour progress should exist")
            .rows
            .keys()
            .all(|row_id| !row_id.contains("dva:dva:")));
        assert!(completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
    }

    #[test]
    fn user_remarks_are_ignored_without_system_update() {
        let logbook_json = json!({
            "flights": [
                {
                    "status": "OK",
                    "date": { "y": 2023, "m": 10, "d": 25 },
                    "airportD": { "icao": "KBUR", "iata": "BUR" },
                    "airportA": { "icao": "KSAN", "iata": "SAN" },
                    "remarks": "Leg 1 in Flight Tour Example Tour"
                }
            ]
        });
        let tours_json = build_tours_json(
            vec![json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": false,
                "leg": 1
            })],
            "Example Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
    }

    #[test]
    fn non_system_update_with_matching_text_does_not_complete_row() {
        let logbook_json = json!({
            "flights": [
                {
                    "status": "OK",
                    "date": { "y": 2023, "m": 10, "d": 25 },
                    "airportD": { "icao": "KBUR", "iata": "BUR" },
                    "airportA": { "icao": "KSAN", "iata": "SAN" },
                    "updates": [
                        { "type": "USER", "msg": "Leg 1 in Flight Tour Example Tour" }
                    ]
                }
            ]
        });
        let tours_json = build_tours_json(
            vec![json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": false,
                "leg": 1
            })],
            "Example Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
    }

    #[test]
    fn system_credit_tour_name_mismatch_rejects() {
        let logbook_json = json!({
            "flights": [
                system_credit_entry("Example Tour", 1, "KBUR", "KSAN", json!({ "y": 2023, "m": 10, "d": 25 }))
            ]
        });
        let tours_json = build_tours_json(
            vec![json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": false,
                "leg": 1
            })],
            "Other Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
    }

    #[test]
    fn system_credit_route_mismatch_rejects() {
        let logbook_json = json!({
            "flights": [
                system_credit_entry("Example Tour", 1, "KLAX", "KSFO", json!({ "y": 2023, "m": 10, "d": 25 }))
            ]
        });
        let tours_json = build_tours_json(
            vec![json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": false,
                "leg": 1
            })],
            "Example Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
    }

    #[test]
    fn duplicate_routes_use_credited_leg_as_tie_breaker() {
        let logbook_json = json!({
            "flights": [
                system_credit_entry("Example Tour", 2, "KBUR", "KSAN", json!({ "y": 2023, "m": 10, "d": 25 }))
            ]
        });
        let tours_json = build_tours_json(
            vec![
                json!({
                    "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                    "from": "KBUR",
                    "to": "KSAN",
                    "airline": "AA",
                    "tourFlightNumber": "100",
                    "matchLeg": true,
                    "matchEQ": false,
                    "leg": 1
                }),
                json!({
                    "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-2:dep-KBUR:arr-KSAN",
                    "from": "KBUR",
                    "to": "KSAN",
                    "airline": "AA",
                    "tourFlightNumber": "100",
                    "matchLeg": true,
                    "matchEQ": false,
                    "leg": 2
                }),
            ],
            "Example Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
        assert!(completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-2:dep-KBUR:arr-KSAN"
        ));
    }

    #[test]
    fn duplicate_routes_at_non_adjacent_positions_resolve_correctly() {
        let logbook_json = json!({
            "flights": [
                system_credit_entry("Example Tour", 3, "KBUR", "KSAN", json!({ "y": 2023, "m": 10, "d": 25 }))
            ]
        });
        let tours_json = build_tours_json(
            vec![
                json!({
                    "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                    "from": "KBUR",
                    "to": "KSAN",
                    "airline": "AA",
                    "tourFlightNumber": "100",
                    "matchLeg": true,
                    "matchEQ": false,
                    "leg": 1
                }),
                json!({
                    "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-2:dep-KLAX:arr-KSFO",
                    "from": "KLAX",
                    "to": "KSFO",
                    "airline": "AA",
                    "tourFlightNumber": "101",
                    "matchLeg": true,
                    "matchEQ": false,
                    "leg": 2
                }),
                json!({
                    "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-3:dep-KBUR:arr-KSAN",
                    "from": "KBUR",
                    "to": "KSAN",
                    "airline": "AA",
                    "tourFlightNumber": "100",
                    "matchLeg": true,
                    "matchEQ": false,
                    "leg": 3
                }),
            ],
            "Example Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-2:dep-KLAX:arr-KSFO"
        ));
        assert!(completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-3:dep-KBUR:arr-KSAN"
        ));
    }

    #[test]
    fn duplicate_routes_without_credited_leg_are_skipped() {
        let tour_rows = vec![
            json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": false,
                "leg": 1
            }),
            json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-2:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": false,
                "leg": 2
            }),
        ];
        let candidate = LogbookTourCreditCandidate {
            entry_index: 0,
            epoch_seconds: Some(1_700_000_000),
            completed_at: Some("2023-11-14T00:00:00.000Z".to_string()),
            logbook_entry_id: Some("entry-1".to_string()),
            logbook_status: Some("OK".to_string()),
            logbook_departure: Some("KBUR".to_string()),
            logbook_arrival: Some("KSAN".to_string()),
            credited_tour_name: Some("Example Tour".to_string()),
            credited_tour_leg: None,
            credit_message: Some("Leg in Flight Tour Example Tour".to_string()),
        };
        let mut stats = TourProgressMatchStats::default();
        let mut rejected_reasons = Vec::new();
        let mut matched_row_ids = Vec::new();

        let rows = build_tour_progress_rows_with_debug(
            &[candidate],
            &tour_rows,
            "dva:16",
            "Example Tour",
            None,
            None,
            &mut stats,
            Some(&mut rejected_reasons),
            Some(&mut matched_row_ids),
        );

        assert!(rows.is_empty());
        assert!(rejected_reasons
            .iter()
            .any(|reason| reason.contains("ambiguous-route")));
    }

    #[test]
    fn rejected_status_does_not_complete() {
        let logbook_json = json!({
            "flights": [
                {
                    "status": "REJECTED",
                    "date": { "y": 2023, "m": 10, "d": 25 },
                    "airportD": { "icao": "KBUR", "iata": "BUR" },
                    "airportA": { "icao": "KSAN", "iata": "SAN" },
                    "updates": [
                        { "type": "SYSTEM", "msg": "Leg 1 in Flight Tour Example Tour" }
                    ]
                }
            ]
        });
        let tours_json = build_tours_json(
            vec![json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": false,
                "leg": 1
            })],
            "Example Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
    }

    #[test]
    fn draft_status_does_not_complete() {
        let logbook_json = json!({
            "flights": [
                {
                    "status": "DRAFT",
                    "date": { "y": 2023, "m": 10, "d": 25 },
                    "airportD": { "icao": "KBUR", "iata": "BUR" },
                    "airportA": { "icao": "KSAN", "iata": "SAN" },
                    "updates": [
                        { "type": "SYSTEM", "msg": "Leg 1 in Flight Tour Example Tour" }
                    ]
                }
            ]
        });
        let tours_json = build_tours_json(
            vec![json!({
                "tourRowId": "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN",
                "from": "KBUR",
                "to": "KSAN",
                "airline": "AA",
                "tourFlightNumber": "100",
                "matchLeg": true,
                "matchEQ": false,
                "leg": 1
            })],
            "Example Tour",
        );

        let cache = build_dva_tour_completion_from_logbook(&logbook_json, &tours_json);
        assert!(!completed_row_id(
            &cache,
            "dva:16",
            "dva:dva:16:airline-AA:flight-100:leg-1:dep-KBUR:arr-KSAN"
        ));
    }
}
