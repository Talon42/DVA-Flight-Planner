use serde_json::Value;
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

fn sibling_path(path: &Path, suffix: &str) -> Result<PathBuf, String> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Unable to resolve atomic JSON file name.".to_string())?;
    Ok(path.with_file_name(format!("{file_name}{suffix}")))
}

fn restore_backup(final_path: &Path, backup_path: &Path) -> Result<(), String> {
    if final_path.exists() {
        fs::remove_file(final_path)
            .map_err(|error| format!("Unable to remove failed JSON replacement: {error}"))?;
    }

    if backup_path.exists() {
        fs::rename(backup_path, final_path)
            .map_err(|error| format!("Unable to restore previous JSON file: {error}"))?;
    }

    Ok(())
}

fn verify_json_file(path: &Path, expected: &Value) -> Result<(), String> {
    let mut file =
        File::open(path).map_err(|error| format!("Unable to open replaced JSON file: {error}"))?;
    let mut text = String::new();
    file.read_to_string(&mut text)
        .map_err(|error| format!("Unable to read replaced JSON file: {error}"))?;
    let actual: Value = serde_json::from_str(&text)
        .map_err(|error| format!("Replaced JSON file failed validation: {error}"))?;

    if &actual != expected {
        return Err("Replaced JSON file did not match the requested content.".to_string());
    }

    Ok(())
}

fn atomic_write_json_internal(
    final_path: &Path,
    json: &str,
    simulate_final_rename_failure: bool,
) -> Result<(), String> {
    let parsed: Value = serde_json::from_str(json)
        .map_err(|error| format!("UI state was not valid JSON: {error}"))?;
    let parent = final_path
        .parent()
        .ok_or_else(|| "Unable to resolve atomic JSON parent directory.".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Unable to create JSON storage directory: {error}"))?;

    let temp_path = sibling_path(final_path, ".tmp")?;
    let backup_path = sibling_path(final_path, ".bak")?;
    let _ = fs::remove_file(&temp_path);

    // Recover an interrupted prior replacement before starting a new one.
    if !final_path.exists() && backup_path.exists() {
        fs::rename(&backup_path, final_path)
            .map_err(|error| format!("Unable to recover previous JSON backup: {error}"))?;
    } else if backup_path.exists() {
        fs::remove_file(&backup_path)
            .map_err(|error| format!("Unable to remove stale JSON backup: {error}"))?;
    }

    let write_result = (|| -> Result<(), String> {
        let mut temp_file = File::create(&temp_path)
            .map_err(|error| format!("Unable to create temporary JSON file: {error}"))?;
        temp_file
            .write_all(json.as_bytes())
            .map_err(|error| format!("Unable to write temporary JSON file: {error}"))?;
        temp_file
            .flush()
            .map_err(|error| format!("Unable to flush temporary JSON file: {error}"))?;
        temp_file
            .sync_all()
            .map_err(|error| format!("Unable to sync temporary JSON file: {error}"))?;
        drop(temp_file);

        let had_existing_file = final_path.exists();
        if had_existing_file {
            fs::rename(final_path, &backup_path)
                .map_err(|error| format!("Unable to stage previous JSON file: {error}"))?;
        }

        let rename_result = if simulate_final_rename_failure {
            Err(io::Error::other("simulated final rename failure"))
        } else {
            fs::rename(&temp_path, final_path)
        };

        if let Err(error) = rename_result {
            let restore_result = restore_backup(final_path, &backup_path);
            return Err(match restore_result {
                Ok(()) => format!("Unable to replace JSON file: {error}"),
                Err(restore_error) => {
                    format!("Unable to replace JSON file: {error}; {restore_error}")
                }
            });
        }

        if let Err(error) = verify_json_file(final_path, &parsed) {
            let restore_result = restore_backup(final_path, &backup_path);
            return Err(match restore_result {
                Ok(()) => error,
                Err(restore_error) => format!("{error}; {restore_error}"),
            });
        }

        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|error| format!("Unable to remove JSON backup after success: {error}"))?;
        }

        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

// Writes validated JSON with same-directory temp and backup recovery semantics.
pub(crate) fn write_atomic_json(path: &Path, json: &str) -> Result<(), String> {
    atomic_write_json_internal(path, json, false)
}

#[cfg(test)]
pub(crate) fn write_atomic_json_with_simulated_final_rename_failure(
    path: &Path,
    json: &str,
) -> Result<(), String> {
    atomic_write_json_internal(path, json, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock should be after Unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "dva-flight-planner-atomic-json-{label}-{}-{unique}",
            std::process::id()
        ))
    }

    fn cleanup(directory: &Path) {
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn creates_new_atomic_json_file() {
        let directory = test_directory("create");
        let path = directory.join("ui-state.json");

        write_atomic_json(&path, r#"{"revision":1}"#).expect("new JSON file should be written");

        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"revision":1}"#);
        assert!(!sibling_path(&path, ".tmp").unwrap().exists());
        assert!(!sibling_path(&path, ".bak").unwrap().exists());
        cleanup(&directory);
    }

    #[test]
    fn replaces_existing_valid_file_and_cleans_artifacts() {
        let directory = test_directory("replace");
        let path = directory.join("ui-state.json");
        fs::create_dir_all(&directory).unwrap();
        fs::write(&path, r#"{"revision":1}"#).unwrap();

        write_atomic_json(&path, r#"{"revision":2}"#)
            .expect("existing JSON file should be replaced");

        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"revision":2}"#);
        assert!(!sibling_path(&path, ".tmp").unwrap().exists());
        assert!(!sibling_path(&path, ".bak").unwrap().exists());
        cleanup(&directory);
    }

    #[test]
    fn invalid_json_preserves_existing_file() {
        let directory = test_directory("invalid");
        let path = directory.join("ui-state.json");
        fs::create_dir_all(&directory).unwrap();
        fs::write(&path, r#"{"revision":1}"#).unwrap();

        assert!(write_atomic_json(&path, "not-json").is_err());

        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"revision":1}"#);
        assert!(!sibling_path(&path, ".tmp").unwrap().exists());
        assert!(!sibling_path(&path, ".bak").unwrap().exists());
        cleanup(&directory);
    }

    #[test]
    fn final_rename_failure_restores_backup_and_cleans_temp() {
        let directory = test_directory("restore");
        let path = directory.join("ui-state.json");
        fs::create_dir_all(&directory).unwrap();
        fs::write(&path, r#"{"revision":1}"#).unwrap();

        assert!(atomic_write_json_internal(&path, r#"{"revision":2}"#, true).is_err());

        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"revision":1}"#);
        assert!(!sibling_path(&path, ".tmp").unwrap().exists());
        assert!(!sibling_path(&path, ".bak").unwrap().exists());
        cleanup(&directory);
    }
}
