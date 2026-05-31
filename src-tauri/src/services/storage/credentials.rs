#[cfg(windows)]
use keyring::{Entry, Error as KeyringError};

const DVA_AUTH_SERVICE: &str = "flight-planner:deltava-login";
const DVA_AUTH_USERNAME: &str = "password";

#[cfg(windows)]
fn auth_entry() -> Result<Entry, String> {
    Entry::new(DVA_AUTH_SERVICE, DVA_AUTH_USERNAME)
        .map_err(|error| format!("Unable to access Delta Virtual secure storage: {error}"))
}

#[cfg(windows)]
pub(crate) fn read_password_from_credential_manager() -> Result<Option<String>, String> {
    match auth_entry()?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(format!("Unable to read Delta Virtual password: {error}")),
    }
}

#[cfg(not(windows))]
pub(crate) fn read_password_from_credential_manager() -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(windows)]
pub(crate) fn save_password_to_credential_manager(password: &str) -> Result<(), String> {
    if password.trim().is_empty() {
        return clear_password_from_credential_manager();
    }

    auth_entry()?
        .set_password(password)
        .map_err(|error| format!("Unable to save Delta Virtual password: {error}"))
}

#[cfg(not(windows))]
pub(crate) fn save_password_to_credential_manager(_password: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub(crate) fn clear_password_from_credential_manager() -> Result<(), String> {
    match auth_entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(format!("Unable to clear Delta Virtual password: {error}")),
    }
}

#[cfg(not(windows))]
pub(crate) fn clear_password_from_credential_manager() -> Result<(), String> {
    Ok(())
}
