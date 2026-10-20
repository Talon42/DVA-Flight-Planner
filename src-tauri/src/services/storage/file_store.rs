use crate::app::paths::{
    build_accomplishment_eligibility_path, build_logbook_dir, build_schedule_path,
};
use crate::services::deltava::draft::DVA_DRAFT_WEBVIEW_DIR;
use crate::services::deltava::{
    accomplishments::{
        build_accomplishment_eligibility_summary, parse_accomplishment_eligibility_html,
    },
    auth::clear_auth_settings_internal,
    sync_types::{
        DeltaAccomplishmentEligibilityStore, DeltaWebLogbookRefreshResult, DeltaWebSyncResult,
    },
};
use crate::{
    append_sync_log, append_sync_log_debug, DELTAVA_LOGBOOK_FALLBACK_FILE, DELTAVA_SCHEDULE_FILE,
};
use serde_json::Value;
use std::{fs, path::Path};
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

fn sanitize_logbook_filename(filename_hint: Option<&str>) -> String {
    let raw_name = filename_hint
        .and_then(|value| Path::new(value).file_name())
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DELTAVA_LOGBOOK_FALLBACK_FILE);

    let sanitized = raw_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();

    let sanitized = sanitized.trim_matches(&['.', '-', '_'][..]).to_string();
    let final_name = if sanitized.is_empty() {
        DELTAVA_LOGBOOK_FALLBACK_FILE.to_string()
    } else {
        sanitized
    };

    if final_name.to_ascii_lowercase().ends_with(".json") {
        final_name
    } else {
        format!("{final_name}.json")
    }
}

fn is_expected_cleanup_skip(error: &std::io::Error) -> bool {
    match error.raw_os_error() {
        // ERROR_ACCESS_DENIED / ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION /
        // ERROR_DIR_NOT_EMPTY during best-effort WebView cleanup.
        Some(5 | 32 | 33 | 145) => true,
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
            name.starts_with("deltava-pfpxsched") && name.to_ascii_lowercase().ends_with(".xml")
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
    let json = serde_json::to_string_pretty(store).map_err(|error| {
        format!("download_failed: Unable to serialize accomplishment eligibility: {error}")
    })?;
    fs::write(&path, json).map_err(|error| {
        format!("download_failed: Unable to write accomplishment eligibility: {error}")
    })?;
    Ok(store.clone())
}

/// Stores a Delta Virtual logbook JSON export on disk with a stable filename.
pub(crate) async fn store_logbook_json(
    app: &AppHandle,
    json_text: &str,
    filename_hint: Option<&str>,
    content_type: Option<String>,
) -> Result<crate::DeltaLogbookArtifact, String> {
    let trimmed = json_text.trim();
    if trimmed.is_empty() {
        return Err("download_failed: Delta Virtual logbook JSON export was empty.".into());
    }

    serde_json::from_str::<Value>(trimmed).map_err(|error| {
        format!("invalid_json: Delta Virtual logbook JSON was invalid: {error}")
    })?;

    let logbook_dir = build_logbook_dir(app)?;
    let file_name = sanitize_logbook_filename(filename_hint);
    let final_path = logbook_dir.join(&file_name);
    let temp_path = logbook_dir.join(format!("{file_name}.tmp"));

    tokio::fs::write(&temp_path, trimmed.as_bytes())
        .await
        .map_err(|error| format!("download_failed: Unable to write logbook JSON: {error}"))?;
    if final_path.exists() {
        let _ = tokio::fs::remove_file(&final_path).await;
    }
    tokio::fs::rename(&temp_path, &final_path)
        .await
        .map_err(|error| format!("download_failed: Unable to store logbook JSON: {error}"))?;

    Ok(crate::DeltaLogbookArtifact {
        file_name,
        path: final_path.to_string_lossy().into_owned(),
        bytes: trimmed.as_bytes().len(),
        content_type,
    })
}

fn schedule_scalar_is_present(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(Value::Number(_)) | Some(Value::Bool(_)) => true,
        _ => false,
    }
}

