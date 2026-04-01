#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod simbrief;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tokio::sync::oneshot;
#[cfg(windows)]
use webview2_com::{
    CoTaskMemPWSTR, Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4,
    WebMessageReceivedEventHandler,
};
#[cfg(windows)]
use windows::core::{Interface, PWSTR};
use simbrief::{
    close_simbrief_dispatch_window, start_simbrief_dispatch, SimBriefDispatchManager,
};

const DELTAVA_LOGIN_URL: &str = "https://www.deltava.org/login.do";
const DELTAVA_SYNC_LABEL: &str = "deltava-sync";
const DELTAVA_SYNC_TIMEOUT_SECONDS: u64 = 300;
const DELTAVA_XML_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_PFPX_XML__";
const DELTAVA_DEBUG_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_SYNC_DEBUG__";
const APP_STORAGE_DIR: &str = "flight-planner";
const APP_LOG_FILE: &str = "log.txt";
const ADDON_AIRPORT_CACHE_FILE: &str = "addon-airports.json";
const APP_LOG_MAX_BYTES: u64 = 262_144;
const DELTAVA_SYNC_DOWNLOAD_FILE: &str = "deltava-pfpxsched.xml";
static DELTAVA_SYNC_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
const WEBVIEW_ROOT_PRUNE_DIRS: &[&str] = &[
    "AutoLaunchProtocolsComponent",
    "CertificateRevocation",
    "component_crx_cache",
    "Crashpad",
    "Domain Actions",
    "extensions_crx_cache",
    "GraphiteDawnCache",
    "GrShaderCache",
    "hyphen-data",
    "MEIPreload",
    "OriginTrials",
    "PKIMetadata",
    "ShaderCache",
    "Speech Recognition",
    "Subresource Filter",
    "Trust Protection Lists",
    "TrustTokenKeyCommitments",
    "WidevineCdm",
];
const WEBVIEW_ROOT_PRUNE_FILES: &[&str] = &["Last Version", "Variations"];
const WEBVIEW_PROFILE_PRUNE_DIRS: &[&str] = &[
    "AutofillAiModelCache",
    "blob_storage",
    "BudgetDatabase",
    "Cache",
    "Code Cache",
    "commerce_subscription_db",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "discount_infos_db",
    "discounts_db",
    "EdgeJourneys",
    "Extension Rules",
    "Extension Scripts",
    "Feature Engagement Tracker",
    "GPUCache",
    "Network",
    "optimization_guide_hint_cache_store",
    "parcel_tracking_db",
    "Password_Diagnostics",
    "PersistentOriginTrials",
    "Safe Browsing Network",
    "Session Storage",
    "Sessions",
    "Shared Dictionary",
    "shared_proto_db",
    "Site Characteristics Database",
    "Sync Data",
];
const WEBVIEW_PROFILE_PRUNE_FILES: &[&str] = &[
    "BrowsingTopicsSiteData",
    "BrowsingTopicsSiteData-journal",
    "BrowsingTopicsState",
    "DIPS",
    "Favicons",
    "Favicons-journal",
    "heavy_ad_intervention_opt_out.db",
    "heavy_ad_intervention_opt_out.db-journal",
    "History",
    "History-journal",
    "LOCK",
    "LOG",
    "LOG.old",
    "Network Action Predictor",
    "Network Action Predictor-journal",
    "Top Sites",
    "Top Sites-journal",
    "Vpn Tokens",
    "Vpn Tokens-journal",
];

