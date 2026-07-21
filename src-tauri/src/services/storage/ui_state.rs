use tauri::AppHandle;

// Persists the complete UI-state snapshot without exposing file operations to the command layer.
pub(crate) fn write_ui_state(app: &AppHandle, json: &str) -> Result<(), String> {
    let path = crate::app::paths::ui_state_path(app)?;
    super::atomic_json::write_atomic_json(&path, json)
}
