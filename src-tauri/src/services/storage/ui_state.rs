use tauri::AppHandle;

const MAX_UI_STATE_BYTES: usize = 5 * 1024 * 1024;

fn validate_ui_state_size(json: &str) -> Result<(), String> {
    if json.len() > MAX_UI_STATE_BYTES {
        return Err(format!("UI state exceeded the {MAX_UI_STATE_BYTES} byte limit."));
    }
    Ok(())
}

// Persists the complete UI-state snapshot without exposing file operations to the command layer.
pub(crate) fn write_ui_state(app: &AppHandle, json: &str) -> Result<(), String> {
    validate_ui_state_size(json)?;
    let path = crate::app::paths::ui_state_path(app)?;
    super::atomic_json::write_atomic_json(&path, json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ui_state_size_limit_rejects_oversized_payloads_before_io() {
        assert!(validate_ui_state_size("{}").is_ok());
        assert!(validate_ui_state_size(&"x".repeat(MAX_UI_STATE_BYTES + 1)).is_err());
    }
}
