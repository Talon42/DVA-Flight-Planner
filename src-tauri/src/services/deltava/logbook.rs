use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;

use crate::models::deltava_logbook::DeltaLogbookEntry;
use crate::services::deltava::sync_types::MAX_DELTAVA_LOGBOOK_JSON_BYTES;
use crate::{append_sync_log, DELTAVA_LOGBOOK_FILE};

const SUPPORTED_LOGBOOK_ROOT_KEYS: [&str; 4] = ["entries", "flights", "logbook", "data"];

#[derive(Debug)]
pub(crate) enum LogbookArtifactRead {
    Missing,
    Invalid { path: PathBuf, reason: String },
    Valid { path: PathBuf, document: Value },
}

fn get_json_field_i32(value: &Value, key: &str) -> Option<i32> {
    value
        .get(key)
        .and_then(Value::as_i64)
        .and_then(|number| i32::try_from(number).ok())
}

fn extract_logbook_date_parts(entry: &Value) -> Option<(i32, u32, u32)> {
    let date = entry.get("date")?;
    let year = get_json_field_i32(date, "y")?;
    let month = get_json_field_i32(date, "m")?;
    let day = get_json_field_i32(date, "d")?;
    let month = u32::try_from(month).ok()?;
    let day = u32::try_from(day).ok()?;
    Some((year, month, day))
}

fn normalize_dva_logbook_month(raw_month: u32) -> Option<u32> {
    if raw_month <= 11 {
        return raw_month.checked_add(1);
    }

    if raw_month == 12 {
        return Some(12);
    }

    None
}

// Normalizes supported Delta Virtual cache shapes into a flat list of entry objects for every reader.
pub(crate) fn normalize_logbook_entries(value: &Value) -> Vec<Value> {
    if let Some(entries) = value.as_array() {
        return entries.to_vec();
    }

    for key in SUPPORTED_LOGBOOK_ROOT_KEYS {
        if let Some(entries) = value.get(key).and_then(Value::as_array) {
            return entries.to_vec();
        }
    }

    Vec::new()
}

fn has_supported_logbook_root(value: &Value) -> bool {
    value.is_array()
        || SUPPORTED_LOGBOOK_ROOT_KEYS
            .iter()
            .any(|key| value.get(*key).is_some_and(Value::is_array))
}

fn has_non_empty_json_value(value: Option<&Value>) -> bool {
    match value {
        Some(Value::String(text)) => !text.trim().is_empty(),
        Some(Value::Number(_)) => true,
        Some(Value::Object(_)) | Some(Value::Array(_)) => true,
        _ => false,
    }
}

// Matches the frontend's minimum useful-row gate before a value crosses the IPC boundary.
fn is_useful_logbook_entry(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };

    ["logbookId", "id", "flight", "flightNumber", "flightCode"]
        .iter()
        .any(|key| has_non_empty_json_value(object.get(*key)))
        || ["airportD", "airportA"]
            .iter()
            .any(|key| has_non_empty_json_value(object.get(*key)))
}

// Validates and projects raw entries into the small frontend DTO; rejected rows are never serialized.
pub(crate) fn validate_logbook_entries(value: &Value) -> (Vec<DeltaLogbookEntry>, usize) {
    let mut accepted = Vec::new();
    let mut rejected = 0;

    for entry in normalize_logbook_entries(value) {
        if !is_useful_logbook_entry(&entry) {
            rejected += 1;
            continue;
        }

        match serde_json::from_value::<DeltaLogbookEntry>(entry) {
            Ok(entry) => accepted.push(entry),
            Err(_) => rejected += 1,
        }
    }

    (accepted, rejected)
}

// Derives the true latest DVA logbook date by scanning every supported entry shape instead of trusting array order.
pub(crate) fn extract_latest_logbook_date_iso(json: &Value) -> Option<String> {
    normalize_logbook_entries(json)
        .into_iter()
        .filter_map(|entry| {
            let (year, raw_month, day) = extract_logbook_date_parts(&entry)?;
            let month = normalize_dva_logbook_month(raw_month)?;
            NaiveDate::from_ymd_opt(year, month, day)
        })
        .max()
        .map(|date| date.format("%Y-%m-%d").to_string())
}

