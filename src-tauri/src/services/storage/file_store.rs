use crate::app::paths::{
    build_accomplishment_eligibility_path, resolve_existing_logbook_json_path,
};
use crate::services::deltava::draft::DVA_DRAFT_WEBVIEW_DIR;
use crate::services::deltava::{
    accomplishments::{
        build_accomplishment_eligibility_summary, parse_accomplishment_eligibility_html,
    },
    auth::clear_auth_settings_internal,
    logbook::{extract_latest_logbook_date_iso, normalize_logbook_entries, store_logbook_json},
    sync_types::{DeltaAccomplishmentEligibilityStore, DeltaWebSyncResult},
};
use crate::{append_sync_log, append_sync_log_debug, DELTAVA_SYNC_DOWNLOAD_FILE};
use serde_json::Value;
use std::{collections::BTreeSet, fs, path::Path};
use tauri::{AppHandle, Manager};

const WEBVIEW_ROOT_PRUNE_DIRS: &[&str] = &[
    "AutoLaunchProtocolsComponent",
    "CertificateRevocation",
    "component_crx_cache",
    "Crashpad",
    "Domain Actions",
    "extensions_crx_cache",
    "GraphiteDawnCache",
    "GrShaderCache",
    "hyphen-data",
    "MEIPreload",
    "OriginTrials",
    "PKIMetadata",
    "ShaderCache",
    "Speech Recognition",
    "Subresource Filter",
    "Trust Protection Lists",
    "TrustTokenKeyCommitments",
    "WidevineCdm",
];

const WEBVIEW_ROOT_PRUNE_FILES: &[&str] = &["Last Version", "Variations"];

const WEBVIEW_PROFILE_PRUNE_DIRS: &[&str] = &[
    "AutofillAiModelCache",
    "blob_storage",
    "BudgetDatabase",
    "Cache",
    "Code Cache",
    "commerce_subscription_db",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "discount_infos_db",
    "discounts_db",
    "EdgeJourneys",
    "Extension Rules",
    "Extension Scripts",
    "Feature Engagement Tracker",
    "GPUCache",
    "Network",
    "optimization_guide_hint_cache_store",
    "parcel_tracking_db",
    "Password_Diagnostics",
    "PersistentOriginTrials",
    "Safe Browsing Network",
    "Session Storage",
    "Sessions",
    "Shared Dictionary",
    "shared_proto_db",
    "Site Characteristics Database",
    "Sync Data",
];

const WEBVIEW_PROFILE_PRUNE_FILES: &[&str] = &[
    "BrowsingTopicsSiteData",
    "BrowsingTopicsSiteData-journal",
    "BrowsingTopicsState",
    "DIPS",
    "Favicons",
    "Favicons-journal",
    "heavy_ad_intervention_opt_out.db",
    "heavy_ad_intervention_opt_out.db-journal",
    "History",
    "History-journal",
    "LOCK",
    "LOG",
    "LOG.old",
    "Network Action Predictor",
    "Network Action Predictor-journal",
    "Top Sites",
    "Top Sites-journal",
    "Vpn Tokens",
    "Vpn Tokens-journal",
];

fn normalize_logbook_airport_code(value: &str) -> Option<String> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .map(|part| part.trim().to_ascii_uppercase())
        .find(|part| {
            (3..=5).contains(&part.len()) && part.chars().all(|ch| ch.is_ascii_alphanumeric())
        })
}

