use crate::{append_sync_log, DeltaLogbookPilotProfileMetadata};
use std::{fs, path::Path};
use tauri::{AppHandle, Manager};

#[derive(Debug)]
pub(crate) enum ProfileCacheResolveOutcome {
    Ready(DeltaLogbookPilotProfileMetadata),
    Unavailable,
    Failed {
        cached: Option<DeltaLogbookPilotProfileMetadata>,
        error: String,
    },
}

fn normalize(mut metadata: DeltaLogbookPilotProfileMetadata) -> DeltaLogbookPilotProfileMetadata {
    if metadata.display_name.is_none() {
        if let Some(raw_header) = metadata.raw_profile_header.as_deref() {
            metadata.display_name =
                super::pilot_profile::derive_display_name_from_profile_header(raw_header);
        }
    }
    if metadata.display_name.is_none() {
        if let (Some(rank), Some(name)) = (metadata.rank.as_deref(), metadata.name.as_deref()) {
            let rank = rank.trim();
            let name = name.trim();
            if !rank.is_empty() && !name.is_empty() {
                metadata.display_name = Some(format!("{rank} {name}"));
            }
        }
    }
    metadata
}

fn read_from_path(path: &Path, normalize_result: bool) -> Option<DeltaLogbookPilotProfileMetadata> {
    let text = fs::read_to_string(path).ok()?;
    let metadata = serde_json::from_str(&text).ok()?;
    Some(if normalize_result {
        normalize(metadata)
    } else {
        metadata
    })
}

pub(crate) fn read(app: &AppHandle) -> Option<DeltaLogbookPilotProfileMetadata> {
    let path = crate::app::paths::build_logbook_profile_path(app).ok()?;
    path.is_file()
        .then(|| read_from_path(&path, true))
        .flatten()
}

fn read_raw(app: &AppHandle) -> Option<DeltaLogbookPilotProfileMetadata> {
    let path = crate::app::paths::build_logbook_profile_path(app).ok()?;
    path.is_file()
        .then(|| read_from_path(&path, false))
        .flatten()
}

fn store(
    app: &AppHandle,
    metadata: &DeltaLogbookPilotProfileMetadata,
) -> Result<DeltaLogbookPilotProfileMetadata, String> {
    let path = crate::app::paths::build_logbook_profile_path(app)?;
    let normalized = normalize(metadata.clone());
    let json = serde_json::to_string_pretty(&normalized).map_err(|error| {
        format!(
            "download_failed: Unable to serialize Delta Virtual pilot profile metadata: {error}"
        )
    })?;
    crate::services::storage::atomic_json::write_atomic_json(&path, &json).map_err(|error| {
        format!("download_failed: Unable to write Delta Virtual pilot profile metadata: {error}")
    })?;
    Ok(normalized)
}

fn is_complete(metadata: &DeltaLogbookPilotProfileMetadata, export_id: &str) -> bool {
    metadata
        .export_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        == Some(export_id)
        && metadata.display_name.is_some()
        && metadata.pilot_code.is_some()
        && metadata.flying_since_year.is_some()
        && metadata.total_block_time_minutes.is_some()
}

