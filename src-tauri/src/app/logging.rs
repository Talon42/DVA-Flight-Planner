use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::OnceLock,
};

use chrono::{SecondsFormat, Utc};
use tauri::{AppHandle, Manager};

const APP_LOG_FILE: &str = "log.txt";
const APP_LOG_MAX_BYTES: u64 = 262_144;
static DELTAVA_SYNC_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn normalize_log_line(line: &str) -> String {
    String::from(line.trim_end_matches(['\r', '\n']))
}

fn trim_log_bytes_to_limit(combined: &[u8], max_bytes: usize) -> Vec<u8> {
    if combined.len() <= max_bytes {
        return combined.to_vec();
    }

    let start = combined.len().saturating_sub(max_bytes);
    let slice = &combined[start..];

    if start > 0
        && combined
            .get(start - 1)
            .map(|byte| *byte != b'\n')
            .unwrap_or(false)
    {
        if let Some(newline_index) = slice.iter().position(|byte| *byte == b'\n') {
            let candidate = slice[newline_index + 1..].to_vec();
            if !candidate.is_empty() {
                return candidate;
            }
        }
    }

    slice.to_vec()
}

pub(crate) fn append_bounded_log_line(
    log_path: &Path,
    line: &str,
    max_bytes: u64,
) -> Result<(), io::Error> {
    let normalized_line = normalize_log_line(line);
    if normalized_line.is_empty() {
        return Ok(());
    }

    if max_bytes == 0 {
        return fs::write(log_path, "");
    }

    let mut combined = match fs::read(log_path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(error),
    };

    combined.extend_from_slice(normalized_line.as_bytes());
    combined.push(b'\n');

    if (combined.len() as u64) <= max_bytes {
        return fs::write(log_path, combined);
    }

    let max_bytes = if max_bytes > usize::MAX as u64 {
        usize::MAX
    } else {
        max_bytes as usize
    };
    let trimmed = trim_log_bytes_to_limit(&combined, max_bytes);
    let trimmed_text = String::from_utf8_lossy(&trimmed).into_owned();
    fs::write(log_path, trimmed_text)
}

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

    if let Err(_error) = append_bounded_log_line(&log_path, &line, APP_LOG_MAX_BYTES) {
        if let Ok(mut file) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
        {
            let _ = file.write_all(line.as_bytes());
        }
    }
}

pub(crate) fn iso_now_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

    fn temp_log_path(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("flight-planner-{label}-{unique}.log"));
        let _ = fs::remove_file(&path);
        path
    }

    fn read_log_text(path: &Path) -> String {
        fs::read_to_string(path).expect("read log")
    }

    #[test]
    fn append_bounded_log_line_appends_under_limit() {
        let path = temp_log_path("under-limit");

        append_bounded_log_line(&path, "first entry", 128).expect("append");

        assert_eq!(read_log_text(&path), "first entry\n");

        let _ = fs::remove_file(path);
    }

    #[test]
    fn append_bounded_log_line_trims_oldest_lines_over_limit() {
        let path = temp_log_path("trim-oldest");

        append_bounded_log_line(&path, "A1", 8).expect("append 1");
        append_bounded_log_line(&path, "B2", 8).expect("append 2");
        append_bounded_log_line(&path, "C3", 8).expect("append 3");

        assert_eq!(read_log_text(&path), "B2\nC3\n");

        let _ = fs::remove_file(path);
    }

    #[test]
    fn append_bounded_log_line_preserves_newest_line() {
        let path = temp_log_path("preserve-newest");

        append_bounded_log_line(&path, "one", 8).expect("append 1");
        append_bounded_log_line(&path, "two", 8).expect("append 2");
        append_bounded_log_line(&path, "three", 8).expect("append 3");

        let contents = read_log_text(&path);
        assert!(contents.contains("three"));
        assert!(contents.ends_with('\n'));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn append_bounded_log_line_handles_single_line_larger_than_limit() {
        let path = temp_log_path("single-line-large");
        let large_line = "X".repeat(64);

        append_bounded_log_line(&path, &large_line, 20).expect("append");

        let contents = read_log_text(&path);
        assert!(contents.len() <= 20);
        assert!(contents.ends_with('\n'));
        assert!(contents.trim_end_matches('\n').chars().all(|character| character == 'X'));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn append_bounded_log_line_prefers_line_boundary_when_trimming() {
        let path = temp_log_path("line-boundary");

        append_bounded_log_line(&path, "alphaalphaalpha", 18).expect("append 1");
        append_bounded_log_line(&path, "beta", 18).expect("append 2");
        append_bounded_log_line(&path, "gamma", 18).expect("append 3");

        let contents = read_log_text(&path);
        assert_eq!(contents, "beta\ngamma\n");

        let _ = fs::remove_file(path);
    }
}
