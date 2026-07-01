use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;

use crate::{append_sync_log, DELTAVA_LOGBOOK_FILE};
use crate::services::deltava::sync_types::MAX_DELTAVA_LOGBOOK_JSON_BYTES;

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

    for key in ["entries", "flights", "logbook", "data"] {
        if let Some(entries) = value.get(key).and_then(Value::as_array) {
            return entries.to_vec();
        }

        if let Some(nested) = value.get(key) {
            let nested_entries = normalize_logbook_entries(nested);
            if !nested_entries.is_empty() {
                return nested_entries;
            }
        }
    }

    if value.is_object() {
        return vec![value.clone()];
    }

    Vec::new()
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

fn read_logbook_document(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&text).ok()
}

fn collect_json_paths(logbook_dir: &Path) -> Vec<PathBuf> {
    let mut json_paths = fs::read_dir(logbook_dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let is_json = path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("json"))
                .unwrap_or(false);

            if path.is_file() && is_json {
                Some(path)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    json_paths.sort();
    json_paths
}

pub(crate) fn remove_stale_logbook_json_files(logbook_dir: &Path) {
    for path in collect_json_paths(logbook_dir) {
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_ascii_lowercase())
            .unwrap_or_default();

        if file_name == DELTAVA_LOGBOOK_FILE.to_ascii_lowercase() {
            continue;
        }

        if let Err(error) = fs::remove_file(&path) {
            append_sync_log(&format!("logbook:cleanup-skip {} ({error})", path.display()));
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
        tokio::fs::rename(&final_path, &backup_path).await.map_err(|error| {
            format!("download_failed: Unable to preserve the existing logbook JSON: {error}")
        })?;
    }

    if simulate_final_rename_failure {
        let _ = tokio::fs::remove_file(&temp_path).await;
        if final_exists {
            let _ = tokio::fs::rename(&backup_path, &final_path).await;
        }
        return Err("download_failed: Unable to store logbook JSON: simulated final replacement failure.".into());
    }

    if let Err(error) = tokio::fs::rename(&temp_path, &final_path).await {
        if final_exists {
            let _ = tokio::fs::rename(&backup_path, &final_path).await;
        }
        let _ = tokio::fs::remove_file(&temp_path).await;
        return Err(format!("download_failed: Unable to store logbook JSON: {error}"));
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
        bytes: trimmed.as_bytes().len(),
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
    let Some(path) = crate::app::paths::resolve_existing_logbook_json_path(app) else {
        return crate::DeltaLogbookCachePayload {
            date_iso: None,
            last_sync_at: None,
            profile_metadata: crate::services::storage::file_store::read_deltava_logbook_profile_metadata(app),
            entries: Vec::new(),
            entry_count: 0,
        };
    };

    let Some(json) = read_logbook_document(&path) else {
        append_sync_log(&format!("logbook:read-invalid {}", path.display()));
        return crate::DeltaLogbookCachePayload {
            date_iso: None,
            last_sync_at: None,
            profile_metadata: crate::services::storage::file_store::read_deltava_logbook_profile_metadata(app),
            entries: Vec::new(),
            entry_count: 0,
        };
    };

    let entries = normalize_logbook_entries(&json)
        .into_iter()
        .filter(|entry| entry.is_object())
        .collect::<Vec<_>>();
    let last_sync_at = fs::metadata(&path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(system_time_to_iso);

    crate::DeltaLogbookCachePayload {
        date_iso: extract_latest_logbook_date_iso(&json),
        last_sync_at,
        profile_metadata: crate::services::storage::file_store::read_deltava_logbook_profile_metadata(app),
        entry_count: entries.len(),
        entries,
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
        let single = json!({ "logbookId": 6, "status": "OK" });

        assert_eq!(normalize_logbook_entries(&direct).len(), 1);
        assert_eq!(normalize_logbook_entries(&entries).len(), 1);
        assert_eq!(normalize_logbook_entries(&flights).len(), 1);
        assert_eq!(normalize_logbook_entries(&logbook).len(), 1);
        assert_eq!(normalize_logbook_entries(&data).len(), 1);
        assert_eq!(normalize_logbook_entries(&single).len(), 1);
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

        let artifact = run_async(store_logbook_json_in_dir(&logbook_dir, &json_text, None, false))
            .expect("store logbook");

        let stored_text = std::fs::read_to_string(logbook_dir.join(DELTAVA_LOGBOOK_FILE))
            .expect("stored file");
        assert_eq!(stored_text, json_text);
        assert_eq!(artifact.file_name, DELTAVA_LOGBOOK_FILE);
        assert_eq!(artifact.bytes, json_text.len());

        let _ = std::fs::remove_dir_all(&logbook_dir);
    }

    #[test]
    fn store_logbook_json_rejects_oversized_payloads() {
        let logbook_dir = unique_test_dir();
        let oversized = format!(
            "{{\"value\":\"{}\"}}",
            "a".repeat(MAX_DELTAVA_LOGBOOK_JSON_BYTES + 1)
        );

        let error = run_async(store_logbook_json_in_dir(&logbook_dir, &oversized, None, false))
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