fn is_departure_airport_key(key: &str) -> bool {
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

fn is_arrival_airport_key(key: &str) -> bool {
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

fn normalize_logbook_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase()
}

fn collect_airport_codes_from_value(value: &Value, airports: &mut BTreeSet<String>) {
    match value {
        Value::String(text) => {
            if let Some(code) = normalize_logbook_airport_code(text) {
                airports.insert(code);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_airport_codes_from_value(item, airports);
            }
        }
        Value::Object(map) => {
            for value in map.values() {
                collect_airport_codes_from_value(value, airports);
            }
        }
        _ => {}
    }
}

fn collect_airport_codes_from_airport_object(value: &Value, airports: &mut BTreeSet<String>) {
    let Value::Object(map) = value else {
        collect_airport_codes_from_value(value, airports);
        return;
    };

    for key in ["icao", "icaoCode", "fsIcao", "code", "iata"] {
        if let Some(code) = map
            .get(key)
            .and_then(Value::as_str)
            .and_then(normalize_logbook_airport_code)
        {
            airports.insert(code);
            return;
        }
    }
}

fn collect_logbook_airport_progress(
    value: &Value,
    visited_airports: &mut BTreeSet<String>,
    arrival_airports: &mut BTreeSet<String>,
) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_logbook_airport_progress(item, visited_airports, arrival_airports);
            }
        }
        Value::Object(map) => {
            for (key, value) in map {
                let normalized_key = normalize_logbook_key(key);
                if is_departure_airport_key(&normalized_key) {
                    collect_airport_codes_from_airport_object(value, visited_airports);
                } else if is_arrival_airport_key(&normalized_key) {
                    let mut arrivals = BTreeSet::new();
                    collect_airport_codes_from_airport_object(value, &mut arrivals);
                    for airport in arrivals {
                        arrival_airports.insert(airport.clone());
                        visited_airports.insert(airport);
                    }
                } else {
                    collect_logbook_airport_progress(value, visited_airports, arrival_airports);
                }
            }
        }
        _ => {}
    }
}

fn summarize_warnings(warnings: &[String]) -> Option<String> {
    if warnings.is_empty() {
        return None;
    }

    let preview = warnings
        .iter()
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join("; ");
    let suffix = if warnings.len() > 3 {
        format!(" (+{} more)", warnings.len() - 3)
    } else {
        String::new()
    };

    Some(format!("{preview}{suffix}"))
}

fn is_expected_cleanup_skip(error: &std::io::Error) -> bool {
    match error.raw_os_error() {
        // ERROR_ACCESS_DENIED / ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION.
        Some(5 | 32 | 33) => true,
        _ => false,
    }
}

fn remove_path_if_exists(path: &Path) {
    if !path.exists() {
        return;
    }

    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };

    if let Err(error) = result {
        if !is_expected_cleanup_skip(&error) {
            append_sync_log(&format!("cleanup:skip {} ({error})", path.display()));
        }
    }
}

fn remove_dir_contents_if_exists(path: &Path) {
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };

    for entry in entries.flatten() {
        remove_path_if_exists(&entry.path());
    }
}

fn is_legacy_download_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            name.starts_with("deltava-pfpxsched-") && name.to_ascii_lowercase().ends_with(".xml")
        })
        .unwrap_or(false)
}

fn prune_legacy_downloads(directory: &Path) {
    if let Ok(entries) = fs::read_dir(directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && is_legacy_download_file(&path) {
                let _ = fs::remove_file(path);
            }
        }
    }
}

fn prune_webview_profile(root: &Path) {
    if !root.exists() {
        return;
    }

    for dir_name in WEBVIEW_ROOT_PRUNE_DIRS {
        remove_path_if_exists(&root.join(dir_name));
    }

    for file_name in WEBVIEW_ROOT_PRUNE_FILES {
        remove_path_if_exists(&root.join(file_name));
    }

    let default_profile = root.join("Default");
    if !default_profile.exists() {
        return;
    }

    for dir_name in WEBVIEW_PROFILE_PRUNE_DIRS {
        remove_path_if_exists(&default_profile.join(dir_name));
    }

    for file_name in WEBVIEW_PROFILE_PRUNE_FILES {
        remove_path_if_exists(&default_profile.join(file_name));
    }
}

