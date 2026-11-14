use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
};

use chrono::{SecondsFormat, Utc};
use tauri::{AppHandle, Manager};

const APP_LOG_FILE: &str = "log.txt";
const APP_LOG_MAX_BYTES: u64 = 1024 * 1024;
static DELTAVA_SYNC_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

// All Rust services and IPC writes share this lock; the persistence gate alone only covers IPC.
static LOG_WRITER: Mutex<()> = Mutex::new(());
static LOG_FAILURE_REPORTED: AtomicBool = AtomicBool::new(false);

fn report_log_failure() {
    if !LOG_FAILURE_REPORTED.swap(true, Ordering::Relaxed) {
        eprintln!("[Logging] Unable to write the app log; further write failures suppressed.");
    }
}

fn redact_log_text(text: &str) -> String {
    static RULES: OnceLock<Vec<(regex::Regex, &'static str)>> = OnceLock::new();
    let rules = RULES.get_or_init(|| vec![
        (regex::Regex::new(r#"(?i)(https?://)[^/@\s"'<>]+@"#).expect("URL credentials regex"), "$1[REDACTED]@"),
        (regex::Regex::new(r#"(?i)(https?://[^\s?\#"'<>]+)[?\#][^\s"'<>]*"#).expect("URL query regex"), "$1?[REDACTED]"),
        (regex::Regex::new(r"(?i)\b(authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+").expect("header regex"), "$1=[REDACTED]"),
        (regex::Regex::new(r"(?i)\bBearer\s+[A-Za-z0-9._~+/\-]+=*").expect("bearer regex"), "Bearer [REDACTED]"),
        (regex::Regex::new(r#"(?i)(["']?(?:password|passwd|token|access_token|refresh_token|api[_-]?key|secret|credential)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}]+)"#).expect("secret regex"), "$1[REDACTED]"),
    ]);
    rules
        .iter()
        .fold(text.to_string(), |value, (pattern, replacement)| {
            pattern.replace_all(&value, *replacement).into_owned()
        })
}

fn native_level(message: &str) -> &'static str {
    if message.contains("level=DEBUG") {
        "DEBUG"
    } else if message.contains("failed") || message.contains("error=") || message.contains("panic")
    {
        "ERROR"
    } else if message.contains("warning")
        || message.contains("invalid")
        || message.contains("timeout")
    {
        "WARN"
    } else {
        "INFO"
    }
}

// The panic hook avoids blocking on the writer, including panics originating inside logging.
pub(crate) fn install_panic_logging() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let (Some(path), Ok(_guard)) = (DELTAVA_SYNC_LOG_PATH.get(), LOG_WRITER.try_lock()) {
            if let Some(line) = build_app_log_line("Native", &format!("panic {info}")) {
                if append_bounded_log_line_unlocked(path, &line, APP_LOG_MAX_BYTES).is_err() {
                    report_log_failure();
                }
            }
        } else {
            report_log_failure();
        }
        previous(info);
    }));
}

pub(crate) fn append_native_log(message: &str) {
    if let Some(path) = DELTAVA_SYNC_LOG_PATH.get() {
        if append_app_log_to_path(path, "Native", message).is_err() {
            report_log_failure();
        }
    } else {
        report_log_failure();
    }
}

fn log_staging_path(log_path: &Path) -> PathBuf {
    let mut name = log_path.as_os_str().to_os_string();
    name.push(".tmp");
    PathBuf::from(name)
}

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

fn build_app_log_line(category: &str, message: &str) -> Option<String> {
    let normalized_category = category.trim();
    let normalized_message = message
        .trim_end_matches(['\r', '\n'])
        .replace(['\r', '\n'], " ");

    if normalized_category.is_empty() || normalized_message.is_empty() {
        return None;
    }

    Some(format!(
        "[{}] [{}] [{}] {}\n",
        iso_now_utc(),
        native_level(&normalized_message),
        normalized_category,
        normalized_message
    ))
}

pub(crate) fn append_bounded_log_line(
    log_path: &Path,
    line: &str,
    max_bytes: u64,
) -> Result<(), io::Error> {
    let _guard = LOG_WRITER
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    append_bounded_log_line_unlocked(log_path, line, max_bytes)
}

fn append_bounded_log_line_unlocked(
    log_path: &Path,
    line: &str,
    max_bytes: u64,
) -> Result<(), io::Error> {
    let normalized_line = normalize_log_line(&redact_log_text(line));
    if normalized_line.is_empty() {
        return Ok(());
    }

    if max_bytes == 0 {
        return fs::write(log_path, "");
    }

    let existing_size = match fs::metadata(log_path) {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => 0,
        Err(error) => return Err(error),
    };
    let incoming = format!("{normalized_line}\n");
    if existing_size.saturating_add(incoming.len() as u64) <= max_bytes {
        // Appending avoids rewriting history on every event and limits damage from interruption.
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)?;
        return file.write_all(incoming.as_bytes());
    }
    let mut combined = if existing_size > 0 {
        fs::read(log_path)?
    } else {
        Vec::new()
    };
    combined.extend_from_slice(incoming.as_bytes());
    let limit = usize::try_from(max_bytes).unwrap_or(usize::MAX);
    let trimmed = trim_log_bytes_to_limit(&combined, limit);
    // Skip a partial UTF-8 character rather than expanding replacement characters beyond the limit.
    let mut start = 0;
    while start < trimmed.len() && std::str::from_utf8(&trimmed[start..]).is_err() {
        start += 1;
    }
    let temporary = log_staging_path(log_path);
    let result = (|| {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&trimmed[start..])?;
        file.sync_all()?;
        drop(file);
        // Same-directory replacement preserves the previous log if staging fails.
        fs::rename(&temporary, log_path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn append_app_log_to_path(log_path: &Path, category: &str, message: &str) -> Result<(), io::Error> {
    let Some(line) = build_app_log_line(category, message) else {
        return Ok(());
    };

    append_bounded_log_line(log_path, &line, APP_LOG_MAX_BYTES)
}

fn append_app_log_text_to_path_with_limit(
    log_path: &Path,
    text: &str,
    max_bytes: u64,
) -> Result<(), io::Error> {
    let normalized = text.trim_end_matches(['\r', '\n']);
    if normalized.trim().is_empty() {
        return Ok(());
    }

    let block = format!("{normalized}\n");
    append_bounded_log_line(log_path, &block, max_bytes)
}

fn append_app_log_text_to_path(log_path: &Path, text: &str) -> Result<(), io::Error> {
    append_app_log_text_to_path_with_limit(log_path, text, APP_LOG_MAX_BYTES)
}

pub(crate) fn append_app_log(app: &AppHandle, category: &str, message: &str) {
    let Ok(log_path) = resolve_app_log_path(app) else {
        report_log_failure();
        return;
    };

    if append_app_log_to_path(&log_path, category, message).is_err() {
        report_log_failure();
    }
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

    let resolved = resolve_app_log_path(app)
        .map_err(|_| report_log_failure())
        .ok();

    if let Some(path) = resolved.clone() {
        let _ = DELTAVA_SYNC_LOG_PATH.set(path);
    }

    resolved
}

pub(crate) fn append_sync_log(message: &str) {
    let Some(log_path) = DELTAVA_SYNC_LOG_PATH.get().cloned() else {
        return;
    };

    if append_app_log_to_path(&log_path, "DVA Sync", message).is_err() {
        report_log_failure();
    }
}

pub(crate) fn append_sync_log_debug(debug_enabled: bool, message: &str) {
    if !debug_enabled {
        return;
    }

    append_sync_log(&format!("level=DEBUG {message}"));
}

pub(crate) fn append_app_log_text(app: &AppHandle, text: &str) -> Result<(), String> {
    let log_path = resolve_app_log_path(app)?;
    append_app_log_text_to_path(&log_path, text)
        .map_err(|error| format!("Unable to append app log: {error}"))
}

pub(crate) fn iso_now_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

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
    fn shared_redaction_cases_cover_frontend_and_rust_free_text() {
        let cases: serde_json::Value = serde_json::from_str(include_str!(
            "../../../test-fixtures/logging/redaction-cases.json"
        ))
        .unwrap();
        for case in cases.as_array().unwrap() {
            let output = redact_log_text(case["input"].as_str().unwrap());
            assert!(output.contains("[REDACTED]"));
            for secret in case["secrets"].as_array().unwrap() {
                assert!(!output.contains(secret.as_str().unwrap()));
            }
        }
    }

    #[test]
    fn bounded_retention_keeps_valid_utf8_within_the_byte_limit() {
        let path = temp_log_path("unicode");
        append_bounded_log_line(&path, &"?".repeat(40), 20).unwrap();
        let bytes = fs::read(&path).unwrap();
        assert!(bytes.len() <= 20);
        assert!(std::str::from_utf8(&bytes).unwrap().ends_with('\n'));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn concurrent_frontend_and_native_writes_preserve_every_entry() {
        let path = temp_log_path("concurrent");
        std::thread::scope(|scope| {
            for worker in 0..8 {
                let path = &path;
                scope.spawn(move || {
                    for entry in 0..40 {
                        let text = format!("worker={worker} entry={entry}");
                        if worker % 2 == 0 {
                            append_app_log_to_path(path, "Native", &text).expect("native write");
                        } else {
                            append_app_log_text_to_path(path, &text).expect("frontend write");
                        }
                    }
                });
            }
        });
        let text = read_log_text(&path);
        assert_eq!(text.lines().count(), 320);
        for worker in 0..8 {
            for entry in 0..40 {
                assert!(text.contains(&format!("worker={worker} entry={entry}\n")));
            }
        }
        let _ = fs::remove_file(path);
    }

    #[test]
    fn failed_retention_preserves_previous_history_and_reports_failure() {
        let path = temp_log_path("failed-retention");
        fs::write(&path, "history\n").unwrap();
        let temporary = log_staging_path(&path);
        fs::create_dir(&temporary).unwrap();
        assert!(append_bounded_log_line(&path, "new entry", 10).is_err());
        assert_eq!(read_log_text(&path), "history\n");
        let _ = fs::remove_dir(temporary);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn redacts_free_text_secrets_before_native_or_frontend_persistence() {
        let path = temp_log_path("redaction");
        append_app_log_to_path(
            &path,
            "Native",
            "failed token=private-token url=https://user:private-pass@host/path?key=private-query",
        )
        .unwrap();
        append_app_log_text_to_path(&path, "Authorization: Bearer private-auth").unwrap();
        let text = read_log_text(&path);
        assert!(!text.contains("private-"));
        assert!(text.contains("[ERROR] [Native]"));
        let _ = fs::remove_file(path);
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
        assert!(contents
            .trim_end_matches('\n')
            .chars()
            .all(|character| character == 'X'));

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

    #[test]
    fn append_app_log_to_path_writes_category_formatted_lines() {
        let path = temp_log_path("category-log");

        append_app_log_to_path(&path, "AddonScan", "scan-start").expect("append");

        let contents = read_log_text(&path);
        assert!(contents.starts_with('['));
        assert!(contents.contains("] [AddonScan] scan-start\n"));

        let _ = fs::remove_file(path);
    }

    #[test]
    fn append_app_log_to_path_ignores_empty_category() {
        let path = temp_log_path("empty-category");

        append_app_log_to_path(&path, "   ", "scan-start").expect("append");

        assert!(!path.exists());
    }

    #[test]
    fn append_app_log_to_path_ignores_empty_message() {
        let path = temp_log_path("empty-message");

        append_app_log_to_path(&path, "AddonScan", "").expect("append");

        assert!(!path.exists());
    }

    #[test]
    fn append_app_log_text_to_path_writes_multiline_blocks() {
        let path = temp_log_path("multiline-text");

        append_app_log_text_to_path(&path, "first line\nsecond line").expect("append");

        assert_eq!(read_log_text(&path), "first line\nsecond line\n");

        let _ = fs::remove_file(path);
    }

    #[test]
    fn append_app_log_text_to_path_ignores_empty_text() {
        let path = temp_log_path("empty-text");

        append_app_log_text_to_path(&path, "   \n").expect("append");

        assert!(!path.exists());
    }

    #[test]
    fn append_app_log_text_to_path_trims_oldest_content_over_limit() {
        let path = temp_log_path("text-trim");

        append_app_log_text_to_path_with_limit(&path, "A", 4).expect("append 1");
        append_app_log_text_to_path_with_limit(&path, "B", 4).expect("append 2");
        append_app_log_text_to_path_with_limit(&path, "C", 4).expect("append 3");

        let contents = read_log_text(&path);
        assert_eq!(contents, "B\nC\n");

        let _ = fs::remove_file(path);
    }
}
