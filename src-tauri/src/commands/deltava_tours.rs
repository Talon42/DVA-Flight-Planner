use tauri::AppHandle;

#[tauri::command]
pub(crate) async fn sync_delta_virtual_tours(
    app: AppHandle,
    tours_sync_manager: tauri::State<'_, crate::services::deltava::tours::DeltaToursSyncManager>,
) -> Result<crate::services::deltava::tours::DeltaToursSyncPayload, String> {
    crate::services::deltava::tours::sync_delta_virtual_tours(app, tours_sync_manager).await
}

#[tauri::command]
pub(crate) async fn fetch_delta_virtual_tour_briefing(
    app: AppHandle,
    request: crate::services::deltava::tour_briefing::DeltaVirtualTourBriefingRequest,
) -> Result<crate::services::deltava::tour_briefing::DeltaVirtualTourBriefingResult, String> {
    crate::services::deltava::tour_briefing::fetch_delta_virtual_tour_briefing(app, request).await
}
