use tauri::{AppHandle, Manager};

/// Opens the main webview devtools from the app context menu.
pub(crate) fn open_main_devtools(app: AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window is not available.".to_string());
    };

    window.open_devtools();
    Ok(())
}
