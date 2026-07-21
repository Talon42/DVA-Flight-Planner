use crate::services::deltava::auth::DeltaVirtualAuthSettings;
use tauri::{AppHandle, State};

use crate::app::state::UserDataPersistenceGate;

#[tauri::command]
pub(crate) fn read_deltava_auth_settings(
    app: AppHandle,
) -> Result<DeltaVirtualAuthSettings, String> {
    crate::services::deltava::auth::read_deltava_auth_settings(app)
}

#[tauri::command]
pub(crate) async fn save_deltava_auth_settings(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
    first_name: String,
    last_name: String,
    password: Option<String>,
) -> Result<DeltaVirtualAuthSettings, String> {
    let _guard = gate.lock().await;
    crate::services::deltava::auth::save_deltava_auth_settings(app, first_name, last_name, password)
}

#[tauri::command]
pub(crate) async fn clear_deltava_auth_settings(
    app: AppHandle,
    gate: State<'_, UserDataPersistenceGate>,
) -> Result<(), String> {
    let _guard = gate.lock().await;
    crate::services::deltava::auth::clear_deltava_auth_settings(app)
}
