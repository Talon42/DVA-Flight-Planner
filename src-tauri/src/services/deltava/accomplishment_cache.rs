use crate::services::deltava::sync_types::DeltaAccomplishmentEligibilityStore;
use std::fs;
use tauri::AppHandle;

pub(crate) fn read(app: &AppHandle) -> DeltaAccomplishmentEligibilityStore {
    let Ok(path) = crate::app::paths::build_accomplishment_eligibility_path(app) else {
        return DeltaAccomplishmentEligibilityStore::default();
    };
    let Ok(text) = fs::read_to_string(path) else {
        return DeltaAccomplishmentEligibilityStore::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub(crate) fn store(
    app: &AppHandle,
    value: &DeltaAccomplishmentEligibilityStore,
) -> Result<DeltaAccomplishmentEligibilityStore, String> {
    let path = crate::app::paths::build_accomplishment_eligibility_path(app)?;
    let json = serde_json::to_string_pretty(value).map_err(|error| {
        format!("download_failed: Unable to serialize accomplishment eligibility: {error}")
    })?;
    crate::services::storage::atomic_json::write_atomic_json(&path, &json).map_err(|error| {
        format!("download_failed: Unable to write accomplishment eligibility: {error}")
    })?;
    Ok(value.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn failed_atomic_accomplishment_replacement_preserves_last_good_cache() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "dva-accomplishment-cache-{}-{unique}",
            std::process::id()
        ));
        let path = directory.join("eligibility.json");
        let previous = r#"{"lastSyncAt":"2026-07-19T12:00:00Z","rows":[]}"#;
        let replacement = r#"{"lastSyncAt":"2026-07-20T12:00:00Z","rows":[]}"#;
        crate::services::storage::atomic_json::write_atomic_json(&path, previous).unwrap();

        assert!(crate::services::storage::atomic_json::write_atomic_json_with_simulated_final_rename_failure(&path, replacement).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), previous);
        assert!(!path.with_file_name("eligibility.json.tmp").exists());
        assert!(!path.with_file_name("eligibility.json.bak").exists());
        let _ = fs::remove_dir_all(directory);
    }
}
