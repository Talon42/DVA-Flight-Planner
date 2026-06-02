use tauri::AppHandle;

#[tauri::command]
pub(crate) fn append_app_log_text(app: AppHandle, text: String) -> Result<(), String> {
    crate::app::logging::append_app_log_text(&app, &text)
}

#[tauri::command]
pub(crate) fn prune_deltava_storage(app: AppHandle, remove_downloaded_schedule: bool) {
    crate::services::storage::file_store::prune_deltava_storage(
        &app,
        remove_downloaded_schedule,
        false,
    )
}

#[tauri::command]
pub(crate) fn read_deltava_logbook_metadata(app: AppHandle) -> crate::DeltaLogbookMetadata {
    crate::services::storage::file_store::read_deltava_logbook_metadata(&app)
}

#[tauri::command]
pub(crate) fn read_deltava_logbook_progress(app: AppHandle) -> crate::DeltaLogbookProgress {
    crate::services::storage::file_store::read_deltava_logbook_progress(&app)
}

#[tauri::command]
pub(crate) fn clear_user_data(app: AppHandle) -> Result<(), String> {
    crate::services::storage::file_store::clear_user_data(&app)
}

#[tauri::command]
pub(crate) fn open_main_devtools(app: AppHandle) -> Result<(), String> {
    crate::services::storage::file_store::open_main_devtools(app)
}
