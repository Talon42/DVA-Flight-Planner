use crate::app::paths::addon_airport_cache_path;
use crate::iso_now_utc;
use serde_json::Value;
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

#[derive(Default)]
struct AddonAirportScanSummary {
    content_history_files_scanned: usize,
    manifest_files_scanned: usize,
    manifest_fallbacks_used: usize,
    manifest_airport_entries_found: usize,
    airport_entries_found: usize,
    duplicate_airport_entries: usize,
    warnings: Vec<String>,
    scan_details: Vec<crate::AddonAirportScanDetail>,
}

#[derive(Default)]
struct FileScanOutcome {
    airport_entries_found: usize,
}

enum AddonAirportScanSource {
    ContentHistory,
    Manifest,
}

impl AddonAirportScanSource {
    fn status(&self, suffix: &str) -> String {
        match self {
            Self::ContentHistory => suffix.to_string(),
            Self::Manifest => format!("manifest-{suffix}"),
        }
    }

    fn no_airport_message(&self) -> &'static str {
        match self {
            Self::ContentHistory => "No airport ICAO values were extracted from this file.",
            Self::Manifest => "No ICAO token was extracted from manifest title.",
        }
    }

    fn no_airport_status(&self) -> &'static str {
        match self {
            Self::ContentHistory => "no-airport-content",
            Self::Manifest => "manifest-no-icao",
        }
    }
}

pub(crate) fn normalize_addon_roots(roots: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    let mut seen = BTreeSet::new();

    for root in roots {
        let trimmed = root.trim();
        if trimmed.is_empty() {
            continue;
        }

        let path = PathBuf::from(trimmed);
        let display = path.to_string_lossy().trim().to_string();
        if display.is_empty() {
            continue;
        }

        let dedupe_key = display.to_ascii_lowercase();
        if seen.insert(dedupe_key) {
            normalized.push(display);
        }
    }

    normalized
}

pub(crate) fn default_addon_airport_cache() -> crate::AddonAirportCache {
    crate::AddonAirportCache {
        status: "idle".into(),
        ..crate::AddonAirportCache::default()
    }
}

pub(crate) fn read_addon_airport_cache_from_disk(
    app: &AppHandle,
) -> Result<crate::AddonAirportCache, String> {
    let cache_path = addon_airport_cache_path(app)?;
    if !cache_path.exists() {
        return Ok(default_addon_airport_cache());
    }

    let text = fs::read_to_string(&cache_path)
        .map_err(|error| format!("Unable to read addon airport cache: {error}"))?;
    let mut cache: crate::AddonAirportCache = serde_json::from_str(&text)
        .map_err(|error| format!("Unable to parse addon airport cache: {error}"))?;

    cache.roots = normalize_addon_roots(cache.roots);
    cache.airports.sort();
    cache.airports.dedup();

    if cache.status.trim().is_empty() {
        cache.status = "idle".into();
    }

    Ok(cache)
}

pub(crate) fn write_addon_airport_cache_to_disk(
    app: &AppHandle,
    cache: &crate::AddonAirportCache,
) -> Result<(), String> {
    let cache_path = addon_airport_cache_path(app)?;
    let text = serde_json::to_string_pretty(cache)
        .map_err(|error| format!("Unable to serialize addon airport cache: {error}"))?;
    fs::write(cache_path, text)
        .map_err(|error| format!("Unable to write addon airport cache: {error}"))
}

fn summarize_warnings(warnings: &[String]) -> Option<String> {
    if warnings.is_empty() {
        return None;
    }

    let preview = warnings
        .iter()
        .take(3)
        .cloned()
        .collect::<Vec<_>>()
        .join("; ");
    let suffix = if warnings.len() > 3 {
        format!(" (+{} more)", warnings.len() - 3)
    } else {
        String::new()
    };

    Some(format!("{preview}{suffix}"))
}

pub(crate) fn build_idle_addon_airport_cache(roots: Vec<String>) -> crate::AddonAirportCache {
    crate::AddonAirportCache {
        roots,
        airports: Vec::new(),
        last_scanned_at: None,
        content_history_files_scanned: 0,
        manifest_files_scanned: 0,
        manifest_fallbacks_used: 0,
        manifest_airport_entries_found: 0,
        airport_entries_found: 0,
        duplicate_airport_entries: 0,
        status: "idle".into(),
        last_error: None,
        warnings: Vec::new(),
        scan_details: Vec::new(),
    }
}

