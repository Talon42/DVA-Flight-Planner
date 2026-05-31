use crate::services::deltava::auth::DeltaVirtualAuthSettings;
use tauri::AppHandle;

#[tauri::command]
pub(crate) fn read_deltava_auth_settings(
    app: AppHandle,
) -> Result<DeltaVirtualAuthSettings, String> {
    crate::services::deltava::auth::read_deltava_auth_settings(app)
}

#[tauri::command]
pub(crate) fn save_deltava_auth_settings(
    app: AppHandle,
    first_name: String,
    last_name: String,
    password: Option<String>,
) -> Result<DeltaVirtualAuthSettings, String> {
    crate::services::deltava::auth::save_deltava_auth_settings(app, first_name, last_name, password)
}

#[tauri::command]
pub(crate) fn clear_deltava_auth_settings(app: AppHandle) -> Result<(), String> {
    crate::services::deltava::auth::clear_deltava_auth_settings(app)
}
