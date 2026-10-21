use tauri::AppHandle;

#[tauri::command]
pub(crate) fn read_deltava_logbook(app: AppHandle) -> crate::DeltaLogbookCachePayload {
    crate::services::deltava::logbook::read_deltava_logbook(&app)
}