/// Reads the latest Delta Virtual logbook date from disk for the dashboard.
pub(crate) fn read_deltava_logbook_metadata(app: &AppHandle) -> crate::DeltaLogbookMetadata {
    let Some(path) = resolve_existing_logbook_json_path(app) else {
        return crate::DeltaLogbookMetadata { date_iso: None };
    };

    let Ok(text) = fs::read_to_string(&path) else {
        append_sync_log(&format!("logbook:metadata-read-failed {}", path.display()));
        return crate::DeltaLogbookMetadata { date_iso: None };
    };

    let Ok(json) = serde_json::from_str::<Value>(&text) else {
        append_sync_log(&format!("logbook:metadata-invalid-json {}", path.display()));
        return crate::DeltaLogbookMetadata { date_iso: None };
    };

    let date_iso = extract_latest_logbook_date_iso(&json);
    if date_iso.is_none() {
        append_sync_log(&format!("logbook:metadata-date-missing {}", path.display()));
    }

    crate::DeltaLogbookMetadata { date_iso }
}

/// Reads visited and arrival airports from the newest Delta Virtual logbook file.
pub(crate) fn read_deltava_logbook_progress(app: &AppHandle) -> crate::DeltaLogbookProgress {
    let Some(path) = resolve_existing_logbook_json_path(app) else {
        return crate::DeltaLogbookProgress {
            date_iso: None,
            visited_airports: Vec::new(),
            arrival_airports: Vec::new(),
        };
    };

    let Ok(text) = fs::read_to_string(&path) else {
        append_sync_log(&format!("logbook:progress-read-failed {}", path.display()));
        return crate::DeltaLogbookProgress {
            date_iso: None,
            visited_airports: Vec::new(),
            arrival_airports: Vec::new(),
        };
    };

    let Ok(json) = serde_json::from_str::<Value>(&text) else {
        append_sync_log(&format!("logbook:progress-invalid-json {}", path.display()));
        return crate::DeltaLogbookProgress {
            date_iso: None,
            visited_airports: Vec::new(),
            arrival_airports: Vec::new(),
        };
    };

    let mut visited_airports = BTreeSet::new();
    let mut arrival_airports = BTreeSet::new();
    for entry in normalize_logbook_entries(&json) {
        collect_logbook_airport_progress(&entry, &mut visited_airports, &mut arrival_airports);
    }

    crate::DeltaLogbookProgress {
        date_iso: extract_latest_logbook_date_iso(&json),
        visited_airports: visited_airports.into_iter().collect(),
        arrival_airports: arrival_airports.into_iter().collect(),
    }
}

/// Reads the latest stored DVA accomplishment eligibility snapshot.
pub(crate) fn read_deltava_accomplishment_eligibility(
    app: &AppHandle,
) -> DeltaAccomplishmentEligibilityStore {
    let Ok(path) = build_accomplishment_eligibility_path(app) else {
        return DeltaAccomplishmentEligibilityStore::default();
    };

    let Ok(text) = fs::read_to_string(&path) else {
        return DeltaAccomplishmentEligibilityStore::default();
    };

    serde_json::from_str::<DeltaAccomplishmentEligibilityStore>(&text).unwrap_or_default()
}

fn store_deltava_accomplishment_eligibility(
    app: &AppHandle,
    store: &DeltaAccomplishmentEligibilityStore,
) -> Result<DeltaAccomplishmentEligibilityStore, String> {
    let path = build_accomplishment_eligibility_path(app)?;
    let json = serde_json::to_string_pretty(store)
        .map_err(|error| format!("download_failed: Unable to serialize accomplishment eligibility: {error}"))?;
    fs::write(&path, json)
        .map_err(|error| format!("download_failed: Unable to write accomplishment eligibility: {error}"))?;
    Ok(store.clone())
}