fn collect_airports_from_json(value: &Value, airports: &mut Vec<String>) {
    match value {
        Value::Array(values) => {
            for entry in values {
                collect_airports_from_json(entry, airports);
            }
        }
        Value::Object(map) => {
            let is_airport = map
                .get("type")
                .and_then(Value::as_str)
                .map(|value| value.eq_ignore_ascii_case("Airport"))
                .unwrap_or(false);

            if is_airport {
                let content_value = map
                    .get("Content")
                    .or_else(|| map.get("content"))
                    .and_then(Value::as_str);

                if let Some(content) = content_value {
                    let normalized = content.trim().to_ascii_uppercase();
                    if !normalized.is_empty() {
                        airports.push(normalized);
                    }
                }
            }

            for child in map.values() {
                collect_airports_from_json(child, airports);
            }
        }
        _ => {}
    }
}

// Extracts unique ICAO tokens from a manifest title in the order they appear.
fn extract_icao_tokens_from_manifest_title(title: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut seen = BTreeSet::new();

    for token in title
        .to_ascii_uppercase()
        .split(|character: char| !character.is_ascii_alphabetic())
    {
        if token.len() == 4
            && token
                .chars()
                .all(|character| character.is_ascii_uppercase())
        {
            let token = token.to_string();
            if seen.insert(token.clone()) {
                tokens.push(token);
            }
        }
    }

    tokens
}

fn collect_airports_from_manifest_json(value: &Value) -> Vec<String> {
    value
        .get("title")
        .and_then(Value::as_str)
        .map(extract_icao_tokens_from_manifest_title)
        .unwrap_or_default()
}

fn apply_file_scan_result(
    source: AddonAirportScanSource,
    path: &Path,
    airports: &mut BTreeSet<String>,
    summary: &mut AddonAirportScanSummary,
    file_airports: Vec<String>,
) -> FileScanOutcome {
    let path_display = path.display().to_string();
    let mut cached_airports = Vec::new();
    let mut duplicate_airports = Vec::new();

    summary.airport_entries_found += file_airports.len();
    if matches!(source, AddonAirportScanSource::Manifest) {
        summary.manifest_airport_entries_found += file_airports.len();
    }

    for airport in file_airports {
        if airports.insert(airport.clone()) {
            cached_airports.push(airport);
        } else {
            duplicate_airports.push(airport);
        }
    }

    summary.duplicate_airport_entries += duplicate_airports.len();

    let status = if !cached_airports.is_empty() && duplicate_airports.is_empty() {
        source.status("cached")
    } else if !cached_airports.is_empty() && !duplicate_airports.is_empty() {
        source.status("partial-duplicate")
    } else if cached_airports.is_empty() && !duplicate_airports.is_empty() {
        source.status("duplicate-only")
    } else {
        source.no_airport_status().to_string()
    };

    let message = if cached_airports.is_empty() && duplicate_airports.is_empty() {
        Some(source.no_airport_message().to_string())
    } else {
        None
    };

    summary.scan_details.push(crate::AddonAirportScanDetail {
        path: path_display,
        status,
        airports: cached_airports.clone(),
        duplicate_airports: duplicate_airports.clone(),
        message,
    });

    FileScanOutcome {
        airport_entries_found: cached_airports.len() + duplicate_airports.len(),
    }
}

fn scan_content_history_file(
    path: &Path,
    airports: &mut BTreeSet<String>,
    summary: &mut AddonAirportScanSummary,
) -> FileScanOutcome {
    summary.content_history_files_scanned += 1;

    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(json) => {
                let mut file_airports = Vec::new();
                collect_airports_from_json(&json, &mut file_airports);
                apply_file_scan_result(
                    AddonAirportScanSource::ContentHistory,
                    path,
                    airports,
                    summary,
                    file_airports,
                )
            }
            Err(error) => {
                let warning = format!("Skipped malformed JSON at {} ({error})", path.display());
                summary.warnings.push(warning.clone());
                summary.scan_details.push(crate::AddonAirportScanDetail {
                    path: path.display().to_string(),
                    status: AddonAirportScanSource::ContentHistory.status("malformed-json"),
                    airports: Vec::new(),
                    duplicate_airports: Vec::new(),
                    message: Some(warning),
                });
                FileScanOutcome::default()
            }
        },
        Err(error) => {
            let warning = format!("Skipped unreadable file at {} ({error})", path.display());
            summary.warnings.push(warning.clone());
            summary.scan_details.push(crate::AddonAirportScanDetail {
                path: path.display().to_string(),
                status: AddonAirportScanSource::ContentHistory.status("unreadable-file"),
                airports: Vec::new(),
                duplicate_airports: Vec::new(),
                message: Some(warning),
            });
            FileScanOutcome::default()
        }
    }
}