const DELTAVA_AUTO_SYNC_SCRIPT: &str = r#"
(() => {
  const targetUrl = 'https://www.deltava.org/pfpxsched.ws';
  const syncFlagKey = 'flightPlannerDeltaSyncRequested';
  const xmlMessagePrefix = '__FLIGHT_PLANNER_PFPX_XML__';
  const debugPrefix = '__FLIGHT_PLANNER_SYNC_DEBUG__';
  const emitDebug = (message) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(debugPrefix + message);
    }
  };
  const ensureSyncOverlay = () => {
    let overlay = document.getElementById('flight-planner-sync-overlay');
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement('div');
    overlay.id = 'flight-planner-sync-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = '#ffffff';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '12px';
    overlay.style.color = '#0f172a';
    overlay.style.fontFamily = 'Segoe UI, Tahoma, Arial, sans-serif';
    overlay.style.fontSize = '14px';

    const icon = document.createElement('div');
    icon.textContent = '⌛';
    icon.style.fontSize = '42px';
    icon.style.lineHeight = '1';
    icon.style.animation = 'flightPlannerHourglassPulse 1.1s ease-in-out infinite';

    const text = document.createElement('div');
    text.textContent = 'Downloading and processing schedule...';

    const style = document.createElement('style');
    style.textContent = `
      @keyframes flightPlannerHourglassPulse {
        0% { opacity: 0.45; transform: scale(0.95); }
        50% { opacity: 1; transform: scale(1); }
        100% { opacity: 0.45; transform: scale(0.95); }
      }
    `;

    overlay.appendChild(icon);
    overlay.appendChild(text);
    overlay.appendChild(style);
    document.documentElement.appendChild(overlay);
    return overlay;
  };
  const showSyncOverlay = () => {
    const overlay = ensureSyncOverlay();
    overlay.style.display = 'flex';
  };
  if (window.location.origin !== 'https://www.deltava.org') {
    return;
  }
  emitDebug(`script:loaded:${window.location.href}`);

  const markSyncRequested = () => {
    window.__flightPlannerDeltaSyncRequested = true;
    try {
      window.sessionStorage.setItem(syncFlagKey, '1');
    } catch (_) {}
  };

  if (!window.__flightPlannerDeltaSyncListenersBound) {
    window.__flightPlannerDeltaSyncListenersBound = true;
    emitDebug('listener:bound');
    document.addEventListener('submit', () => {
      markSyncRequested();
      emitDebug('event:submit');
    }, true);

    document.addEventListener('click', (event) => {
      const element = event.target && event.target.closest
        ? event.target.closest('button, input[type="submit"], input[type="button"], a')
        : null;
      if (!element) {
        return;
      }
      const text = (element.innerText || element.value || element.textContent || '').toLowerCase();
      const idName = `${element.id || ''} ${element.name || ''}`.toLowerCase();
      if (text.includes('login') || idName.includes('login') || idName.includes('signin')) {
        markSyncRequested();
        emitDebug(`event:click:${text || idName || 'unknown'}`);
      }
    }, true);
  }

  if (window.location.href === targetUrl) {
    emitDebug('state:at-pfpx');
    showSyncOverlay();
    if (window.__flightPlannerDeltaXmlPosted) {
      emitDebug('state:xml-already-posted');
      return;
    }
    window.__flightPlannerDeltaXmlPosted = true;
    window.setTimeout(async () => {
      if (!window.chrome?.webview?.postMessage) {
        return;
      }
      let xml = '';
      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        });
        xml = await response.text();
        emitDebug(`fetch:ok:${response.status}:${xml.length}`);
      } catch (_) {}

      if (!xml) {
        xml = document.documentElement ? document.documentElement.outerHTML : '';
        emitDebug(`fetch:fallback-dom:${xml.length}`);
      }

      if (xml) {
        window.chrome.webview.postMessage(xmlMessagePrefix + xml);
        emitDebug('xml:posted');
      }
    }, 100);
    return;
  }

  let syncRequested = false;
  try {
    syncRequested = window.sessionStorage.getItem(syncFlagKey) === '1';
  } catch (_) {
    syncRequested = Boolean(window.__flightPlannerDeltaSyncRequested);
  }

  if (!syncRequested) {
    emitDebug('state:not-requested');
    return;
  }

  if (window.__flightPlannerDeltaSyncPending) {
    emitDebug('state:pending');
    return;
  }

  const passwordFieldPresent = !!document.querySelector(
    'input[type="password"], input[name*="pass" i], input[id*="pass" i]'
  );
  if (passwordFieldPresent) {
    emitDebug('state:waiting-auth');
    return;
  }

  window.__flightPlannerDeltaSyncPending = true;
  emitDebug(`state:fetching:${targetUrl}`);
  showSyncOverlay();
  window.setTimeout(async () => {
    if (!window.chrome?.webview?.postMessage) {
      return;
    }
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const xml = await response.text();
      emitDebug(`fetch:post-auth:${response.status}:${xml.length}`);
      if (xml && xml.trimStart().startsWith('<')) {
        window.chrome.webview.postMessage(xmlMessagePrefix + xml);
        emitDebug('xml:posted-from-home');
        return;
      }
      emitDebug('fetch:post-auth-non-xml');
    } catch (error) {
      emitDebug(`fetch:post-auth-error:${error?.message || 'unknown'}`);
    }

    emitDebug(`state:redirecting-fallback:${targetUrl}`);
    window.location.assign(targetUrl);
  }, 250);
})();
"#;

