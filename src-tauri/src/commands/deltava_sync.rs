use tauri::AppHandle;

#[tauri::command]
pub(crate) fn close_deltava_sync_window(app: AppHandle) {
    crate::services::deltava::sync::close_deltava_sync_window(app)
}

#[tauri::command]
pub(crate) async fn start_deltava_sync(
    app: AppHandle,
    sync_manager: tauri::State<'_, crate::DeltaSyncManager>,
    sync_run_id: String,
    debug_enabled: bool,
) -> Result<crate::DeltaSyncPayload, String> {
    crate::services::deltava::sync::start_deltava_sync(
        app,
        sync_manager,
        sync_run_id,
        debug_enabled,
    )
    .await
}

#[tauri::command]
pub(crate) async fn refresh_deltava_logbook(
    app: AppHandle,
    sync_manager: tauri::State<'_, crate::DeltaSyncManager>,
    sync_run_id: String,
    debug_enabled: bool,
) -> Result<crate::DeltaSyncPayload, String> {
    crate::services::deltava::sync::refresh_deltava_logbook(
        app,
        sync_manager,
        sync_run_id,
        debug_enabled,
    )
    .await
}

/// Resets the active Delta Virtual sync session and prunes only its session folders.
#[tauri::command]
pub(crate) fn reset_deltava_sync_session(app: AppHandle) -> Result<(), String> {
    crate::services::deltava::sync::reset_deltava_sync_session(app)
}
