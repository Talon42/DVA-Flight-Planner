use std::{fs, io::Write, path::PathBuf, sync::OnceLock};

use chrono::{SecondsFormat, Utc};
use tauri::{AppHandle, Manager};

const APP_LOG_FILE: &str = "log.txt";
const APP_LOG_MAX_BYTES: u64 = 262_144;
static DELTAVA_SYNC_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

pub(crate) fn resolve_app_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app log path: {error}"))?;
    fs::create_dir_all(&base_dir)
        .map_err(|error| format!("Unable to create app log directory: {error}"))?;
    Ok(base_dir.join(APP_LOG_FILE))
}

pub(crate) fn initialize_sync_log_path(app: &AppHandle) -> Option<PathBuf> {
    if let Some(existing) = DELTAVA_SYNC_LOG_PATH.get() {
        return Some(existing.clone());
    }

    let resolved = resolve_app_log_path(app).ok();

    if let Some(path) = resolved.clone() {
        let _ = DELTAVA_SYNC_LOG_PATH.set(path);
    }

    resolved
}

pub(crate) fn append_sync_log(message: &str) {
    let now = iso_now_utc();
    let line = format!("[{now}] [DVA Sync] {message}\n");

    let Some(log_path) = DELTAVA_SYNC_LOG_PATH.get().cloned() else {
        return;
    };

    if fs::metadata(&log_path)
        .map(|metadata| metadata.len() > APP_LOG_MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = fs::remove_file(&log_path);
    }

    if let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let _ = file.write_all(line.as_bytes());
    }
}

pub(crate) fn iso_now_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