#[derive(Default)]
struct DeltaSyncManager {
    active: Mutex<Option<ActiveDeltaSync>>,
}

struct ActiveDeltaSync {
    label: String,
    sender: oneshot::Sender<Result<DeltaSyncPayload, String>>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AddonAirportCache {
    #[serde(default)]
    roots: Vec<String>,
    #[serde(default)]
    airports: Vec<String>,
    last_scanned_at: Option<String>,
    #[serde(default)]
    content_history_files_scanned: usize,
    #[serde(default)]
    airport_entries_found: usize,
    #[serde(default)]
    status: String,
    last_error: Option<String>,
    #[serde(default)]
    warnings: Vec<String>,
    #[serde(default)]
    scan_details: Vec<AddonAirportScanDetail>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AddonAirportScanDetail {
    path: String,
    status: String,
    airports: Vec<String>,
    duplicate_airports: Vec<String>,
    message: Option<String>,
}

#[derive(Default)]
struct AddonAirportScanSummary {
    content_history_files_scanned: usize,
    airport_entries_found: usize,
    warnings: Vec<String>,
    scan_details: Vec<AddonAirportScanDetail>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaSyncPayload {
    file_name: String,
    xml_text: String,
}

impl DeltaSyncManager {
    fn begin(
        &self,
        label: String,
        sender: oneshot::Sender<Result<DeltaSyncPayload, String>>,
    ) -> Result<(), String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "download_failed: Unable to lock sync state.".to_string())?;

        if active.is_some() {
            return Err("download_failed: A Delta Virtual sync is already in progress.".into());
        }

        *active = Some(ActiveDeltaSync { label, sender });
        Ok(())
    }

    fn finish(&self, label: &str, result: Result<DeltaSyncPayload, String>) {
        let sender = self
            .active
            .lock()
            .ok()
            .and_then(|mut active| match active.take() {
                Some(session) if session.label == label => Some(session.sender),
                Some(session) => {
                    *active = Some(session);
                    None
                }
                None => None,
            });

        if let Some(sender) = sender {
            let _ = sender.send(result);
        }
    }
}

fn addon_airport_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve addon airport cache path: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Unable to create app data directory: {error}"))?;

    let storage_dir = app_data_dir.join(APP_STORAGE_DIR);
    fs::create_dir_all(&storage_dir)
        .map_err(|error| format!("Unable to create app storage directory: {error}"))?;

    Ok(storage_dir.join(ADDON_AIRPORT_CACHE_FILE))
}

