use tauri::AppHandle;

#[tauri::command]
pub(crate) fn close_simbrief_dispatch_window(app: AppHandle) {
    crate::services::simbrief::dispatch::close_simbrief_dispatch_window(app)
}

#[tauri::command]
pub(crate) async fn fetch_simbrief_aircraft_types(
    app: AppHandle,
) -> Result<crate::services::simbrief::aircraft::SimBriefAircraftTypesResponse, String> {
    crate::services::simbrief::aircraft::fetch_simbrief_aircraft_types(app).await
}

#[tauri::command]
pub(crate) async fn refresh_simbrief_dispatch(
    app: AppHandle,
    payload: crate::services::simbrief::dispatch::SimBriefRefreshPayload,
    debug_enabled: bool,
) -> Result<crate::services::simbrief::dispatch::SimBriefPlanSummary, String> {
    crate::services::simbrief::dispatch::refresh_simbrief_dispatch(app, payload, debug_enabled)
        .await
}

#[tauri::command]
pub(crate) async fn start_simbrief_dispatch(
    app: AppHandle,
    manager: tauri::State<'_, crate::services::simbrief::dispatch::SimBriefDispatchManager>,
    payload: crate::services::simbrief::dispatch::SimBriefDispatchPayload,
    debug_enabled: bool,
) -> Result<crate::services::simbrief::dispatch::SimBriefPlanSummary, String> {
    crate::services::simbrief::dispatch::start_simbrief_dispatch(app, manager, payload, debug_enabled)
        .await
}
