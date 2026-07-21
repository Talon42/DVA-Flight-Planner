use tauri::AppHandle;

#[tauri::command]
pub(crate) fn append_app_log_text(app: AppHandle, text: String) -> Result<(), String> {
    crate::app::logging::append_app_log_text(&app, &text)
}

#[tauri::command]
pub(crate) fn write_ui_state(app: AppHandle, json: String) -> Result<(), String> {
    crate::services::storage::ui_state::write_ui_state(&app, &json)
}

#[tauri::command]
pub(crate) fn read_app_storage_file(app: AppHandle, key: String) -> Result<Option<String>, String> {
    crate::services::storage::app_files::read(&app, &key)
}

#[tauri::command]
pub(crate) fn write_app_storage_file(app: AppHandle, key: String, contents: String) -> Result<(), String> {
    crate::services::storage::app_files::write(&app, &key, &contents)
}

#[tauri::command]
pub(crate) fn quarantine_app_storage_file(app: AppHandle, key: String) -> Result<(), String> {
    crate::services::storage::app_files::quarantine(&app, &key)
}

#[tauri::command]
pub(crate) fn ensure_app_log_file(app: AppHandle, header: String) -> Result<String, String> {
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
pub(crate) fn clear_user_data(
    app: AppHandle,
) -> crate::services::storage::user_data::UserDataClearResult {
    crate::services::storage::user_data::clear_user_data(&app)
}

#[tauri::command]
pub(crate) fn open_main_devtools(app: AppHandle) -> Result<(), String> {
    crate::services::storage::file_store::open_main_devtools(app)
}