/// Builds the final Delta sync payload once the webview has downloaded both artifacts.
pub(crate) async fn build_delta_sync_payload_from_web_result(
    app: &AppHandle,
    result: DeltaWebSyncResult,
    debug_enabled: bool,
) -> Result<crate::DeltaSyncPayload, String> {
    let mut warnings = Vec::new();

    let xml_text = if result.xml.ok {
        let xml_text = result.xml.xml_text.unwrap_or_default();
        let trimmed = xml_text.trim_start();
        if !trimmed.starts_with('<') || !xml_text.contains("<FLIGHT>") {
            warnings.push("Delta Virtual returned an invalid schedule XML response.".into());
            None
        } else {
            Some(xml_text)
        }
    } else {
        warnings.push(
            result
                .xml
                .error
                .unwrap_or_else(|| "Delta Virtual schedule XML download failed.".into()),
        );
        None
    };

    let logbook_json = if result.logbook.ok {
        let json_text = result.logbook.json_text.unwrap_or_default();
        append_sync_log_debug(debug_enabled, "logbook-fetch");
        match store_logbook_json(
            app,
            &json_text,
            result.logbook.content_type,
        )
        .await
        {
            Ok(artifact) => Some(artifact),
            Err(error) => {
                warnings.push(error);
                None
            }
        }
    } else {
        warnings.push(
            result
                .logbook
                .error
                .unwrap_or_else(|| "Delta Virtual logbook JSON download failed.".into()),
        );
        None
    };

    let accomplishment_eligibility = if let Some(accomplishments) = result.accomplishments {
        if accomplishments.ok {
            let html_text = accomplishments.html_text.unwrap_or_default();
            let parsed = parse_accomplishment_eligibility_html(&html_text);
            append_sync_log_debug(debug_enabled, &format!(
                "accomplishments:parsed rows={}",
                parsed.rows.len()
            ));

            match store_deltava_accomplishment_eligibility(app, &parsed) {
                Ok(store) => Some(build_accomplishment_eligibility_summary(&store)),
                Err(error) => {
                    warnings.push(error);
                    None
                }
            }
        } else {
            warnings.push(
                accomplishments
                    .error
                    .unwrap_or_else(|| "Delta Virtual accomplishment eligibility download failed.".into()),
            );
            None
        }
    } else {
        None
    };

    let xml_status = if xml_text.is_some() {
        "success"
    } else {
        "failed"
    }
    .to_string();
    let logbook_status = if logbook_json.is_some() {
        "success"
    } else {
        "failed"
    }
    .to_string();

    if xml_text.is_none() && logbook_json.is_none() {
        return Err(format!(
            "download_failed: Delta Virtual sync failed. {}",
            summarize_warnings(&warnings)
                .unwrap_or_else(|| "No sync artifacts were downloaded.".into())
        ));
    }

    let status = if xml_text.is_some() && logbook_json.is_some() {
        "success"
    } else {
        "partial"
    }
    .to_string();

    Ok(crate::DeltaSyncPayload {
        file_name: xml_text
            .as_ref()
            .map(|_| DELTAVA_SYNC_DOWNLOAD_FILE.to_string()),
        xml_text,
        status,
        xml_status,
        logbook_status,
        accomplishment_eligibility,
        logbook_json,
        warnings,
    })
}

/// Removes Delta Virtual webview and download data for cleanup flows.
pub(crate) fn prune_deltava_storage(
    app: &AppHandle,
    remove_downloaded_schedule: bool,
    include_main_webview_profile: bool,
) {
    let Ok(local_data_dir) = app.path().app_local_data_dir() else {
        return;
    };

    if include_main_webview_profile {
        prune_webview_profile(&local_data_dir.join("EBWebView"));
    }
    prune_webview_profile(&local_data_dir.join("deltava-webview").join("EBWebView"));
    prune_webview_profile(&local_data_dir.join(DVA_DRAFT_WEBVIEW_DIR).join("EBWebView"));

    if remove_downloaded_schedule {
        let download_dir = local_data_dir.join("deltava-sync").join("downloads");
        remove_path_if_exists(&download_dir.join(DELTAVA_SYNC_DOWNLOAD_FILE));
        prune_legacy_downloads(&download_dir);
    }
}

