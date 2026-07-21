use std::{fs, path::PathBuf};

use tauri::AppHandle;

const MAX_SAVED_SCHEDULE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_STANDARD_JSON_BYTES: u64 = 25 * 1024 * 1024;
const MAX_UI_STATE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_SMALL_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Copy)]
enum AppFile {
    SavedSchedule,
    UiState,
    DevToolsState,
    SimbriefSettings,
    GettingStarted,
    DeltavaToursCache,
    DeltavaTourProgress,
    WhatsNewState,
    AppLog,
}

impl AppFile {
    fn parse(key: &str) -> Result<Self, String> {
        match key {
            "savedSchedule" => Ok(Self::SavedSchedule),
            "uiState" => Ok(Self::UiState),
            "devToolsState" => Ok(Self::DevToolsState),
            "simbriefSettings" => Ok(Self::SimbriefSettings),
            "gettingStarted" => Ok(Self::GettingStarted),
            "deltavaToursCache" => Ok(Self::DeltavaToursCache),
            "deltavaTourProgress" => Ok(Self::DeltavaTourProgress),
            "whatsNewState" => Ok(Self::WhatsNewState),
            "appLog" => Ok(Self::AppLog),
            _ => Err("Unsupported app storage key.".to_string()),
        }
    }

    fn file_name(self) -> &'static str {
        match self {
            Self::SavedSchedule => "saved-schedule.json",
            Self::UiState => "ui-state.json",
            Self::DevToolsState => "dev-tools-state.json",
            Self::SimbriefSettings => "simbrief-settings.json",
            Self::GettingStarted => "getting-started.json",
            Self::DeltavaToursCache => "dva-tours-cache.json",
            Self::DeltavaTourProgress => "dva-tour-progress.json",
            Self::WhatsNewState => "whats-new-state.json",
            Self::AppLog => "log.txt",
        }
    }

    fn max_bytes(self) -> u64 {
        match self {
            Self::SavedSchedule => MAX_SAVED_SCHEDULE_BYTES,
            Self::UiState => MAX_UI_STATE_BYTES,
            Self::DeltavaToursCache | Self::DeltavaTourProgress => MAX_STANDARD_JSON_BYTES,
            _ => MAX_SMALL_FILE_BYTES,
        }
    }

    fn requires_json(self) -> bool {
        !matches!(self, Self::WhatsNewState | Self::AppLog)
    }
}

fn path(app: &AppHandle, file: AppFile) -> Result<PathBuf, String> {
    Ok(crate::app::paths::app_storage_dir(app)?.join(file.file_name()))
}

fn validate_size(file: AppFile, byte_count: u64) -> Result<(), String> {
    if byte_count > file.max_bytes() {
        return Err(format!(
            "App storage value exceeded the {} byte limit.",
            file.max_bytes()
        ));
    }
    Ok(())
}

// Reads one allowlisted app-owned file without accepting a filesystem path from the frontend.
pub(crate) fn read(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    let file = AppFile::parse(key)?;
    let path = path(app, file)?;
    if !path.is_file() {
        return Ok(None);
    }
    let metadata =
        fs::metadata(&path).map_err(|_| "Unable to read app storage metadata.".to_string())?;
    validate_size(file, metadata.len())?;
    fs::read_to_string(path)
        .map(Some)
        .map_err(|_| "Unable to read app storage file.".to_string())
}

// Atomically writes one allowlisted app-owned file after size and JSON validation.
pub(crate) fn write(app: &AppHandle, key: &str, contents: &str) -> Result<(), String> {
    let file = AppFile::parse(key)?;
    validate_size(file, contents.len() as u64)?;
    let path = path(app, file)?;
    if file.requires_json() {
        return super::atomic_json::write_atomic_json(&path, contents)
            .map_err(|_| "Unable to write app storage file.".to_string());
    }
    write_text_atomic(&path, contents)
}

fn write_text_atomic(path: &std::path::Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Unable to resolve app storage directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|_| "Unable to create app storage directory.".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Unable to resolve app storage file.".to_string())?;
    let temp_path = path.with_file_name(format!("{file_name}.tmp"));
    let backup_path = path.with_file_name(format!("{file_name}.bak"));
    let _ = fs::remove_file(&temp_path);
    let _ = fs::remove_file(&backup_path);
    fs::write(&temp_path, contents).map_err(|_| "Unable to stage app storage file.".to_string())?;
    let had_previous = path.exists();
    if had_previous {
        fs::rename(path, &backup_path)
            .map_err(|_| "Unable to stage previous app storage file.".to_string())?;
    }
    if fs::rename(&temp_path, path).is_err() {
        if had_previous {
            let _ = fs::rename(&backup_path, path);
        }
        let _ = fs::remove_file(&temp_path);
        return Err("Unable to finalize app storage file.".to_string());
    }
    if had_previous {
        fs::remove_file(backup_path)
            .map_err(|_| "Unable to clean up app storage backup.".to_string())?;
    }
    Ok(())
}

// Moves a malformed allowlisted JSON file aside for recovery and diagnostics.
pub(crate) fn quarantine(app: &AppHandle, key: &str) -> Result<(), String> {
    let file = AppFile::parse(key)?;
    if !file.requires_json() {
        return Err("This app storage file cannot be quarantined.".to_string());
    }
    let path = path(app, file)?;
    if !path.exists() {
        return Ok(());
    }
    let file_name = file.file_name();
    let dot = file_name.rfind('.').unwrap_or(file_name.len());
    let quarantine_name = format!(
        "{}.corrupt.{}{}",
        &file_name[..dot],
        chrono::Utc::now().timestamp_millis(),
        &file_name[dot..]
    );
    fs::rename(
        path,
        crate::app::paths::app_storage_dir(app)?.join(quarantine_name),
    )
    .map_err(|_| "Unable to quarantine malformed app storage file.".to_string())
}

// Creates the allowlisted app log when the user asks to open it.
pub(crate) fn ensure_app_log(app: &AppHandle, header: &str) -> Result<String, String> {
    let file = AppFile::AppLog;
    let path = path(app, file)?;
    if !path.exists() {
        validate_size(file, header.len() as u64)?;
        write_text_atomic(&path, header)?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_keys_and_oversized_values() {
        assert!(AppFile::parse("arbitraryPath").is_err());
        assert!(validate_size(AppFile::DevToolsState, MAX_SMALL_FILE_BYTES + 1).is_err());
    }

    #[test]
    fn fixed_keys_preserve_existing_file_names() {
        assert_eq!(AppFile::SavedSchedule.file_name(), "saved-schedule.json");
        assert_eq!(
            AppFile::DeltavaTourProgress.file_name(),
            "dva-tour-progress.json"
        );
        assert!(AppFile::SimbriefSettings.requires_json());
        assert!(!AppFile::WhatsNewState.requires_json());
    }
}
