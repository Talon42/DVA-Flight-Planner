use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};

pub(crate) const ADDON_AIRPORT_CACHE_FILE: &str = "addon-airports.json";
pub(crate) const MAIN_WINDOW_STATE_FILE: &str = "main-window-state.json";
pub(crate) const UI_STATE_FILE: &str = "ui-state.json";
pub(crate) const DELTAVA_SYNC_DOWNLOAD_FILE: &str = "deltava-pfpxsched.xml";
pub(crate) const DELTAVA_LOGBOOK_FILE: &str = "logbook.json";
pub(crate) const DELTAVA_LOGBOOK_PROFILE_FILE: &str = "dva-logbook-profile.json";
pub(crate) const DELTAVA_LOGBOOK_FALLBACK_FILE: &str = "dva-logbook.json";

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app storage path: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Unable to create app data directory: {error}"))?;

    Ok(app_data_dir)
}

pub(crate) fn app_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app_data_dir(app)
}

pub(crate) fn addon_airport_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_dir(app)?.join(ADDON_AIRPORT_CACHE_FILE))
}

pub(crate) fn main_window_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_dir(app)?.join(MAIN_WINDOW_STATE_FILE))
}

pub(crate) fn ui_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_dir(app)?.join(UI_STATE_FILE))
}

/// Returns the per-user Delta Virtual sync directory under local app data.
pub(crate) fn deltava_sync_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Unable to resolve Delta Virtual sync path: {error}"))?;
    Ok(base_dir.join("deltava-sync"))
}

/// Returns the per-user Delta Virtual webview directory under local app data.
pub(crate) fn deltava_webview_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("Unable to resolve Delta Virtual webview path: {error}"))?;
    Ok(base_dir.join("deltava-webview"))
}

fn is_legacy_download_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            name.starts_with("deltava-pfpxsched-") && name.to_ascii_lowercase().ends_with(".xml")
        })
        .unwrap_or(false)
}

fn prune_legacy_downloads(directory: &Path) {
    if let Ok(entries) = fs::read_dir(directory) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && is_legacy_download_file(&path) {
                let _ = fs::remove_file(path);
            }
        }
    }
}

pub(crate) fn build_download_path(app: &AppHandle) -> Result<PathBuf, String> {
    let download_dir = deltava_sync_dir(app)?.join("downloads");
    fs::create_dir_all(&download_dir)
        .map_err(|error| format!("download_failed: Unable to create sync directory: {error}"))?;
    prune_legacy_downloads(&download_dir);

    if let Ok(current_dir) = std::env::current_dir() {
        prune_legacy_downloads(&current_dir);
    }

    Ok(download_dir.join(DELTAVA_SYNC_DOWNLOAD_FILE))
}

pub(crate) fn build_logbook_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let logbook_dir = deltava_sync_dir(app)?.join("logbook");
    fs::create_dir_all(&logbook_dir)
        .map_err(|error| format!("download_failed: Unable to create logbook storage: {error}"))?;
    Ok(logbook_dir)
}

pub(crate) fn build_logbook_profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(build_logbook_dir(app)?.join(DELTAVA_LOGBOOK_PROFILE_FILE))
}

pub(crate) fn build_accomplishment_eligibility_path(app: &AppHandle) -> Result<PathBuf, String> {
    let accomplishments_dir = deltava_sync_dir(app)?.join("accomplishments");
    fs::create_dir_all(&accomplishments_dir).map_err(|error| {
        format!("download_failed: Unable to create accomplishment storage: {error}")
    })?;
    Ok(accomplishments_dir.join("accomplishment-eligibility.json"))
}

pub(crate) fn resolve_existing_logbook_json_path(app: &AppHandle) -> Option<PathBuf> {
    let logbook_dir = build_logbook_dir(app).ok()?;
    let canonical_path = logbook_dir.join(DELTAVA_LOGBOOK_FILE);
    if canonical_path.is_file() {
        return Some(canonical_path);
    }

    let fallback_path = logbook_dir.join(DELTAVA_LOGBOOK_FALLBACK_FILE);
    if fallback_path.is_file() {
        return Some(fallback_path);
    }

    fs::read_dir(logbook_dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let is_json = path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("json"))
                .unwrap_or(false);
            if !path.is_file() || !is_json {
                return None;
            }

            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

pub(crate) fn build_webview_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = deltava_webview_dir(app)?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("download_failed: Unable to create webview data path: {error}"))?;
    Ok(data_dir)
}
