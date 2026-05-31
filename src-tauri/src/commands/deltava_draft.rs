use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub(crate) async fn submit_deltava_draft_flight_report(
    app: AppHandle,
    payload: Value,
    debug_enabled: bool,
) -> crate::services::deltava::draft::DraftSubmitResult {
    crate::services::deltava::draft::submit_deltava_draft_flight_report(app, payload, debug_enabled)
        .await
}
