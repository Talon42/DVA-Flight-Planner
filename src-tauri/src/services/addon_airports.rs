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
    airport_entries_found: usize,
    warnings: Vec<String>,
    scan_details: Vec<crate::AddonAirportScanDetail>,
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
        airport_entries_found: 0,
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

fn scan_content_history_file(
    path: &Path,
    airports: &mut BTreeSet<String>,
    summary: &mut AddonAirportScanSummary,
) {
    summary.content_history_files_scanned += 1;
    let path_display = path.display().to_string();

    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(json) => {
                let mut file_airports = Vec::new();
                collect_airports_from_json(&json, &mut file_airports);
                summary.airport_entries_found += file_airports.len();

                let mut cached_airports = Vec::new();
                let mut duplicate_airports = Vec::new();

                for airport in file_airports {
                    if airports.insert(airport.clone()) {
                        cached_airports.push(airport);
                    } else {
                        duplicate_airports.push(airport);
                    }
                }

                let status = if !cached_airports.is_empty() && duplicate_airports.is_empty() {
                    "cached"
                } else if !cached_airports.is_empty() && !duplicate_airports.is_empty() {
                    "partial-duplicate"
                } else if cached_airports.is_empty() && !duplicate_airports.is_empty() {
                    "duplicate-only"
                } else {
                    "no-airport-content"
                };

                let message = if status == "no-airport-content" {
                    Some("No airport ICAO values were extracted from this file.".to_string())
                } else {
                    None
                };

                summary.scan_details.push(crate::AddonAirportScanDetail {
                    path: path_display,
                    status: status.to_string(),
                    airports: cached_airports,
                    duplicate_airports,
                    message,
                });
            }
            Err(error) => {
                let warning = format!("Skipped malformed JSON at {} ({error})", path.display());
                summary.warnings.push(warning.clone());
                summary.scan_details.push(crate::AddonAirportScanDetail {
                    path: path_display,
                    status: "malformed-json".to_string(),
                    airports: Vec::new(),
                    duplicate_airports: Vec::new(),
                    message: Some(warning),
                });
            }
        },
        Err(error) => {
            let warning = format!("Skipped unreadable file at {} ({error})", path.display());
            summary.warnings.push(warning.clone());
            summary.scan_details.push(crate::AddonAirportScanDetail {
                path: path_display,
                status: "unreadable-file".to_string(),
                airports: Vec::new(),
                duplicate_airports: Vec::new(),
                message: Some(warning),
            });
        }
    }
}

fn scan_addon_root_directory(
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

    for entry in entries {
        match entry {
            Ok(entry) => {
                let path = entry.path();
                if path.is_dir() {
                    scan_addon_root_directory(&path, airports, summary);
                    continue;
                }

                let is_content_history = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.eq_ignore_ascii_case("ContentHistory.json"))
                    .unwrap_or(false);

                if is_content_history {
                    scan_content_history_file(&path, airports, summary);
                }
            }
            Err(error) => summary.warnings.push(format!(
                "Skipped directory entry in {} ({error})",
                root.display()
            )),
        }
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
        scan_addon_root_directory(Path::new(root), &mut airports, &mut summary);
    }

    crate::AddonAirportCache {
        roots,
        airports: airports.into_iter().collect(),
        last_scanned_at: Some(iso_now_utc()),
        content_history_files_scanned: summary.content_history_files_scanned,
        airport_entries_found: summary.airport_entries_found,
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
    fn scan_addon_airports_deduplicates_and_skips_bad_files() {
        let root = temp_scan_dir("addon-scan");
        let nested = root.join("nested");
        fs::create_dir_all(&nested).expect("nested dir");

        fs::write(
            root.join("ContentHistory.json"),
            r#"[{"type":"Airport","Content":"katl"},{"type":"Airport","Content":"KATL"}]"#,
        )
        .expect("write valid root");
        fs::write(
            nested.join("ContentHistory.json"),
            r#"{"entries":[{"type":"Airport","Content":"kbos"},{"type":"Scenery","Content":"x"}]}"#,
        )
        .expect("write valid nested");
        fs::write(root.join("ContentHistory-copy.json"), "{").expect("write ignored");
        fs::write(nested.join("ContentHistory.json.bak"), "{").expect("write ignored backup");

        let bad_dir = root.join("bad");
        fs::create_dir_all(&bad_dir).expect("bad dir");
        fs::write(bad_dir.join("ContentHistory.json"), "{").expect("write malformed");

        let cache = scan_addon_airports_for_roots(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(cache.airports, vec!["KATL".to_string(), "KBOS".to_string()]);
        assert_eq!(cache.content_history_files_scanned, 3);
        assert_eq!(cache.airport_entries_found, 3);
        assert_eq!(cache.status, "error");
        assert!(cache.last_error.is_some());
        assert_eq!(cache.scan_details.len(), 3);
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "partial-duplicate"
                && detail.airports == vec!["KATL".to_string()]
                && detail.duplicate_airports == vec!["KATL".to_string()]));
        assert!(
            cache
                .scan_details
                .iter()
                .any(|detail| detail.status == "cached"
                    && detail.airports == vec!["KBOS".to_string()])
        );
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "malformed-json"));

        let _ = fs::remove_dir_all(root);
    }
}