pub(crate) async fn resolve(
    app: &AppHandle,
    export_id: Option<&str>,
    force_refresh: bool,
) -> ProfileCacheResolveOutcome {
    let export_id = export_id.map(str::trim).filter(|value| !value.is_empty());
    let cached = read_raw(app);
    if let (Some(export_id), Some(metadata)) = (export_id, cached.clone()) {
        if !force_refresh && is_complete(&metadata, export_id) {
            return ProfileCacheResolveOutcome::Ready(normalize(metadata));
        }
        if metadata
            .export_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            == Some(export_id)
            && metadata.display_name.is_none()
        {
            append_sync_log(&format!(
                "pilot-profile:cache-ignored exportId={export_id} reason=missing-display-name"
            ));
        }
    }
    let Some(export_id) = export_id else {
        append_sync_log("pilot-profile:skipped reason=missing-export-id");
        return cached
            .map(normalize)
            .map(ProfileCacheResolveOutcome::Ready)
            .unwrap_or(ProfileCacheResolveOutcome::Unavailable);
    };
    append_sync_log(&format!(
        "pilot-profile:resolved-export-id exportId={export_id}"
    ));
    let previous = cached.map(normalize);
    let http_client = app.state::<super::http::DeltaVirtualHttpClient>();
    let refresh = refresh_outcome(
        previous.clone(),
        super::pilot_profile::fetch_delta_virtual_pilot_profile_metadata(
            http_client.client(),
            export_id,
        )
        .await,
    );
    let ProfileCacheResolveOutcome::Ready(fetched) = refresh else {
        if let ProfileCacheResolveOutcome::Failed { ref error, .. } = refresh {
            append_sync_log(&format!(
                "pilot-profile:refresh-failed exportId={export_id} reason={error}"
            ));
        }
        return refresh;
    };
    match store(app, &fetched) {
        Ok(metadata) => ProfileCacheResolveOutcome::Ready(metadata),
        Err(error) => {
            append_sync_log(&format!(
                "pilot-profile:cache-write-failed exportId={export_id} reason={error}"
            ));
            ProfileCacheResolveOutcome::Failed {
                cached: previous,
                error,
            }
        }
    }
}

// Converts a refresh result into an outcome without discarding a usable cached profile.
fn refresh_outcome(
    cached: Option<DeltaLogbookPilotProfileMetadata>,
    fetched: Result<DeltaLogbookPilotProfileMetadata, String>,
) -> ProfileCacheResolveOutcome {
    match fetched {
        Ok(metadata) => ProfileCacheResolveOutcome::Ready(metadata),
        Err(error) => ProfileCacheResolveOutcome::Failed { cached, error },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path() -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("dva-profile-cache-{}-{unique}", std::process::id()))
            .join("profile.json")
    }

    #[test]
    fn normalize_backfills_display_name_and_incomplete_cache_fails_policy() {
        let metadata = DeltaLogbookPilotProfileMetadata {
            export_id: Some("11384".into()),
            profile_url: None,
            raw_profile_header: None,
            display_name: None,
            rank: Some("Captain".into()),
            name: Some("Jacob Benjamin".into()),
            pilot_code: Some("DVA11384".into()),
            equipment_type: None,
            flying_since_year: Some(2013),
            total_block_time_minutes: None,
            fetched_at_utc: None,
        };
        let normalized = normalize(metadata);
        assert_eq!(
            normalized.display_name.as_deref(),
            Some("Captain Jacob Benjamin")
        );
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

    fn sample_metadata(name: &str) -> DeltaLogbookPilotProfileMetadata {
        DeltaLogbookPilotProfileMetadata {
            export_id: Some("11384".into()),
            display_name: Some(name.into()),
            pilot_code: Some("DVA11384".into()),
            ..Default::default()
        }
    }

    #[test]
    fn forced_refresh_success_returns_fresh_metadata() {
        let outcome = refresh_outcome(
            Some(sample_metadata("Captain Previous")),
            Ok(sample_metadata("Captain Fresh")),
        );
        assert!(
            matches!(outcome, ProfileCacheResolveOutcome::Ready(metadata) if metadata.display_name.as_deref() == Some("Captain Fresh"))
        );
    }

    #[test]
    fn forced_refresh_failure_returns_old_cache_when_available() {
        let outcome = refresh_outcome(
            Some(sample_metadata("Captain Previous")),
            Err("http status".into()),
        );
        assert!(
            matches!(outcome, ProfileCacheResolveOutcome::Failed { cached: Some(metadata), .. } if metadata.display_name.as_deref() == Some("Captain Previous"))
        );
    }

    #[test]
    fn forced_refresh_failure_without_cache_is_unavailable_to_ui() {
        let outcome = refresh_outcome(None, Err("parse failure".into()));
        assert!(matches!(
            outcome,
            ProfileCacheResolveOutcome::Failed { cached: None, .. }
        ));
    }
}
