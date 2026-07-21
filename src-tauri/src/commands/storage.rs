use tauri::{AppHandle, State};

use crate::app::state::UserDataPersistenceGate;

#[tauri::command]
pub(crate) async fn append_app_log_text(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    text: String,
) -> Result<(), String> {
    let _guard = gate.lock().await;
    crate::app::logging::append_app_log_text(&app, &text)
}

#[tauri::command]
pub(crate) async fn write_ui_state(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    json: String,
) -> Result<(), String> {
    let _guard = gate.lock().await;
    crate::services::storage::ui_state::write_ui_state(&app, &json)
}

#[tauri::command]
pub(crate) fn read_app_storage_file(app: AppHandle, key: String) -> Result<Option<String>, String> {
    crate::services::storage::app_files::read(&app, &key)
}

#[tauri::command]
pub(crate) async fn write_app_storage_file(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    key: String,
    contents: String,
) -> Result<(), String> {
    let _guard = gate.lock().await;
    crate::services::storage::app_files::write(&app, &key, &contents)
}

#[tauri::command]
pub(crate) async fn quarantine_app_storage_file(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    key: String,
) -> Result<(), String> {
    let _guard = gate.lock().await;
    crate::services::storage::app_files::quarantine(&app, &key)
}

#[tauri::command]
pub(crate) async fn ensure_app_log_file(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    header: String,
) -> Result<String, String> {
    let _guard = gate.lock().await;
    crate::services::storage::app_files::ensure_app_log(&app, &header)
}

#[tauri::command]
pub(crate) fn prune_deltava_storage(app: AppHandle, remove_downloaded_schedule: bool) {
    crate::services::webview::profile_cleanup::prune_deltava_storage(
        &app,
        remove_downloaded_schedule,
        false,
    )
}

#[tauri::command]
pub(crate) fn read_deltava_logbook_metadata(app: AppHandle) -> crate::DeltaLogbookMetadata {
    crate::services::deltava::logbook_progress::read_deltava_logbook_metadata(&app)
}

#[tauri::command]
pub(crate) fn read_deltava_logbook_progress(app: AppHandle) -> crate::DeltaLogbookProgress {
    crate::services::deltava::logbook_progress::read_deltava_logbook_progress(&app)
}

#[tauri::command]
pub(crate) fn read_deltava_accomplishment_eligibility(
    app: AppHandle,
) -> crate::services::deltava::sync_types::DeltaAccomplishmentEligibilityStore {
    crate::services::deltava::accomplishment_cache::read(&app)
}

#[tauri::command]
pub(crate) async fn clear_user_data(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
) -> Result<crate::services::storage::user_data::UserDataClearResult, String> {
    let _guard = gate.lock().await;
    let result = crate::services::storage::user_data::clear_user_data(&app);
    if result.is_ok() {
        gate.suppress_window_state();
    }
    Ok(result)
}

#[tauri::command]
pub(crate) fn open_main_devtools(app: AppHandle) -> Result<(), String> {
    crate::services::storage::file_store::open_main_devtools(app)
}