/// Removes only the Delta Virtual sync/session folders so the broader app profile stays intact.
pub(crate) fn reset_deltava_sync_session_storage(app: &AppHandle) -> Result<(), String> {
    let sync_dir = crate::app::paths::deltava_sync_dir(app)?;
    let webview_dir = crate::app::paths::deltava_webview_dir(app)?;

    remove_path_if_exists(&sync_dir);
    remove_path_if_exists(&webview_dir);

    Ok(())
}

/// Clears the app data folders and Delta Virtual settings used by the user profile.
pub(crate) fn clear_user_data(app: &AppHandle) -> Result<(), String> {
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        remove_dir_contents_if_exists(&app_data_dir);
    }

    let _ = clear_auth_settings_internal(app);

    if let Ok(local_data_dir) = app.path().app_local_data_dir() {
        remove_dir_contents_if_exists(&local_data_dir);
    }

    Ok(())
}

/// Opens the main webview devtools from the app context menu.
pub(crate) fn open_main_devtools(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window is not available.".to_string());
    };

    window.open_devtools();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_latest_logbook_date_uses_last_entry_date_object() {
        let json: Value = serde_json::from_str(
            r#"{"flights": [
                {"date":{"y":2026,"m":3,"d":1},"time":"2099-01-01T00:00:00Z"},
                {"date":{"y":2026,"m":4,"d":11},"time":"2000-01-01T00:00:00Z"}
            ]}"#,
        )
        .expect("json");

        assert_eq!(
            extract_latest_logbook_date_iso(&json),
            Some("2026-05-11".to_string())
        );
    }

    #[test]
    fn extract_latest_logbook_date_uses_zero_based_months() {
        let json: Value = serde_json::from_str(
            r#"{"flights": [
                {"date":{"y":2026,"m":0,"d":31}},
                {"date":{"y":2026,"m":3,"d":11}}
            ]}"#,
        )
        .expect("json");

        assert_eq!(
            extract_latest_logbook_date_iso(&json),
            Some("2026-04-11".to_string())
        );
    }

    #[test]
    fn collect_logbook_airport_progress_tracks_departures_and_arrivals() {
        let json: Value = serde_json::from_str(
            r#"{"flights": [
                {"departureAirport":{"icao":"katl"},"arrivalAirport":{"icao":"KJFK"}},
                {"airportD":{"icao":"KLAX","name":"Los Angeles"},"airportA":{"icao":"KSFO","name":"San Francisco"}}
            ]}"#,
        )
        .expect("json");
        let mut visited_airports = BTreeSet::new();
        let mut arrival_airports = BTreeSet::new();

        for entry in normalize_logbook_entries(&json) {
            collect_logbook_airport_progress(&entry, &mut visited_airports, &mut arrival_airports);
        }

        assert_eq!(
            visited_airports.into_iter().collect::<Vec<_>>(),
            vec![
                "KATL".to_string(),
                "KJFK".to_string(),
                "KLAX".to_string(),
                "KSFO".to_string()
            ]
        );
        assert_eq!(
            arrival_airports.into_iter().collect::<Vec<_>>(),
            vec!["KJFK".to_string(), "KSFO".to_string()]
        );
    }

    #[test]
    fn collect_logbook_airport_progress_accepts_entries_shape() {
        let json: Value = serde_json::from_str(
            r#"{"entries": [
                {"airportD":{"icao":"KATL"},"airportA":{"icao":"KJFK"}}
            ]}"#,
        )
        .expect("json");
        let mut visited_airports = BTreeSet::new();
        let mut arrival_airports = BTreeSet::new();

        for entry in normalize_logbook_entries(&json) {
            collect_logbook_airport_progress(&entry, &mut visited_airports, &mut arrival_airports);
        }

        assert_eq!(
            visited_airports.into_iter().collect::<Vec<_>>(),
            vec!["KATL".to_string(), "KJFK".to_string()]
        );
        assert_eq!(
            arrival_airports.into_iter().collect::<Vec<_>>(),
            vec!["KJFK".to_string()]
        );
    }
}