fn scan_manifest_file(
    path: &Path,
    airports: &mut BTreeSet<String>,
    summary: &mut AddonAirportScanSummary,
) -> FileScanOutcome {
    summary.manifest_files_scanned += 1;

    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(json) => {
                let file_airports = collect_airports_from_manifest_json(&json);
                apply_file_scan_result(
                    AddonAirportScanSource::Manifest,
                    path,
                    airports,
                    summary,
                    file_airports,
                )
            }
            Err(error) => {
                let warning = format!("Skipped malformed JSON at {} ({error})", path.display());
                summary.warnings.push(warning.clone());
                summary.scan_details.push(crate::AddonAirportScanDetail {
                    path: path.display().to_string(),
                    status: AddonAirportScanSource::Manifest.status("malformed-json"),
                    airports: Vec::new(),
                    duplicate_airports: Vec::new(),
                    message: Some(warning),
                });
                FileScanOutcome::default()
            }
        },
        Err(error) => {
            let warning = format!("Skipped unreadable file at {} ({error})", path.display());
            summary.warnings.push(warning.clone());
            summary.scan_details.push(crate::AddonAirportScanDetail {
                path: path.display().to_string(),
                status: AddonAirportScanSource::Manifest.status("unreadable-file"),
                airports: Vec::new(),
                duplicate_airports: Vec::new(),
                message: Some(warning),
            });
            FileScanOutcome::default()
        }
    }
}

fn scan_addon_package_directory(
    root: &Path,
    airports: &mut BTreeSet<String>,
    summary: &mut AddonAirportScanSummary,
) {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) => {
            summary.warnings.push(format!(
                "Unable to read folder {} ({error})",
                root.display()
            ));
            return;
        }
    };

    let mut content_history_file = None;
    let mut manifest_file = None;
    let mut child_directories = Vec::new();

    for entry in entries {
        match entry {
            Ok(entry) => {
                let path = entry.path();
                if path.is_dir() {
                    child_directories.push(path);
                    continue;
                }

                let file_name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("");

                if file_name.eq_ignore_ascii_case("ContentHistory.json")
                    && content_history_file.is_none()
                {
                    content_history_file = Some(path);
                } else if file_name.eq_ignore_ascii_case("manifest.json") && manifest_file.is_none()
                {
                    manifest_file = Some(path);
                }
            }
            Err(error) => summary.warnings.push(format!(
                "Skipped directory entry in {} ({error})",
                root.display()
            )),
        }
    }

    let content_history_entries_found = content_history_file
        .as_deref()
        .map(|path| scan_content_history_file(path, airports, summary).airport_entries_found)
        .unwrap_or(0);

    if content_history_entries_found == 0 {
        if let Some(manifest_path) = manifest_file.as_deref() {
            summary.manifest_fallbacks_used += 1;
            scan_manifest_file(manifest_path, airports, summary);
        }
    }

    for child_directory in child_directories {
        scan_addon_package_directory(&child_directory, airports, summary);
    }
}

