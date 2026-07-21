use crate::{append_sync_log, DeltaLogbookPilotProfileMetadata};
use std::{fs, path::Path};
use tauri::AppHandle;

fn normalize(mut metadata: DeltaLogbookPilotProfileMetadata) -> DeltaLogbookPilotProfileMetadata {
    if metadata.display_name.is_none() {
        if let Some(raw_header) = metadata.raw_profile_header.as_deref() {
            metadata.display_name = super::pilot_profile::derive_display_name_from_profile_header(raw_header);
        }
    }
    if metadata.display_name.is_none() {
        if let (Some(rank), Some(name)) = (metadata.rank.as_deref(), metadata.name.as_deref()) {
            let rank = rank.trim();
            let name = name.trim();
            if !rank.is_empty() && !name.is_empty() { metadata.display_name = Some(format!("{rank} {name}")); }
        }
    }
    metadata
}

fn read_from_path(path: &Path, normalize_result: bool) -> Option<DeltaLogbookPilotProfileMetadata> {
    let text = fs::read_to_string(path).ok()?;
    let metadata = serde_json::from_str(&text).ok()?;
    Some(if normalize_result { normalize(metadata) } else { metadata })
}

pub(crate) fn read(app: &AppHandle) -> Option<DeltaLogbookPilotProfileMetadata> {
    let path = crate::app::paths::build_logbook_profile_path(app).ok()?;
    path.is_file().then(|| read_from_path(&path, true)).flatten()
}

fn read_raw(app: &AppHandle) -> Option<DeltaLogbookPilotProfileMetadata> {
    let path = crate::app::paths::build_logbook_profile_path(app).ok()?;
    path.is_file().then(|| read_from_path(&path, false)).flatten()
}

fn store(app: &AppHandle, metadata: &DeltaLogbookPilotProfileMetadata) -> Result<DeltaLogbookPilotProfileMetadata, String> {
    let path = crate::app::paths::build_logbook_profile_path(app)?;
    let normalized = normalize(metadata.clone());
    let json = serde_json::to_string_pretty(&normalized).map_err(|error| format!("download_failed: Unable to serialize Delta Virtual pilot profile metadata: {error}"))?;
    crate::services::storage::atomic_json::write_atomic_json(&path, &json).map_err(|error| format!("download_failed: Unable to write Delta Virtual pilot profile metadata: {error}"))?;
    Ok(normalized)
}

fn is_complete(metadata: &DeltaLogbookPilotProfileMetadata, export_id: &str) -> bool {
    metadata.export_id.as_deref().map(str::trim).filter(|value| !value.is_empty()) == Some(export_id)
        && metadata.display_name.is_some() && metadata.pilot_code.is_some()
        && metadata.flying_since_year.is_some() && metadata.total_block_time_minutes.is_some()
}

pub(crate) async fn resolve(app: &AppHandle, export_id: Option<&str>, force_refresh: bool) -> DeltaLogbookPilotProfileMetadata {
    let export_id = export_id.map(str::trim).filter(|value| !value.is_empty());
    let profile_url = export_id.map(|value| format!("https://www.deltava.org/profile.do?id={value}"));
    let cached = if force_refresh { None } else { read_raw(app) };
    if let (Some(export_id), Some(metadata)) = (export_id, cached.clone()) {
        if is_complete(&metadata, export_id) { return normalize(metadata); }
        if metadata.export_id.as_deref().map(str::trim).filter(|value| !value.is_empty()) == Some(export_id) && metadata.display_name.is_none() {
            append_sync_log(&format!("pilot-profile:cache-ignored exportId={export_id} reason=missing-display-name"));
        }
    }
    let Some(export_id) = export_id else {
        append_sync_log("pilot-profile:skipped reason=missing-export-id");
        let metadata = super::pilot_profile::build_unavailable_pilot_profile_metadata(None, profile_url.as_deref());
        let _ = store(app, &metadata);
        return metadata;
    };
    append_sync_log(&format!("pilot-profile:resolved-export-id exportId={export_id}"));
    let metadata = super::pilot_profile::fetch_delta_virtual_pilot_profile_metadata(export_id).await
        .unwrap_or_else(|_| super::pilot_profile::build_unavailable_pilot_profile_metadata(Some(export_id), profile_url.as_deref()));
    let _ = store(app, &metadata);
    metadata
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path() -> std::path::PathBuf {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("dva-profile-cache-{}-{unique}", std::process::id())).join("profile.json")
    }

    #[test]
    fn normalize_backfills_display_name_and_incomplete_cache_fails_policy() {
        let metadata = DeltaLogbookPilotProfileMetadata {
            export_id: Some("11384".into()), profile_url: None, raw_profile_header: None,
            display_name: None, rank: Some("Captain".into()), name: Some("Jacob Benjamin".into()),
            pilot_code: Some("DVA11384".into()), equipment_type: None, flying_since_year: Some(2013),
            total_block_time_minutes: None, fetched_at_utc: None,
        };
        let normalized = normalize(metadata);
        assert_eq!(normalized.display_name.as_deref(), Some("Captain Jacob Benjamin"));
        assert!(!is_complete(&normalized, "11384"));
    }

    #[test]
    fn failed_atomic_profile_replacement_preserves_last_good_cache() {
        let path = test_path();
        let previous = r#"{"exportId":"11384","displayName":"Captain Previous"}"#;
        let replacement = r#"{"exportId":"11384","displayName":"Captain Replacement"}"#;
        crate::services::storage::atomic_json::write_atomic_json(&path, previous).unwrap();

        assert!(crate::services::storage::atomic_json::write_atomic_json_with_simulated_final_rename_failure(&path, replacement).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), previous);
        assert!(!path.with_file_name("profile.json.tmp").exists());
        assert!(!path.with_file_name("profile.json.bak").exists());
        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
