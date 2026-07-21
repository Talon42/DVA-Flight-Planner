use tauri::{AppHandle, State};

use crate::app::state::UserDataPersistenceGate;

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
    let _guard = gate.lock().await;
    let roots = crate::services::addon_airports::normalize_addon_roots(roots);
    let next_cache = crate::services::addon_airports::build_idle_addon_airport_cache(roots);
    crate::services::addon_airports::write_addon_airport_cache_to_disk(&app, &next_cache)?;
    Ok(next_cache)
}

#[tauri::command]
pub(crate) async fn scan_addon_airports(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    roots: Option<Vec<String>>,
) -> Result<crate::AddonAirportCache, String> {
    let _guard = gate.lock().await;
    let roots_to_scan = match roots {
        Some(roots) => crate::services::addon_airports::normalize_addon_roots(roots),
        None => crate::services::addon_airports::read_addon_airport_cache_from_disk(&app)?.roots,
    };

    let cache = tauri::async_runtime::spawn_blocking(move || {
        crate::services::addon_airports::scan_addon_airports_for_roots(roots_to_scan)
    })
    .await
    .map_err(|error| format!("Addon airport scan did not complete: {error}"))?;

    crate::services::addon_airports::write_addon_airport_cache_to_disk(&app, &cache)?;
    Ok(cache)
}