fn validate_schedule_json(schedule_text: &str) -> Result<usize, String> {
    let schedule = serde_json::from_str::<Value>(schedule_text).map_err(|error| {
        format!("invalid_json: Delta Virtual schedule JSON was invalid: {error}")
    })?;
    let object = schedule.as_object().ok_or_else(|| {
        "invalid_schedule: Delta Virtual schedule response must be an object.".to_string()
    })?;
    let sources = object
        .get("sources")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            "invalid_schedule: Delta Virtual schedule response is missing sources.".to_string()
        })?;
    let results = object
        .get("results")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            "invalid_schedule: Delta Virtual schedule response is missing results.".to_string()
        })?;

    if results.len() <= 250 {
        return Err(format!(
            "schedule_truncated: Delta Virtual returned only {} schedule rows; the schedule service may be truncated.",
            results.len()
        ));
    }

    for (index, entry) in results.iter().enumerate() {
        let row = entry.as_object().ok_or_else(|| {
            format!(
                "invalid_schedule: Delta Virtual schedule row {} is not an object.",
                index + 1
            )
        })?;
        for field in ["airline", "flight", "leg", "eqType", "src"] {
            if !schedule_scalar_is_present(row.get(field)) {
                return Err(format!(
                    "invalid_schedule: Delta Virtual schedule row {} is missing {}.",
                    index + 1,
                    field
                ));
            }
        }

        for field in ["airportD", "airportA", "timeD"] {
            if !row.get(field).is_some_and(Value::is_object) {
                return Err(format!(
                    "invalid_schedule: Delta Virtual schedule row {} is missing {}.",
                    index + 1,
                    field
                ));
            }
        }

        for field in ["airportD", "airportA"] {
            if !row
                .get(field)
                .and_then(Value::as_object)
                .and_then(|airport| airport.get("icao"))
                .and_then(Value::as_str)
                .is_some_and(|icao| !icao.trim().is_empty())
            {
                return Err(format!(
                    "invalid_schedule: Delta Virtual schedule row {} is missing {}.icao.",
                    index + 1,
                    field
                ));
            }
        }

        let has_departure_clock = row
            .get("timeD")
            .and_then(Value::as_object)
            .is_some_and(|time| {
                time.get("text")
                    .and_then(Value::as_str)
                    .is_some_and(|text| !text.trim().is_empty())
                    || time.get("h").is_some()
                    || time.get("m").is_some()
                    || time.get("s").is_some()
            });
        if !has_departure_clock {
            return Err(format!(
                "invalid_schedule: Delta Virtual schedule row {} is missing timeD.",
                index + 1
            ));
        }

        let source_id = row.get("src").and_then(Value::as_str).unwrap_or_default();
        if !sources
            .get(source_id)
            .and_then(Value::as_object)
            .and_then(|source| source.get("effectiveDate"))
            .and_then(Value::as_i64)
            .is_some()
        {
            return Err(format!(
                "invalid_schedule: Delta Virtual schedule row {} references a source without effectiveDate.",
                index + 1
            ));
        }
    }

    Ok(results.len())
}

async fn store_schedule_json(app: &AppHandle, schedule_text: &str) -> Result<(), String> {
    let schedule_path = build_schedule_path(app)?;
    let temp_path = schedule_path.with_extension("json.tmp");
    let backup_path = schedule_path.with_extension("json.bak");
    tokio::fs::write(&temp_path, schedule_text.as_bytes())
        .await
        .map_err(|error| format!("download_failed: Unable to write schedule JSON: {error}"))?;

    let had_existing_schedule = schedule_path.exists();
    if had_existing_schedule {
        if backup_path.exists() {
            tokio::fs::remove_file(&backup_path)
                .await
                .map_err(|error| {
                    format!("download_failed: Unable to prepare schedule backup: {error}")
                })?;
        }
        tokio::fs::rename(&schedule_path, &backup_path)
            .await
            .map_err(|error| {
                format!("download_failed: Unable to prepare schedule replacement: {error}")
            })?;
    }

    if let Err(error) = tokio::fs::rename(&temp_path, &schedule_path).await {
        if had_existing_schedule {
            let _ = tokio::fs::rename(&backup_path, &schedule_path).await;
        }
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(format!(
            "download_failed: Unable to store schedule JSON: {error}"
        ));
    }

    if had_existing_schedule {
        let _ = tokio::fs::remove_file(&backup_path).await;
    }

    Ok(())
}

