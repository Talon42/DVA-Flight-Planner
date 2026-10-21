use tauri::{AppHandle, State};

use crate::app::state::{UserDataPersistenceGate, PERSISTENCE_WRITE_SUPPRESSED_ERROR};

// Commits a prepared cache only while persistence is still allowed.
async fn commit_addon_airport_cache<F>(
    gate: &UserDataPersistenceGate,
    write_cache: F,
) -> Result<(), String>
where
    F: FnOnce() -> Result<(), String>,
{
    let _guard = gate
        .begin_write()
        .await
        .map_err(|_| PERSISTENCE_WRITE_SUPPRESSED_ERROR.to_string())?;
    write_cache()
}

#[tauri::command]
pub(crate) fn read_addon_airport_cache(app: AppHandle) -> Result<crate::AddonAirportCache, String> {
    crate::services::addon_airports::read_addon_airport_cache_from_disk(&app)
}

#[tauri::command]
pub(crate) async fn save_addon_airport_roots(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    roots: Vec<String>,
) -> Result<crate::AddonAirportCache, String> {
    let roots = crate::services::addon_airports::normalize_addon_roots(roots);
    let next_cache = crate::services::addon_airports::build_idle_addon_airport_cache(roots);
    commit_addon_airport_cache(&gate, || {
        crate::services::addon_airports::write_addon_airport_cache_to_disk(&app, &next_cache)
    })
    .await?;
    Ok(next_cache)
}

#[tauri::command]
pub(crate) async fn scan_addon_airports(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    roots: Option<Vec<String>>,
) -> Result<crate::AddonAirportCache, String> {
    let roots_to_scan = match roots {
        Some(roots) => crate::services::addon_airports::normalize_addon_roots(roots),
        None => crate::services::addon_airports::read_addon_airport_cache_from_disk(&app)?.roots,
    };

    let cache = tauri::async_runtime::spawn_blocking(move || {
        crate::services::addon_airports::scan_addon_airports_for_roots(roots_to_scan)
    })
    .await
    .map_err(|error| format!("Addon airport scan did not complete: {error}"))?;

    commit_addon_airport_cache(&gate, || {
        crate::services::addon_airports::write_addon_airport_cache_to_disk(&app, &cache)
    })
    .await?;
    Ok(cache)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{commit_addon_airport_cache, UserDataPersistenceGate};

    #[tokio::test]
    async fn completed_scan_result_is_not_written_after_clear_starts() {
        let gate = UserDataPersistenceGate::default();
        let clear_guard = gate.begin_clear().await;
        drop(clear_guard);
        let path = std::env::temp_dir().join(format!(
            "dva-addon-cache-suppression-{}.json",
            uuid::Uuid::new_v4()
        ));

        let result = commit_addon_airport_cache(&gate, || {
            fs::write(&path, "scan result").map_err(|error| error.to_string())
        })
        .await;

        assert_eq!(
            result.unwrap_err(),
            crate::app::state::PERSISTENCE_WRITE_SUPPRESSED_ERROR
        );
        assert!(!path.exists());
    }
}
