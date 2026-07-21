use std::{fs, io, path::Path};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::services::deltava::{auth::clear_auth_settings_internal, draft::DVA_DRAFT_WEBVIEW_DIR};

const APP_DATA_TARGETS: &[(&str, &str)] = &[
    ("savedSchedule", "saved-schedule.json"),
    ("uiState", "ui-state.json"),
    ("simbriefSettings", "simbrief-settings.json"),
    ("gettingStarted", "getting-started.json"),
    ("whatsNewState", "whats-new-state.json"),
    ("devToolsState", "dev-tools-state.json"),
    ("mainWindowState", "main-window-state.json"),
    ("addonAirports", "addon-airports.json"),
    ("deltavaToursCache", "dva-tours-cache.json"),
    ("deltavaTourProgress", "dva-tour-progress.json"),
    ("appLog", "log.txt"),
];

const LOCAL_DATA_TARGETS: &[(&str, &str)] = &[
    ("deltavaSync", "deltava-sync"),
    ("deltavaWebview", "deltava-webview"),
    ("deltavaDraftWebview", DVA_DRAFT_WEBVIEW_DIR),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserDataClearFailure {
    target: String,
    reason_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserDataClearResult {
    ok: bool,
    cleared_targets: Vec<String>,
    missing_targets: Vec<String>,
    failures: Vec<UserDataClearFailure>,
}

fn reason_code(error: &io::Error) -> &'static str {
    match error.kind() {
        io::ErrorKind::PermissionDenied => "access_denied",
        _ if matches!(error.raw_os_error(), Some(32 | 33)) => "in_use",
        _ => "io_error",
    }
}

fn remove_allowlisted_path(
    target: &str,
    path: &Path,
    result: &mut UserDataClearResult,
) {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            result.missing_targets.push(target.to_string());
            return;
        }
        Err(error) => {
            result.failures.push(UserDataClearFailure {
                target: target.to_string(),
                reason_code: reason_code(&error).to_string(),
            });
            return;
        }
    };

    let deletion = if metadata.is_dir() && !metadata.file_type().is_symlink() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    match deletion {
        Ok(()) => result.cleared_targets.push(target.to_string()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            result.missing_targets.push(target.to_string())
        }
        Err(error) => result.failures.push(UserDataClearFailure {
            target: target.to_string(),
            reason_code: reason_code(&error).to_string(),
        }),
    }
}

#[cfg(test)]
fn clear_allowlisted_user_data<F>(
    app_data_dir: &Path,
    local_data_dir: &Path,
    clear_credentials: F,
) -> UserDataClearResult
where
    F: FnOnce() -> Result<(), String>,
{
    let mut result = UserDataClearResult {
        ok: false,
        cleared_targets: Vec::new(),
        missing_targets: Vec::new(),
        failures: Vec::new(),
    };

    for (target, relative_path) in APP_DATA_TARGETS {
        remove_allowlisted_path(target, &app_data_dir.join(relative_path), &mut result);
    }
    for (target, relative_path) in LOCAL_DATA_TARGETS {
        remove_allowlisted_path(target, &local_data_dir.join(relative_path), &mut result);
    }

    match clear_credentials() {
        Ok(()) => result.cleared_targets.push("deltavaCredentials".to_string()),
        Err(_) => result.failures.push(UserDataClearFailure {
            target: "deltavaCredentials".to_string(),
            reason_code: "credential_error".to_string(),
        }),
    }
    result.ok = result.failures.is_empty();
    result
}

/// Clears only explicitly allowlisted user-owned artifacts and reports every attempted category.
pub(crate) fn clear_user_data(app: &AppHandle) -> UserDataClearResult {
    let app_data_dir = app.path().app_data_dir();
    let local_data_dir = app.path().app_local_data_dir();
    let mut result = UserDataClearResult {
        ok: false,
        cleared_targets: Vec::new(),
        missing_targets: Vec::new(),
        failures: Vec::new(),
    };

    match app_data_dir {
        Ok(directory) => {
            for (target, relative_path) in APP_DATA_TARGETS {
                remove_allowlisted_path(target, &directory.join(relative_path), &mut result);
            }
        }
        Err(_) => result.failures.push(UserDataClearFailure {
            target: "appData".to_string(),
            reason_code: "path_unavailable".to_string(),
        }),
    }
    match local_data_dir {
        Ok(directory) => {
            for (target, relative_path) in LOCAL_DATA_TARGETS {
                remove_allowlisted_path(target, &directory.join(relative_path), &mut result);
            }
        }
        Err(_) => result.failures.push(UserDataClearFailure {
            target: "localData".to_string(),
            reason_code: "path_unavailable".to_string(),
        }),
    }
    match clear_auth_settings_internal(app) {
        Ok(()) => result.cleared_targets.push("deltavaCredentials".to_string()),
        Err(_) => result.failures.push(UserDataClearFailure {
            target: "deltavaCredentials".to_string(),
            reason_code: "credential_error".to_string(),
        }),
    }
    result.ok = result.failures.is_empty();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(label: &str) -> PathBuf {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("flight-planner-user-data-{label}-{unique}"))
    }

    #[test]
    fn removes_only_allowlisted_targets_and_preserves_unrelated_files() {
        let root = temp_root("allowlist");
        let app_data = root.join("app");
        let local_data = root.join("local");
        fs::create_dir_all(local_data.join("deltava-sync")).unwrap();
        fs::create_dir_all(&app_data).unwrap();
        fs::write(app_data.join("saved-schedule.json"), "{}").unwrap();
        fs::write(app_data.join("unrelated.txt"), "keep").unwrap();

        let result = clear_allowlisted_user_data(&app_data, &local_data, || Ok(()));

        assert!(result.ok);
        assert!(!app_data.join("saved-schedule.json").exists());
        assert!(!local_data.join("deltava-sync").exists());
        assert!(app_data.join("unrelated.txt").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn credential_failure_is_reported_after_all_files_are_attempted() {
        let root = temp_root("credentials");
        let app_data = root.join("app");
        let local_data = root.join("local");
        fs::create_dir_all(&app_data).unwrap();
        fs::create_dir_all(&local_data).unwrap();
        fs::write(app_data.join("ui-state.json"), "{}").unwrap();

        let result = clear_allowlisted_user_data(&app_data, &local_data, || Err("no vault".into()));

        assert!(!result.ok);
        assert!(!app_data.join("ui-state.json").exists());
        assert!(result.failures.iter().any(|failure| {
            failure.target == "deltavaCredentials" && failure.reason_code == "credential_error"
        }));
        let _ = fs::remove_dir_all(root);
    }
}
