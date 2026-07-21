use tauri::{AppHandle, Manager};

use crate::services::{
    deltava::auth::clear_auth_settings_internal,
    webview::profile_cleanup::remove_dir_contents_if_exists,
};

/// Clears the app data folders and Delta Virtual settings used by the user profile.
pub(crate) fn clear_user_data(app: &AppHandle) -> Result<(), String> {
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        remove_dir_contents_if_exists(&app_data_dir);
    }

    let _ = clear_auth_settings_internal(app);

    if let Ok(local_data_dir) = app.path().app_local_data_dir() {
        remove_dir_contents_if_exists(&local_data_dir);
    }

    Ok(())
}

/// Opens the main webview devtools from the app context menu.
pub(crate) fn open_main_devtools(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window is not available.".to_string());
    };

    window.open_devtools();
    Ok(())
}