/// Builds the final Delta sync payload once the webview has fetched both artifacts.
pub(crate) async fn build_delta_sync_payload_from_web_result(
    app: &AppHandle,
    result: DeltaWebSyncResult,
    debug_enabled: bool,
) -> Result<crate::DeltaSyncPayload, String> {
    let mut warnings = Vec::new();

    let schedule_text = if result.schedule.ok {
        let schedule_text = result.schedule.schedule_text.unwrap_or_default();
        match validate_schedule_json(&schedule_text) {
            Ok(row_count) => match store_schedule_json(app, &schedule_text).await {
                Ok(()) => {
                    append_sync_log_debug(
                        debug_enabled,
                        &format!("schedule:validated rows={row_count}"),
                    );
                    Some(schedule_text)
                }
                Err(error) => {
                    warnings.push(error);
                    None
                }
            },
            Err(error) => {
                warnings.push(error);
                None
            }
        }
    } else {
        warnings.push(
            result
                .schedule
                .error
                .unwrap_or_else(|| "Delta Virtual schedule download failed.".into()),
        );
        None
    };

    let logbook_json = if result.logbook.ok {
        let json_text = result.logbook.json_text.unwrap_or_default();
        append_sync_log_debug(debug_enabled, "logbook-fetch");
        match store_logbook_json(
            app,
            &json_text,
            result.logbook.filename.as_deref(),
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
            append_sync_log_debug(
                debug_enabled,
                &format!("accomplishments:parsed rows={}", parsed.rows.len()),
            );

            match store_deltava_accomplishment_eligibility(app, &parsed) {
                Ok(store) => Some(build_accomplishment_eligibility_summary(&store)),
                Err(error) => {
                    warnings.push(error);
                    None
                }
            }
        } else {
            warnings.push(accomplishments.error.unwrap_or_else(|| {
                "Delta Virtual accomplishment eligibility download failed.".into()
            }));
            None
        }
    } else {
        None
    };

    let schedule_status = if schedule_text.is_some() {
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

    if schedule_text.is_none() && logbook_json.is_none() {
        return Err(format!(
            "download_failed: Delta Virtual sync failed. {}",
            summarize_warnings(&warnings)
                .unwrap_or_else(|| "No sync artifacts were downloaded.".into())
        ));
    }

    let status = if schedule_text.is_some() && logbook_json.is_some() {
        "success"
    } else {
        "partial"
    }
    .to_string();

    Ok(crate::DeltaSyncPayload {
        file_name: schedule_text
            .as_ref()
            .map(|_| DELTAVA_SCHEDULE_FILE.to_string()),
        schedule_text,
        status,
        schedule_status,
        logbook_status,
        profile_status: "skipped".into(),
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
        remove_path_if_exists(&download_dir.join(DELTAVA_SCHEDULE_FILE));
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

/// Builds the result returned by the dedicated logbook-only refresh flow.
pub(crate) async fn build_delta_logbook_refresh_payload_from_web_result(
    app: &AppHandle,
    result: DeltaWebLogbookRefreshResult,
    _debug_enabled: bool,
) -> Result<crate::DeltaSyncPayload, String> {
    if !result.logbook.ok {
        return Err(result
            .logbook
            .error
            .unwrap_or_else(|| "download_failed: Delta Virtual logbook refresh failed.".into()));
    }

    let artifact = store_logbook_json(
        app,
        &result.logbook.json_text.unwrap_or_default(),
        result.logbook.filename.as_deref(),
        result.logbook.content_type,
    )
    .await?;

    Ok(crate::DeltaSyncPayload {
        file_name: Some(artifact.file_name.clone()),
        schedule_text: None,
        status: "success".into(),
        schedule_status: "skipped".into(),
        logbook_status: "success".into(),
        profile_status: "skipped".into(),
        accomplishment_eligibility: None,
        logbook_json: Some(artifact),
        warnings: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_validation_rejects_truncated_results() {
        let schedule = serde_json::json!({
            "sources": {},
            "results": vec![serde_json::json!({}) ; 250]
        });
        let text = serde_json::to_string(&schedule).expect("schedule json");

        let error = validate_schedule_json(&text).expect_err("truncated schedule");
        assert!(error.contains("returned only 250 schedule rows"));
    }

    #[test]
    fn schedule_validation_accepts_a_complete_structural_payload() {
        let mut results = Vec::new();
        for index in 0..251 {
            results.push(serde_json::json!({
                "airline": "DL",
                "flight": index + 1,
                "leg": 1,
                "eqType": "B739",
                "src": "AVSTACK",
                "airportD": {"icao": "KBOS"},
                "airportA": {"icao": "KDCA"},
                "timeD": {"h": 6, "m": 0, "s": 0}
            }));
        }
        let schedule = serde_json::json!({
            "sources": {"AVSTACK": {"effectiveDate": 1786406400000i64}},
            "results": results
        });
        let text = serde_json::to_string(&schedule).expect("schedule json");

        assert_eq!(
            validate_schedule_json(&text).expect("complete schedule"),
            251
        );
    }

    #[test]
    fn expected_cleanup_skip_classifies_known_windows_cleanup_errors() {
        for raw_error in [5, 32, 33, 145] {
            let error = std::io::Error::from_raw_os_error(raw_error);
            assert!(
                is_expected_cleanup_skip(&error),
                "Windows cleanup error {raw_error} should be expected"
            );
        }
    }

    #[test]
    fn unexpected_cleanup_error_is_not_suppressed() {
        let error = std::io::Error::from_raw_os_error(87);

        assert!(!is_expected_cleanup_skip(&error));
    }
}
