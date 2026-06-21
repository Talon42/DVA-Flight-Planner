use tauri::AppHandle;

#[tauri::command]
pub(crate) async fn fetch_delta_virtual_pirep_details(
    app: AppHandle,
    request: crate::services::deltava::pirep_details::DeltaVirtualPirepDetailsRequest,
) -> Result<crate::services::deltava::pirep_details::DeltaVirtualPirepDetailsResult, String> {
    crate::services::deltava::pirep_details::fetch_delta_virtual_pirep_details(app, request).await
}