pub(crate) fn scan_addon_airports_for_roots(roots: Vec<String>) -> crate::AddonAirportCache {
    let roots = normalize_addon_roots(roots);
    if roots.is_empty() {
        return build_idle_addon_airport_cache(Vec::new());
    }

    let mut airports = BTreeSet::new();
    let mut summary = AddonAirportScanSummary::default();

    for root in &roots {
        scan_addon_package_directory(Path::new(root), &mut airports, &mut summary);
    }

    crate::AddonAirportCache {
        roots,
        airports: airports.into_iter().collect(),
        last_scanned_at: Some(iso_now_utc()),
        content_history_files_scanned: summary.content_history_files_scanned,
        manifest_files_scanned: summary.manifest_files_scanned,
        manifest_fallbacks_used: summary.manifest_fallbacks_used,
        manifest_airport_entries_found: summary.manifest_airport_entries_found,
        airport_entries_found: summary.airport_entries_found,
        duplicate_airport_entries: summary.duplicate_airport_entries,
        status: if summary.warnings.is_empty() {
            "ready".into()
        } else {
            "error".into()
        },
        last_error: summarize_warnings(&summary.warnings),
        warnings: summary.warnings,
        scan_details: summary.scan_details,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_scan_dir(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("flight-planner-{label}-{unique}"));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    fn create_package_dir(root: &Path, name: &str) -> PathBuf {
        let path = root.join(name);
        fs::create_dir_all(&path).expect("create package dir");
        path
    }

    fn write_text(path: &Path, contents: &str) {
        fs::write(path, contents).expect("write file");
    }

    #[test]
    fn collect_airports_from_json_finds_airport_entries_recursively() {
        let json: Value = serde_json::from_str(
            r#"{
                "items": [
                    { "type": "Airport", "Content": "ksea" },
                    { "type": "Airport", "content": "kpln" },
                    { "type": "Scenery", "Content": "ignored" },
                    { "nested": { "type": "Airport", "Content": " klax " } }
                ]
            }"#,
        )
        .expect("json");

        let mut airports = Vec::new();
        collect_airports_from_json(&json, &mut airports);

        assert_eq!(
            airports,
            vec!["KSEA".to_string(), "KPLN".to_string(), "KLAX".to_string()]
        );
    }

    #[test]
    fn extract_icao_tokens_from_manifest_title_keeps_unique_four_letter_tokens() {
        let tokens = extract_icao_tokens_from_manifest_title(
            "TUPJ Terrance B Lettsome International Airport TUPJ TEST",
        );

        assert_eq!(tokens, vec!["TUPJ".to_string(), "TEST".to_string()]);
    }

    #[test]
    fn scan_addon_airports_still_reads_content_history_files() {
        let root = temp_scan_dir("addon-scan");
        write_text(
            &root.join("ContentHistory.json"),
            r#"[{"type":"Airport","Content":"katl"},{"type":"Airport","Content":"KATL"}]"#,
        );

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(cache.airports, vec!["KATL".to_string()]);
        assert_eq!(cache.content_history_files_scanned, 1);
        assert_eq!(cache.manifest_files_scanned, 0);
        assert_eq!(cache.airport_entries_found, 2);
        assert_eq!(cache.status, "ready");
        assert!(cache.last_error.is_none());
        assert_eq!(cache.scan_details.len(), 1);
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "partial-duplicate"
                && detail.airports == vec!["KATL".to_string()]
                && detail.duplicate_airports == vec!["KATL".to_string()]));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_addon_airports_detects_mmce_manifest_title() {
        let root = temp_scan_dir("addon-manifest-mmce");
        let package = create_package_dir(&root, "mmce");
        write_text(
            &package.join("manifest.json"),
            r#"{"content_type":"SCENERY","title":"MMCE - Ciudad del Carmen International Airport"}"#,
        );

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(cache.airports, vec!["MMCE".to_string()]);
        assert_eq!(cache.manifest_files_scanned, 1);
        assert_eq!(cache.manifest_fallbacks_used, 1);
        assert_eq!(cache.manifest_airport_entries_found, 1);
        assert_eq!(cache.status, "ready");
        assert!(cache.warnings.is_empty());
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "manifest-cached"
                && detail.airports == vec!["MMCE".to_string()]));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_addon_airports_detects_tupj_manifest_title() {
        let root = temp_scan_dir("addon-manifest-tupj");
        let package = create_package_dir(&root, "tupj");
        write_text(
            &package.join("manifest.json"),
            r#"{"content_type":"SCENERY","title":"TUPJ Terrance B Lettsome International Airport"}"#,
        );

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(cache.airports, vec!["TUPJ".to_string()]);
        assert_eq!(cache.manifest_files_scanned, 1);
        assert_eq!(cache.manifest_fallbacks_used, 1);
        assert_eq!(cache.manifest_airport_entries_found, 1);
        assert_eq!(cache.status, "ready");
        assert!(cache.warnings.is_empty());
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "manifest-cached"
                && detail.airports == vec!["TUPJ".to_string()]));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_addon_airports_skips_manifest_fallback_when_content_history_has_airports() {
        let root = temp_scan_dir("addon-manifest-skip");
        let package = create_package_dir(&root, "package");
        write_text(
            &package.join("ContentHistory.json"),
            r#"[{"type":"Airport","Content":"ksea"}]"#,
        );
        write_text(
            &package.join("manifest.json"),
            r#"{"content_type":"SCENERY","title":"MMCE - Ciudad del Carmen International Airport"}"#,
        );

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(cache.airports, vec!["KSEA".to_string()]);
        assert_eq!(cache.content_history_files_scanned, 1);
        assert_eq!(cache.manifest_files_scanned, 0);
        assert_eq!(cache.manifest_fallbacks_used, 0);
        assert_eq!(cache.status, "ready");
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "cached"
                && detail.airports == vec!["KSEA".to_string()]));
        assert!(!cache
            .scan_details
            .iter()
            .any(|detail| detail.status.starts_with("manifest-")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_addon_airports_uses_manifest_fallback_when_content_history_has_no_airports() {
        let root = temp_scan_dir("addon-manifest-fallback");
        let package = create_package_dir(&root, "package");
        write_text(
            &package.join("ContentHistory.json"),
            r#"{"entries":[{"type":"Scenery","Content":"ignored"}]}"#,
        );
        write_text(
            &package.join("manifest.json"),
            r#"{"content_type":"SCENERY","title":"MMCE - Ciudad del Carmen International Airport"}"#,
        );

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(cache.airports, vec!["MMCE".to_string()]);
        assert_eq!(cache.content_history_files_scanned, 1);
        assert_eq!(cache.manifest_files_scanned, 1);
        assert_eq!(cache.manifest_fallbacks_used, 1);
        assert_eq!(cache.manifest_airport_entries_found, 1);
        assert_eq!(cache.airport_entries_found, 1);
        assert_eq!(cache.status, "ready");
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "no-airport-content"));
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "manifest-cached"
                && detail.airports == vec!["MMCE".to_string()]));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_addon_airports_deduplicates_across_content_history_and_manifest_fallback() {
        let root = temp_scan_dir("addon-manifest-duplicate");
        let content_package = create_package_dir(&root, "content-package");
        let manifest_package = create_package_dir(&root, "manifest-package");

        write_text(
            &content_package.join("ContentHistory.json"),
            r#"[{"type":"Airport","Content":"ksea"}]"#,
        );
        write_text(
            &manifest_package.join("manifest.json"),
            r#"{"content_type":"SCENERY","title":"KSEA - Duplicate Airport"}"#,
        );

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(cache.airports, vec!["KSEA".to_string()]);
        assert_eq!(cache.content_history_files_scanned, 1);
        assert_eq!(cache.manifest_files_scanned, 1);
        assert_eq!(cache.manifest_fallbacks_used, 1);
        assert_eq!(cache.airport_entries_found, 2);
        assert_eq!(cache.manifest_airport_entries_found, 1);
        assert_eq!(cache.duplicate_airport_entries, 1);
        assert_eq!(cache.status, "ready");
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "manifest-duplicate-only"
                && detail.duplicate_airports == vec!["KSEA".to_string()]));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_addon_airports_reports_malformed_manifest_as_warning() {
        let root = temp_scan_dir("addon-manifest-malformed");
        let content_package = create_package_dir(&root, "content-package");
        let bad_manifest_package = create_package_dir(&root, "bad-manifest-package");

        write_text(
            &content_package.join("ContentHistory.json"),
            r#"[{"type":"Airport","Content":"ksea"}]"#,
        );
        write_text(&bad_manifest_package.join("manifest.json"), "{");

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(cache.airports, vec!["KSEA".to_string()]);
        assert_eq!(cache.manifest_files_scanned, 1);
        assert_eq!(cache.manifest_fallbacks_used, 1);
        assert_eq!(cache.status, "error");
        assert_eq!(cache.warnings.len(), 1);
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "manifest-malformed-json"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scan_addon_airports_reports_manifest_no_icao_without_warning() {
        let root = temp_scan_dir("addon-manifest-no-icao");
        let package = create_package_dir(&root, "manifest-package");
        write_text(
            &package.join("manifest.json"),
            r#"{"content_type":"SCENERY","title":"Scenery Package"}"#,
        );

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert!(cache.airports.is_empty());
        assert_eq!(cache.manifest_files_scanned, 1);
        assert_eq!(cache.manifest_fallbacks_used, 1);
        assert_eq!(cache.status, "ready");
        assert!(cache.warnings.is_empty());
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "manifest-no-icao" && detail.message.is_some()));

        let _ = fs::remove_dir_all(root);
    }
}
