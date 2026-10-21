use crate::{append_sync_log, domain::deltava::logbook_status::LogbookStatus};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::{collections::BTreeSet, fs, time::SystemTime};
use tauri::AppHandle;

fn normalize_airport_code(value: &str) -> Option<String> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .map(|part| part.trim().to_ascii_uppercase())
        .find(|part| {
            (3..=5).contains(&part.len()) && part.chars().all(|ch| ch.is_ascii_alphanumeric())
        })
}

fn normalize_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase()
}

fn is_departure_key(key: &str) -> bool {
    matches!(
        key,
        "dep"
            | "departure"
            | "depart"
            | "origin"
            | "from"
            | "fromicao"
            | "depicao"
            | "departureicao"
            | "departureairport"
            | "airportd"
            | "dairport"
            | "icaodep"
            | "icaodeparture"
    )
}

fn is_arrival_key(key: &str) -> bool {
    matches!(
        key,
        "arr"
            | "arrival"
            | "destination"
            | "dest"
            | "to"
            | "toicao"
            | "arricao"
            | "arrivalicao"
            | "arrivalairport"
            | "airporta"
            | "aairport"
            | "icaoarr"
            | "icaoarrival"
    )
}

fn collect_codes(value: &Value, airports: &mut BTreeSet<String>) {
    match value {
        Value::String(text) => {
            if let Some(code) = normalize_airport_code(text) {
                airports.insert(code);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_codes(item, airports);
            }
        }
        Value::Object(map) => {
            for value in map.values() {
                collect_codes(value, airports);
            }
        }
        _ => {}
    }
}

fn collect_airport_object(value: &Value, airports: &mut BTreeSet<String>) {
    let Value::Object(map) = value else {
        collect_codes(value, airports);
        return;
    };
    for key in ["icao", "icaoCode", "fsIcao", "code", "iata"] {
        if let Some(code) = map
            .get(key)
            .and_then(Value::as_str)
            .and_then(normalize_airport_code)
        {
            airports.insert(code);
            return;
        }
    }
}

fn collect_progress(
    value: &Value,
    visited: &mut BTreeSet<String>,
    arrivals: &mut BTreeSet<String>,
) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_progress(item, visited, arrivals);
            }
        }
        Value::Object(map) => {
            for (key, value) in map {
                let key = normalize_key(key);
                if is_departure_key(&key) {
                    collect_airport_object(value, visited);
                } else if is_arrival_key(&key) {
                    let mut found = BTreeSet::new();
                    collect_airport_object(value, &mut found);
                    for airport in found {
                        arrivals.insert(airport.clone());
                        visited.insert(airport);
                    }
                } else {
                    collect_progress(value, visited, arrivals);
                }
            }
        }
        _ => {}
    }
}

fn system_time_to_iso(value: SystemTime) -> String {
    let date_time: DateTime<Utc> = value.into();
    date_time.to_rfc3339()
}

pub(crate) fn read_deltava_logbook_metadata(app: &AppHandle) -> crate::DeltaLogbookMetadata {
    let (path, json) = match super::logbook::read_logbook_artifact(app) {
        super::logbook::LogbookArtifactRead::Valid { path, document } => (path, document),
        super::logbook::LogbookArtifactRead::Missing => {
            return crate::DeltaLogbookMetadata { date_iso: None }
        }
        super::logbook::LogbookArtifactRead::Invalid { path, reason } => {
            append_sync_log(&format!(
                "logbook:metadata-invalid {} ({reason})",
                path.display()
            ));
            return crate::DeltaLogbookMetadata { date_iso: None };
        }
    };
    let date_iso = super::logbook::extract_latest_logbook_date_iso(&json);
    if date_iso.is_none() {
        append_sync_log(&format!("logbook:metadata-date-missing {}", path.display()));
    }
    crate::DeltaLogbookMetadata { date_iso }
}

pub(crate) fn read_deltava_logbook_progress(app: &AppHandle) -> crate::DeltaLogbookProgress {
    let empty = || crate::DeltaLogbookProgress {
        date_iso: None,
        last_sync_at: None,
        visited_airports: Vec::new(),
        arrival_airports: Vec::new(),
    };
    let (path, json) = match super::logbook::read_logbook_artifact(app) {
        super::logbook::LogbookArtifactRead::Valid { path, document } => (path, document),
        super::logbook::LogbookArtifactRead::Missing => return empty(),
        super::logbook::LogbookArtifactRead::Invalid { path, reason } => {
            append_sync_log(&format!(
                "logbook:progress-invalid {} ({reason})",
                path.display()
            ));
            return empty();
        }
    };
    let mut visited = BTreeSet::new();
    let mut arrivals = BTreeSet::new();
    for entry in super::logbook::normalize_logbook_entries(&json) {
        let status = LogbookStatus::from_raw(entry.get("status").and_then(Value::as_str));
        if !status.include_in_airport_progress() {
            continue;
        }
        collect_progress(&entry, &mut visited, &mut arrivals);
    }
    crate::DeltaLogbookProgress {
        date_iso: super::logbook::extract_latest_logbook_date_iso(&json),
        last_sync_at: fs::metadata(&path)
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(system_time_to_iso),
        visited_airports: visited.into_iter().collect(),
        arrival_airports: arrivals.into_iter().collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_uses_canonical_status_policy_and_fails_closed() {
        let json: Value = serde_json::from_str(r#"{"flights":[
            {"status":"SUBMITTED","departureAirport":{"icao":"KATL"},"arrivalAirport":{"icao":"KJFK"}},
            {"status":"HOLD","departureAirport":{"icao":"KLAX"},"arrivalAirport":{"icao":"KSFO"}},
            {"departureAirport":{"icao":"KSEA"},"arrivalAirport":{"icao":"KPDX"}}
        ]}"#).unwrap();
        let mut visited = BTreeSet::new();
        let mut arrivals = BTreeSet::new();
        for entry in super::super::logbook::normalize_logbook_entries(&json) {
            let status = LogbookStatus::from_raw(entry.get("status").and_then(Value::as_str));
            if status.include_in_airport_progress() {
                collect_progress(&entry, &mut visited, &mut arrivals);
            }
        }
        assert_eq!(
            visited.into_iter().collect::<Vec<_>>(),
            vec!["KATL", "KJFK"]
        );
        assert_eq!(arrivals.into_iter().collect::<Vec<_>>(), vec!["KJFK"]);
    }
}