fn system_time_to_iso(value: SystemTime) -> Option<String> {
    let date_time: DateTime<Utc> = value.into();
    Some(date_time.to_rfc3339())
}

// Reads only the canonical or exact legacy artifact and rejects profile/unrelated JSON shapes.
pub(crate) fn read_logbook_artifact(app: &AppHandle) -> LogbookArtifactRead {
    let Some(path_kind) = crate::app::paths::resolve_existing_logbook_json_path(app) else {
        return LogbookArtifactRead::Missing;
    };
    let path = match path_kind {
        crate::app::paths::ExistingLogbookJsonPath::Canonical(path)
        | crate::app::paths::ExistingLogbookJsonPath::Legacy(path) => path,
    };
    read_logbook_artifact_from_path(path)
}

fn read_logbook_artifact_from_path(path: PathBuf) -> LogbookArtifactRead {
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) => {
            return LogbookArtifactRead::Invalid {
                path,
                reason: format!("unable to read artifact: {error}"),
            };
        }
    };
    let document = match serde_json::from_str::<Value>(&text) {
        Ok(document) => document,
        Err(error) => {
            return LogbookArtifactRead::Invalid {
                path,
                reason: format!("invalid JSON: {error}"),
            };
        }
    };
    if !has_supported_logbook_root(&document) {
        return LogbookArtifactRead::Invalid {
            path,
            reason: "root does not contain a supported logbook collection".into(),
        };
    }
    LogbookArtifactRead::Valid { path, document }
}

pub(crate) fn remove_stale_logbook_json_files(logbook_dir: &Path) {
    // Only remove the exact legacy artifact; profile and future cache files are independent data.
    for file_name in [crate::app::paths::DELTAVA_LOGBOOK_FALLBACK_FILE] {
        let path = logbook_dir.join(file_name);
        if !path.is_file() {
            continue;
        }
        if let Err(error) = fs::remove_file(&path) {
            append_sync_log(&format!(
                "logbook:cleanup-skip {} ({error})",
                path.display()
            ));
        } else {
            append_sync_log(&format!("logbook:cleanup-remove {}", path.display()));
        }
    }
}

async fn store_logbook_json_in_dir(
    logbook_dir: &Path,
    json_text: &str,
    content_type: Option<String>,
    simulate_final_rename_failure: bool,
) -> Result<crate::DeltaLogbookArtifact, String> {
    let trimmed = json_text.trim();
    if trimmed.is_empty() {
        return Err("download_failed: Delta Virtual logbook JSON export was empty.".into());
    }

    if trimmed.len() > MAX_DELTAVA_LOGBOOK_JSON_BYTES {
        return Err(format!(
            "download_failed: Delta Virtual logbook JSON export exceeded the {} byte limit.",
            MAX_DELTAVA_LOGBOOK_JSON_BYTES
        ));
    }

    serde_json::from_str::<Value>(trimmed).map_err(|error| {
        format!("invalid_json: Delta Virtual logbook JSON was invalid: {error}")
    })?;
    append_sync_log("logbook:json-valid");

    let file_name = DELTAVA_LOGBOOK_FILE.to_string();
    let final_path = logbook_dir.join(&file_name);
    let temp_path = logbook_dir.join(format!("{file_name}.tmp"));
    let backup_path = logbook_dir.join(format!("{file_name}.bak"));

    tokio::fs::create_dir_all(logbook_dir)
        .await
        .map_err(|error| format!("download_failed: Unable to create logbook storage: {error}"))?;

    let mut temp_file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|error| format!("download_failed: Unable to write logbook JSON: {error}"))?;
    temp_file
        .write_all(trimmed.as_bytes())
        .await
        .map_err(|error| format!("download_failed: Unable to write logbook JSON: {error}"))?;
    temp_file
        .flush()
        .await
        .map_err(|error| format!("download_failed: Unable to write logbook JSON: {error}"))?;
    temp_file
        .sync_all()
        .await
        .map_err(|error| format!("download_failed: Unable to store logbook JSON: {error}"))?;
    drop(temp_file);

    let final_exists = final_path.exists();
    if final_exists {
        let _ = tokio::fs::remove_file(&backup_path).await;
        tokio::fs::rename(&final_path, &backup_path)
            .await
            .map_err(|error| {
                format!("download_failed: Unable to preserve the existing logbook JSON: {error}")
            })?;
    }

    if simulate_final_rename_failure {
        let _ = tokio::fs::remove_file(&temp_path).await;
        if final_exists {
            let _ = tokio::fs::rename(&backup_path, &final_path).await;
        }
        return Err(
            "download_failed: Unable to store logbook JSON: simulated final replacement failure."
                .into(),
        );
    }

    if let Err(error) = tokio::fs::rename(&temp_path, &final_path).await {
        if final_exists {
            let _ = tokio::fs::rename(&backup_path, &final_path).await;
        }
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(format!(
            "download_failed: Unable to store logbook JSON: {error}"
        ));
    }

    if tokio::fs::metadata(&final_path).await.is_err() {
        let _ = tokio::fs::remove_file(&final_path).await;
        if final_exists {
            let _ = tokio::fs::rename(&backup_path, &final_path).await;
        }
        return Err("download_failed: Unable to verify stored logbook JSON.".into());
    }

    if final_exists {
        let _ = tokio::fs::remove_file(&backup_path).await;
    }

    append_sync_log(&format!("logbook:write {}", final_path.display()));
    remove_stale_logbook_json_files(logbook_dir);

    Ok(crate::DeltaLogbookArtifact {
        file_name,
        path: final_path.to_string_lossy().into_owned(),
        bytes: trimmed.len(),
        content_type,
    })
}

