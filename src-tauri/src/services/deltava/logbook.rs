use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};
use tauri::AppHandle;

use crate::{append_sync_log, DELTAVA_LOGBOOK_FILE};

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

pub(crate) async fn store_logbook_json(
    app: &AppHandle,
    json_text: &str,
    content_type: Option<String>,
) -> Result<crate::DeltaLogbookArtifact, String> {
    let trimmed = json_text.trim();
    if trimmed.is_empty() {
        return Err("download_failed: Delta Virtual logbook JSON export was empty.".into());
    }

    serde_json::from_str::<Value>(trimmed).map_err(|error| {
        format!("invalid_json: Delta Virtual logbook JSON was invalid: {error}")
    })?;
    append_sync_log("logbook:json-valid");

    let logbook_dir = crate::app::paths::build_logbook_dir(app)?;
    remove_stale_logbook_json_files(&logbook_dir);

    let file_name = DELTAVA_LOGBOOK_FILE.to_string();
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

    append_sync_log(&format!("logbook:write {}", final_path.display()));

    Ok(crate::DeltaLogbookArtifact {
        file_name,
        path: final_path.to_string_lossy().into_owned(),
        bytes: trimmed.as_bytes().len(),
        content_type,
    })
}

pub(crate) fn read_deltava_logbook(app: &AppHandle) -> crate::DeltaLogbookCachePayload {
    let Some(path) = crate::app::paths::resolve_existing_logbook_json_path(app) else {
        return crate::DeltaLogbookCachePayload {
            date_iso: None,
            last_sync_at: None,
            entries: Vec::new(),
            entry_count: 0,
        };
    };

    let Some(json) = read_logbook_document(&path) else {
        append_sync_log(&format!("logbook:read-invalid {}", path.display()));
        return crate::DeltaLogbookCachePayload {
            date_iso: None,
            last_sync_at: None,
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
        entry_count: entries.len(),
        entries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
}
