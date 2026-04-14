use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

use crate::APP_STORAGE_DIR;

#[cfg(windows)]
use keyring::{Entry, Error as KeyringError};

const DVA_AUTH_FILE: &str = "deltava-auth.json";
const DVA_AUTH_SERVICE: &str = "flight-planner:deltava-login";
const DVA_AUTH_USERNAME: &str = "password";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaVirtualAuthSettings {
    pub first_name: String,
    pub last_name: String,
    #[serde(default)]
    pub has_password: bool,
}

#[derive(Clone, Debug)]
pub struct DeltaVirtualAuthContext {
    pub settings: DeltaVirtualAuthSettings,
    pub password: Option<String>,
}

fn normalize_text(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_settings(mut settings: DeltaVirtualAuthSettings) -> DeltaVirtualAuthSettings {
    settings.first_name = normalize_text(&settings.first_name);
    settings.last_name = normalize_text(&settings.last_name);
    settings
}

fn auth_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve Delta Virtual auth storage: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Unable to create app data directory: {error}"))?;

    Ok(app_data_dir.join(APP_STORAGE_DIR).join(DVA_AUTH_FILE))
}

fn ensure_auth_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = auth_settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create Delta Virtual auth storage: {error}"))?;
    }
    Ok(path)
}

#[cfg(windows)]
fn auth_entry() -> Result<Entry, String> {
    Entry::new(DVA_AUTH_SERVICE, DVA_AUTH_USERNAME)
        .map_err(|error| format!("Unable to access Delta Virtual secure storage: {error}"))
}

#[cfg(windows)]
fn read_password_from_credential_manager() -> Result<Option<String>, String> {
    match auth_entry()?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("Unable to read Delta Virtual password: {error}")),
    }
}

#[cfg(not(windows))]
fn read_password_from_credential_manager() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(windows)]
pub fn save_password_to_credential_manager(password: &str) -> Result<(), String> {
    if password.trim().is_empty() {
        return clear_password_from_credential_manager();
    }

    auth_entry()?
        .set_password(password)
        .map_err(|error| format!("Unable to save Delta Virtual password: {error}"))
}

#[cfg(not(windows))]
pub fn save_password_to_credential_manager(_password: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn clear_password_from_credential_manager() -> Result<(), String> {
    match auth_entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("Unable to clear Delta Virtual password: {error}")),
    }
}

#[cfg(not(windows))]
pub fn clear_password_from_credential_manager() -> Result<(), String> {
    Ok(())
}

fn write_auth_settings_file(app: &AppHandle, settings: &DeltaVirtualAuthSettings) -> Result<(), String> {
    let path = ensure_auth_storage_dir(app)?;
    let serialized = serde_json::to_string(settings)
        .map_err(|error| format!("Unable to serialize Delta Virtual auth settings: {error}"))?;

    fs::write(&path, serialized)
        .map_err(|error| format!("Unable to save Delta Virtual auth settings: {error}"))
}

fn read_auth_settings_file(app: &AppHandle) -> Result<Option<DeltaVirtualAuthSettings>, String> {
    let path = auth_settings_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read Delta Virtual auth settings: {error}"))?;
    let settings = serde_json::from_str::<DeltaVirtualAuthSettings>(&text)
        .map_err(|error| format!("Unable to parse Delta Virtual auth settings: {error}"))?;
    Ok(Some(normalize_settings(settings)))
}

fn refresh_password_state(settings: &mut DeltaVirtualAuthSettings) -> Result<Option<String>, String> {
    let password = read_password_from_credential_manager()?;
    settings.has_password = password.is_some();
    Ok(password)
}

pub fn read_auth_context_internal(app: &AppHandle) -> Result<DeltaVirtualAuthContext, String> {
    let mut settings = read_auth_settings_file(app)?.unwrap_or_default();
    let password = refresh_password_state(&mut settings)?;

    Ok(DeltaVirtualAuthContext {
        settings,
        password,
    })
}

pub fn read_auth_settings_internal(app: &AppHandle) -> Result<DeltaVirtualAuthSettings, String> {
    let mut settings = read_auth_settings_file(app)?.unwrap_or_default();
    let _ = refresh_password_state(&mut settings)?;
    Ok(settings)
}

pub fn save_auth_settings_internal(
    app: &AppHandle,
    first_name: String,
    last_name: String,
    password: Option<String>,
) -> Result<DeltaVirtualAuthSettings, String> {
    let mut settings = DeltaVirtualAuthSettings {
        first_name: normalize_text(&first_name),
        last_name: normalize_text(&last_name),
        has_password: false,
    };

    let password = password.filter(|value| !value.is_empty());
    if let Some(password) = password.as_deref() {
        save_password_to_credential_manager(password)?;
    }

    settings.has_password = read_password_from_credential_manager()?.is_some();
    write_auth_settings_file(app, &settings)?;
    Ok(settings)
}

pub fn clear_auth_settings_internal(app: &AppHandle) -> Result<(), String> {
    let path = auth_settings_path(app)?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Unable to remove Delta Virtual auth settings: {error}"))?;
    }

    let _ = clear_password_from_credential_manager();
    Ok(())
}

#[tauri::command]
pub fn read_deltava_auth_settings(app: AppHandle) -> Result<DeltaVirtualAuthSettings, String> {
    read_auth_settings_internal(&app)
}

#[tauri::command]
pub fn save_deltava_auth_settings(
    app: AppHandle,
    first_name: String,
    last_name: String,
    password: Option<String>,
) -> Result<DeltaVirtualAuthSettings, String> {
    save_auth_settings_internal(&app, first_name, last_name, password)
}

#[tauri::command]
pub fn clear_deltava_auth_settings(app: AppHandle) -> Result<(), String> {
    clear_auth_settings_internal(&app)
}