pub(crate) async fn store_logbook_json(
    app: &AppHandle,
    json_text: &str,
    content_type: Option<String>,
) -> Result<crate::DeltaLogbookArtifact, String> {
    let logbook_dir = crate::app::paths::build_logbook_dir(app)?;
    store_logbook_json_in_dir(&logbook_dir, json_text, content_type, false).await
}

pub(crate) fn read_deltava_logbook(app: &AppHandle) -> crate::DeltaLogbookCachePayload {
    let artifact = read_logbook_artifact(app);
    let (path, json) = match artifact {
        LogbookArtifactRead::Valid { path, document } => (path, document),
        LogbookArtifactRead::Missing => {
            return empty_logbook_cache(app, crate::LOGBOOK_STATUS_MISSING, None, None)
        }
        LogbookArtifactRead::Invalid { path, reason } => {
            append_sync_log(&format!(
                "logbook:read-invalid {} ({reason})",
                path.display()
            ));
            return empty_logbook_cache(
                app,
                crate::LOGBOOK_STATUS_INVALID,
                Some(crate::LOGBOOK_CACHE_INVALID_CODE),
                Some(crate::LOGBOOK_CACHE_INVALID_MESSAGE),
            );
        }
    };

    let (entries, rejected_entry_count) = validate_logbook_entries(&json);
    append_sync_log(&format!(
        "logbook:read-rows accepted={} rejected={}",
        entries.len(),
        rejected_entry_count
    ));
    let last_sync_at = fs::metadata(&path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(system_time_to_iso);

    crate::DeltaLogbookCachePayload {
        status: crate::LOGBOOK_STATUS_READY,
        error_code: None,
        error: None,
        date_iso: extract_latest_logbook_date_iso(&json),
        last_sync_at,
        profile_metadata: crate::services::deltava::profile_cache::read(app),
        entry_count: entries.len(),
        accepted_entry_count: entries.len(),
        rejected_entry_count,
        entries,
    }
}

fn empty_logbook_cache(
    app: &AppHandle,
    status: &'static str,
    error_code: Option<&'static str>,
    error: Option<&'static str>,
) -> crate::DeltaLogbookCachePayload {
    crate::DeltaLogbookCachePayload {
        status,
        error_code,
        error,
        date_iso: None,
        last_sync_at: None,
        profile_metadata: crate::services::deltava::profile_cache::read(app),
        entries: Vec::new(),
        entry_count: 0,
        accepted_entry_count: 0,
        rejected_entry_count: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_test_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("flight-planner-logbook-test-{stamp}"))
    }

    fn run_async<T>(future: impl std::future::Future<Output = T>) -> T {
        tokio::runtime::Runtime::new()
            .expect("runtime")
            .block_on(future)
    }

    #[test]
    fn normalize_logbook_entries_accepts_supported_shapes() {
        let direct = json!([{ "logbookId": 1 }]);
        let entries = json!({ "entries": [{ "logbookId": 2 }] });
        let flights = json!({ "flights": [{ "logbookId": 3 }] });
        let logbook = json!({ "logbook": [{ "logbookId": 4 }] });
        let data = json!({ "data": [{ "logbookId": 5 }] });

        assert_eq!(normalize_logbook_entries(&direct).len(), 1);
        assert_eq!(normalize_logbook_entries(&entries).len(), 1);
        assert_eq!(normalize_logbook_entries(&flights).len(), 1);
        assert_eq!(normalize_logbook_entries(&logbook).len(), 1);
        assert_eq!(normalize_logbook_entries(&data).len(), 1);
        assert!(normalize_logbook_entries(&json!({ "logbookId": 6, "status": "OK" })).is_empty());
    }

    #[test]
    fn fixture_projects_only_valid_frontend_rows_and_reports_rejections() {
        let document: Value = serde_json::from_str(include_str!(
            "../../../../test-fixtures/deltava/logbook-boundary.json"
        ))
        .expect("boundary fixture");

        let (entries, rejected) = validate_logbook_entries(&document);
        assert_eq!(entries.len(), 2);
        assert_eq!(rejected, 2);

        let serialized = serde_json::to_value(&entries).expect("serialized DTO entries");
        assert_eq!(serialized.as_array().map(Vec::len), Some(2));
        assert!(serialized.to_string().contains("logbookId"));
        assert!(!serialized.to_string().contains("profile"));
    }

    #[test]
    fn artifact_validation_rejects_malformed_and_unrelated_objects() {
        let directory = unique_test_dir();
        std::fs::create_dir_all(&directory).expect("test dir");
        let malformed = directory.join(DELTAVA_LOGBOOK_FILE);
        std::fs::write(&malformed, "{not-json}").expect("malformed file");
        assert!(matches!(
            read_logbook_artifact_from_path(malformed),
            LogbookArtifactRead::Invalid { .. }
        ));

        let unrelated = directory.join(DELTAVA_LOGBOOK_FILE);
        std::fs::write(&unrelated, r#"{"profile":{"name":"Pilot"}}"#).expect("unrelated file");
        assert!(matches!(
            read_logbook_artifact_from_path(unrelated),
            LogbookArtifactRead::Invalid { .. }
        ));

        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn artifact_validation_accepts_array_and_root_collection_exports() {
        for (name, text) in [
            ("array.json", r#"[{"logbookId":1}]"#),
            ("root.json", r#"{"flights":[{"logbookId":2}]}"#),
        ] {
            let directory = unique_test_dir();
            std::fs::create_dir_all(&directory).expect("test dir");
            let path = directory.join(name);
            std::fs::write(&path, text).expect("export file");
            assert!(matches!(
                read_logbook_artifact_from_path(path),
                LogbookArtifactRead::Valid { .. }
            ));
            let _ = std::fs::remove_dir_all(&directory);
        }
    }

    #[test]
    fn extract_latest_logbook_date_iso_uses_max_date_for_mixed_order_rows() {
        let json = json!({
            "entries": [
                { "date": { "y": 2026, "m": 3, "d": 11 } },
                { "date": { "y": 2026, "m": 0, "d": 2 } },
                { "date": { "y": 2026, "m": 5, "d": 1 } }
            ]
        });

        assert_eq!(
            extract_latest_logbook_date_iso(&json),
            Some("2026-06-01".to_string())
        );
    }

    #[test]
    fn extract_latest_logbook_date_iso_does_not_trust_last_entry() {
        let json = json!({
            "flights": [
                { "date": { "y": 2026, "m": 5, "d": 1 } },
                { "date": { "y": 2026, "m": 3, "d": 11 } },
                { "date": { "y": 2026, "m": 0, "d": 2 } }
            ]
        });

        assert_eq!(
            extract_latest_logbook_date_iso(&json),
            Some("2026-06-01".to_string())
        );
    }

    #[test]
    fn store_logbook_json_writes_final_file() {
        let logbook_dir = unique_test_dir();
        let json_text = json!({
            "entries": [
                { "date": { "y": 2026, "m": 0, "d": 2 }, "status": "OK" }
            ]
        })
        .to_string();

        let artifact = run_async(store_logbook_json_in_dir(
            &logbook_dir,
            &json_text,
            None,
            false,
        ))
        .expect("store logbook");

        let stored_text =
            std::fs::read_to_string(logbook_dir.join(DELTAVA_LOGBOOK_FILE)).expect("stored file");
        assert_eq!(stored_text, json_text);
        assert_eq!(artifact.file_name, DELTAVA_LOGBOOK_FILE);
        assert_eq!(artifact.bytes, json_text.len());

        let profile_path = logbook_dir.join(crate::app::paths::DELTAVA_LOGBOOK_PROFILE_FILE);
        std::fs::write(&profile_path, r#"{"displayName":"Captain Cached"}"#).expect("profile");
        remove_stale_logbook_json_files(&logbook_dir);
        assert!(profile_path.exists());

        let _ = std::fs::remove_dir_all(&logbook_dir);
    }

    #[test]
    fn store_logbook_json_preserves_profile_cache() {
        let logbook_dir = unique_test_dir();
        std::fs::create_dir_all(&logbook_dir).expect("test dir");
        let profile_path = logbook_dir.join(crate::app::paths::DELTAVA_LOGBOOK_PROFILE_FILE);
        let profile_json = r#"{"displayName":"Captain Cached"}"#;
        std::fs::write(&profile_path, profile_json).expect("profile");

        run_async(store_logbook_json_in_dir(
            &logbook_dir,
            r#"{"entries":[]}"#,
            None,
            false,
        ))
        .expect("store logbook");

        assert_eq!(
            std::fs::read_to_string(profile_path).expect("profile after store"),
            profile_json
        );
        let _ = std::fs::remove_dir_all(&logbook_dir);
    }

    #[test]
    fn store_logbook_json_rejects_oversized_payloads() {
        let logbook_dir = unique_test_dir();
        let oversized = format!(
            "{{\"value\":\"{}\"}}",
            "a".repeat(MAX_DELTAVA_LOGBOOK_JSON_BYTES + 1)
        );

        let error = run_async(store_logbook_json_in_dir(
            &logbook_dir,
            &oversized,
            None,
            false,
        ))
        .expect_err("oversized payload");

        assert!(error.contains("exceeded"));
        assert!(!logbook_dir.join(DELTAVA_LOGBOOK_FILE).exists());

        let _ = std::fs::remove_dir_all(&logbook_dir);
    }

    #[test]
    fn store_logbook_json_rejects_invalid_json() {
        let logbook_dir = unique_test_dir();

        let error = run_async(store_logbook_json_in_dir(
            &logbook_dir,
            "{not-json}",
            None,
            false,
        ))
        .expect_err("invalid payload");

        assert!(error.contains("invalid_json"));
        assert!(!logbook_dir.join(DELTAVA_LOGBOOK_FILE).exists());

        let _ = std::fs::remove_dir_all(&logbook_dir);
    }

    #[test]
    fn store_logbook_json_restores_existing_file_when_replace_fails() {
        let logbook_dir = unique_test_dir();
        std::fs::create_dir_all(&logbook_dir).expect("test dir");
        let final_path = logbook_dir.join(DELTAVA_LOGBOOK_FILE);
        let original_text = json!({
            "entries": [
                { "date": { "y": 2026, "m": 0, "d": 1 }, "status": "OK" }
            ]
        })
        .to_string();
        std::fs::write(&final_path, &original_text).expect("original file");

        let replacement_text = json!({
            "entries": [
                { "date": { "y": 2026, "m": 0, "d": 2 }, "status": "OK" }
            ]
        })
        .to_string();
        let error = run_async(store_logbook_json_in_dir(
            &logbook_dir,
            &replacement_text,
            None,
            true,
        ))
        .expect_err("simulated replacement failure");

        assert!(error.contains("simulated final replacement failure"));
        assert_eq!(
            std::fs::read_to_string(&final_path).expect("restored file"),
            original_text
        );

        let _ = std::fs::remove_dir_all(&logbook_dir);
    }
}