fn normalize_addon_roots(roots: Vec<String>) -> Vec<String> {
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

fn default_addon_airport_cache() -> AddonAirportCache {
    AddonAirportCache {
        status: "idle".into(),
        ..AddonAirportCache::default()
    }
}

fn read_addon_airport_cache_from_disk(app: &AppHandle) -> Result<AddonAirportCache, String> {
    let cache_path = addon_airport_cache_path(app)?;
    if !cache_path.exists() {
        return Ok(default_addon_airport_cache());
    }

    let text = fs::read_to_string(&cache_path)
        .map_err(|error| format!("Unable to read addon airport cache: {error}"))?;
    let mut cache: AddonAirportCache = serde_json::from_str(&text)
        .map_err(|error| format!("Unable to parse addon airport cache: {error}"))?;

    cache.roots = normalize_addon_roots(cache.roots);
    cache.airports.sort();
    cache.airports.dedup();

    if cache.status.trim().is_empty() {
        cache.status = "idle".into();
    }

    Ok(cache)
}

fn write_addon_airport_cache_to_disk(
    app: &AppHandle,
    cache: &AddonAirportCache,
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

fn build_idle_addon_airport_cache(roots: Vec<String>) -> AddonAirportCache {
    AddonAirportCache {
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

fn collect_airports_from_json(
    value: &Value,
    airports: &mut Vec<String>,
) {
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

                summary.scan_details.push(AddonAirportScanDetail {
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
                summary.scan_details.push(AddonAirportScanDetail {
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
            summary.scan_details.push(AddonAirportScanDetail {
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

fn scan_addon_airports_for_roots(roots: Vec<String>) -> AddonAirportCache {
    let roots = normalize_addon_roots(roots);
    if roots.is_empty() {
        return build_idle_addon_airport_cache(Vec::new());
    }

    let mut airports = BTreeSet::new();
    let mut summary = AddonAirportScanSummary::default();

    for root in &roots {
        scan_addon_root_directory(Path::new(root), &mut airports, &mut summary);
    }

    AddonAirportCache {
        roots,
        airports: airports.into_iter().collect(),
        last_scanned_at: Some(chrono_like_timestamp()),
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

fn is_allowed_deltava_url(url: &tauri::webview::Url) -> bool {
    url.scheme() == "https" && url.domain() == Some("www.deltava.org")
}

fn is_schedule_download_url(url: &tauri::webview::Url) -> bool {
    is_allowed_deltava_url(url) && url.path() == "/pfpxsched.ws"
}

fn should_probe_for_schedule(url: &tauri::webview::Url) -> bool {
    is_allowed_deltava_url(url) && url.path() != "/pfpxsched.ws"
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

fn build_download_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("download_failed: Unable to resolve app data path: {error}"))?;
    let download_dir = base_dir.join("deltava-sync").join("downloads");
    fs::create_dir_all(&download_dir)
        .map_err(|error| format!("download_failed: Unable to create sync directory: {error}"))?;
    prune_legacy_downloads(&download_dir);

    if let Ok(current_dir) = std::env::current_dir() {
        prune_legacy_downloads(&current_dir);
    }

    Ok(download_dir.join(DELTAVA_SYNC_DOWNLOAD_FILE))
}

fn resolve_default_log_path() -> Option<PathBuf> {
    let storage_dir = std::env::temp_dir().join(APP_STORAGE_DIR);
    let _ = fs::create_dir_all(&storage_dir);
    Some(storage_dir.join(APP_LOG_FILE))
}

fn initialize_sync_log_path(app: &AppHandle) -> Option<PathBuf> {
    if let Some(existing) = DELTAVA_SYNC_LOG_PATH.get() {
        return Some(existing.clone());
    }

    let resolved = match app.path().app_data_dir() {
        Ok(base_dir) => {
            let storage_dir = base_dir.join(APP_STORAGE_DIR);
            if fs::create_dir_all(&storage_dir).is_ok() {
                Some(storage_dir.join(APP_LOG_FILE))
            } else {
                resolve_default_log_path()
            }
        }
        Err(_) => resolve_default_log_path(),
    };

    if let Some(path) = resolved.clone() {
        let _ = DELTAVA_SYNC_LOG_PATH.set(path);
    }

    resolved
}

fn append_sync_log(message: &str) {
    let now = chrono_like_timestamp();
    let line = format!("[{now}] [DeltaSync] {message}\n");
    eprintln!("[deltava-sync] {message}");

    let log_path = DELTAVA_SYNC_LOG_PATH
        .get()
        .cloned()
        .or_else(resolve_default_log_path);

    if let Some(log_path) = log_path {
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
}

fn chrono_like_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}", now.as_secs(), now.subsec_millis())
}

fn build_webview_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("download_failed: Unable to resolve webview data path: {error}"))?
        .join("deltava-webview");
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("download_failed: Unable to create webview data path: {error}"))?;
    Ok(data_dir)
}

fn is_expected_cleanup_skip(error: &std::io::Error) -> bool {
    match error.raw_os_error() {
        // ERROR_ACCESS_DENIED / ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION.
        Some(5 | 32 | 33) => true,
        _ => false,
    }
}

fn remove_path_if_exists(path: &Path) {
    if !path.exists() {
        return;
    }

    let result = if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };

    if let Err(error) = result {
        if !is_expected_cleanup_skip(&error) {
            append_sync_log(&format!("cleanup:skip {} ({error})", path.display()));
        }
    }
}

fn prune_webview_profile(root: &Path) {
    if !root.exists() {
        return;
    }

    for dir_name in WEBVIEW_ROOT_PRUNE_DIRS {
        remove_path_if_exists(&root.join(dir_name));
    }

    for file_name in WEBVIEW_ROOT_PRUNE_FILES {
        remove_path_if_exists(&root.join(file_name));
    }

    let default_profile = root.join("Default");
    if !default_profile.exists() {
        return;
    }

    for dir_name in WEBVIEW_PROFILE_PRUNE_DIRS {
        remove_path_if_exists(&default_profile.join(dir_name));
    }

    for file_name in WEBVIEW_PROFILE_PRUNE_FILES {
        remove_path_if_exists(&default_profile.join(file_name));
    }
}

fn prune_deltava_storage_internal(
    app: &AppHandle,
    remove_downloaded_schedule: bool,
    include_main_webview_profile: bool,
) {
    let Ok(local_data_dir) = app.path().app_local_data_dir() else {
        return;
    };

    if include_main_webview_profile {
        prune_webview_profile(&local_data_dir.join("EBWebView"));
    }
    prune_webview_profile(&local_data_dir.join("deltava-webview").join("EBWebView"));

    if remove_downloaded_schedule {
        let download_dir = local_data_dir.join("deltava-sync").join("downloads");
        remove_path_if_exists(&download_dir.join(DELTAVA_SYNC_DOWNLOAD_FILE));
        prune_legacy_downloads(&download_dir);
    }
}

fn close_sync_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DELTAVA_SYNC_LABEL) {
        let _ = window.close();
    }
}

#[tauri::command]
fn close_deltava_sync_window(app: AppHandle) {
    close_sync_window(&app);
}

#[tauri::command]
fn prune_deltava_storage(app: AppHandle, remove_downloaded_schedule: bool) {
    prune_deltava_storage_internal(&app, remove_downloaded_schedule, false);
}

#[tauri::command]
fn read_addon_airport_cache(app: AppHandle) -> Result<AddonAirportCache, String> {
    read_addon_airport_cache_from_disk(&app)
}

#[tauri::command]
fn save_addon_airport_roots(
    app: AppHandle,
    roots: Vec<String>,
) -> Result<AddonAirportCache, String> {
    let roots = normalize_addon_roots(roots);
    let next_cache = build_idle_addon_airport_cache(roots);
    write_addon_airport_cache_to_disk(&app, &next_cache)?;
    Ok(next_cache)
}

#[tauri::command]
async fn scan_addon_airports(
    app: AppHandle,
    roots: Option<Vec<String>>,
) -> Result<AddonAirportCache, String> {
    let roots_to_scan = match roots {
        Some(roots) => normalize_addon_roots(roots),
        None => read_addon_airport_cache_from_disk(&app)?.roots,
    };

    let cache =
        tauri::async_runtime::spawn_blocking(move || scan_addon_airports_for_roots(roots_to_scan))
            .await
            .map_err(|error| format!("Addon airport scan did not complete: {error}"))?;

    write_addon_airport_cache_to_disk(&app, &cache)?;
    Ok(cache)
}

#[cfg(windows)]
fn attach_windows_xml_message_handler(
    window: &tauri::WebviewWindow,
    app: AppHandle,
    download_path: PathBuf,
) -> Result<(), String> {
    let registration_error = std::sync::Arc::new(Mutex::new(None::<String>));
    let registration_error_for_closure = registration_error.clone();

    window
        .with_webview(move |platform| unsafe {
            let result = (|| -> Result<(), String> {
                let webview = platform
                    .controller()
                    .CoreWebView2()
                    .map_err(|error| format!("download_failed: Unable to access WebView2 instance: {error}"))?;
                let settings = webview
                    .Settings()
                    .map_err(|error| format!("download_failed: Unable to access WebView2 settings: {error}"))?;
                if let Ok(settings4) = settings.cast::<ICoreWebView2Settings4>() {
                    let _ = settings4.SetIsPasswordAutosaveEnabled(true);
                    let _ = settings4.SetIsGeneralAutofillEnabled(true);
                    append_sync_log("webview:settings4-autofill-enabled");
                } else {
                    append_sync_log("webview:settings4-unavailable");
                }

                let app_handle = app.clone();
                let xml_path = download_path.clone();
                let mut token = 0i64;

                webview
                    .add_WebMessageReceived(
                        &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                            let Some(args) = args else {
                                return Ok(());
                            };

                            let mut message = PWSTR::null();
                            args.TryGetWebMessageAsString(&mut message)?;
                            let message = CoTaskMemPWSTR::from(message).to_string();

                            if let Some(debug_line) = message.strip_prefix(DELTAVA_DEBUG_MESSAGE_PREFIX) {
                                append_sync_log(&format!("webview:{debug_line}"));
                                return Ok(());
                            }

                            if let Some(xml_text) = message.strip_prefix(DELTAVA_XML_MESSAGE_PREFIX) {
                                let xml_text = xml_text.to_string();
                                let app_handle = app_handle.clone();
                                let xml_path = xml_path.clone();
                                let trimmed = xml_text.trim_start().to_string();
                                append_sync_log(&format!(
                                    "xml:received len={} target={}",
                                    xml_text.len(),
                                    xml_path.display()
                                ));

                                tauri::async_runtime::spawn(async move {
                                    let result = if !trimmed.starts_with('<')
                                        || !xml_text.contains("<FLIGHT>")
                                    {
                                        Err("invalid_xml: Delta Virtual returned a non-schedule response.".to_string())
                                    } else {
                                        match tokio::fs::write(&xml_path, &xml_text).await {
                                            Ok(_) => Ok(DeltaSyncPayload {
                                                file_name: "deltava-pfpxsched.xml".into(),
                                                xml_text,
                                            }),
                                            Err(error) => Err(format!(
                                                "download_failed: Unable to persist Delta Virtual XML: {error}"
                                            )),
                                        }
                                    };
                                    append_sync_log("xml:write-finished");

                                    app_handle
                                        .state::<DeltaSyncManager>()
                                        .finish(DELTAVA_SYNC_LABEL, result);
                                });
                            }

                            Ok(())
                        })),
                        &mut token,
                    )
                    .map_err(|error| {
                        format!("download_failed: Unable to register Delta Virtual XML listener: {error}")
                    })?;

                Ok(())
            })();

            if let Err(error) = result {
                if let Ok(mut slot) = registration_error_for_closure.lock() {
                    *slot = Some(error);
                }
            }
        })
        .map_err(|error| format!("download_failed: Unable to attach Delta Virtual XML capture: {error}"))?;

    if let Ok(mut slot) = registration_error.lock() {
        if let Some(error) = slot.take() {
            return Err(error);
        }
    }

    Ok(())
}

#[tauri::command]
async fn start_deltava_sync(
    app: AppHandle,
    sync_manager: State<'_, DeltaSyncManager>,
) -> Result<DeltaSyncPayload, String> {
    let initialized_log_path = initialize_sync_log_path(&app);
    if let Some(path) = initialized_log_path {
        append_sync_log(&format!("sync:log-file {}", path.display()));
    } else {
        append_sync_log("sync:log-file unresolved");
    }
    append_sync_log("sync:start");
    close_sync_window(&app);

    let (sender, receiver) = oneshot::channel();
    sync_manager.begin(DELTAVA_SYNC_LABEL.to_string(), sender)?;

    let download_path = build_download_path(&app)?;
    append_sync_log(&format!("sync:download-path {}", download_path.display()));
    let download_path_for_download_hook = download_path.clone();
    let webview_data_directory = build_webview_data_directory(&app)?;
    let _ = fs::remove_file(&download_path);

    let app_for_download = app.clone();
    let app_for_page_load = app.clone();
    let app_for_close = app.clone();

    let login_url = DELTAVA_LOGIN_URL
        .parse()
        .map_err(|error| format!("download_failed: Invalid Delta Virtual login URL: {error}"))?;

    let window = WebviewWindowBuilder::new(
        &app,
        DELTAVA_SYNC_LABEL,
        WebviewUrl::External(login_url),
    )
    .title("Delta Virtual Sync")
    .inner_size(520.0, 760.0)
    .min_inner_size(460.0, 680.0)
    .resizable(true)
    .center()
    .data_directory(webview_data_directory)
    .on_navigation(|url| is_allowed_deltava_url(url))
    .on_page_load(move |webview_window, payload| {
        if payload.event() == tauri::webview::PageLoadEvent::Finished
            && should_probe_for_schedule(payload.url())
        {
            append_sync_log(&format!("page:finished {}", payload.url()));
            let _ = webview_window.eval(DELTAVA_AUTO_SYNC_SCRIPT);
        }
    })
    .on_download(move |_webview, event| match event {
        tauri::webview::DownloadEvent::Requested { url, destination } => {
            append_sync_log(&format!("download:requested {url}"));
            if !is_schedule_download_url(&url) {
                return false;
            }

            *destination = download_path_for_download_hook.clone();
            true
        }
        tauri::webview::DownloadEvent::Finished { url, path, success } => {
            append_sync_log(&format!("download:finished {url} success={success}"));
            if !is_schedule_download_url(&url) {
                return true;
            }

            let resolved_path = path.unwrap_or_else(|| download_path_for_download_hook.clone());
            let app_handle = app_for_download.clone();

            tauri::async_runtime::spawn(async move {
                let result = if success {
                    match tokio::fs::read_to_string(&resolved_path).await {
                        Ok(xml_text) => {
                            let trimmed = xml_text.trim_start();
                            if !trimmed.starts_with('<') || !xml_text.contains("<FLIGHT>") {
                                append_sync_log("download:xml-invalid");
                                Err(
                                    "invalid_xml: Delta Virtual returned a non-schedule response."
                                        .into(),
                                )
                            } else {
                                append_sync_log("download:xml-valid");
                                Ok(DeltaSyncPayload {
                                    file_name: "deltava-pfpxsched.xml".into(),
                                    xml_text,
                                })
                            }
                        }
                        Err(error) => Err(format!(
                            "download_failed: Unable to read downloaded schedule XML: {error}"
                        )),
                    }
                } else {
                    Err("download_failed: Delta Virtual schedule download did not complete.".into())
                };

                app_handle
                    .state::<DeltaSyncManager>()
                    .finish(DELTAVA_SYNC_LABEL, result);
            });

            true
        }
        _ => true,
    })
    .build()
    .map_err(|error| {
        format!("download_failed: Unable to open Delta Virtual sync window: {error}")
    })?;

    #[cfg(windows)]
    attach_windows_xml_message_handler(&window, app.clone(), download_path.clone())?;
    append_sync_log("sync:webview-ready");

    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
            app_for_close.state::<DeltaSyncManager>().finish(
                DELTAVA_SYNC_LABEL,
                Err("cancelled: Delta Virtual sync window was closed before the XML was downloaded.".into()),
            );
        }
    });

    match tokio::time::timeout(Duration::from_secs(DELTAVA_SYNC_TIMEOUT_SECONDS), receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("download_failed: Delta Virtual sync stopped unexpectedly.".into()),
        Err(_) => {
            app_for_page_load.state::<DeltaSyncManager>().finish(
                DELTAVA_SYNC_LABEL,
                Err(
                    "auth_failed: Timed out waiting for Delta Virtual login or schedule download."
                        .into(),
                ),
            );
            close_sync_window(&app_for_page_load);
            Err(
                "auth_failed: Timed out waiting for Delta Virtual login or schedule download."
                    .into(),
            )
        }
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
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "cached" && detail.airports == vec!["KBOS".to_string()]));
        assert!(cache
            .scan_details
            .iter()
            .any(|detail| detail.status == "malformed-json"));

        let _ = fs::remove_dir_all(root);
    }
}

fn main() {
    tauri::Builder::default()
        .manage(DeltaSyncManager::default())
        .manage(SimBriefDispatchManager::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let _ = initialize_sync_log_path(&app_handle);
            prune_deltava_storage_internal(&app_handle, false, true);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_deltava_sync,
            close_deltava_sync_window,
            prune_deltava_storage,
            start_simbrief_dispatch,
            close_simbrief_dispatch_window,
            read_addon_airport_cache,
            save_addon_airport_roots,
            scan_addon_airports
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running flight planner app");
}
