#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod deltava_auth;
mod deltava_login;
mod simbrief;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use deltava_auth::{
    clear_auth_settings_internal, clear_deltava_auth_settings, read_auth_context_internal,
    read_deltava_auth_settings, save_deltava_auth_settings, save_password_to_credential_manager,
};
use simbrief::{
    close_simbrief_dispatch_window, fetch_simbrief_aircraft_types, start_simbrief_dispatch,
    SimBriefDispatchManager,
};
use std::{
    collections::BTreeSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tokio::sync::oneshot;
#[cfg(windows)]
use webview2_com::{
    CoTaskMemPWSTR, Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4,
    WebMessageReceivedEventHandler,
};
#[cfg(windows)]
use windows::core::{Interface, PWSTR};

const DELTAVA_LOGIN_URL: &str = "https://www.deltava.org/login.do";
const DELTAVA_SYNC_LABEL: &str = "deltava-sync";
const DELTAVA_SYNC_TIMEOUT_SECONDS: u64 = 300;
const DELTAVA_CLOSE_AFTER_PROMPT_WAIT_SECONDS: u64 = 30;
const DELTAVA_FOCUS_LOSS_RECENT_WINDOW_MILLIS: u64 = 3000;
const DELTAVA_XML_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_PFPX_XML__";
const DELTAVA_SYNC_RESULT_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_SYNC_RESULT__";
const DELTAVA_DEBUG_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_SYNC_DEBUG__";
const DELTAVA_AUTH_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_DVA_AUTH__";
const APP_STORAGE_DIR: &str = "flight-planner";
const APP_LOG_FILE: &str = "log.txt";
const ADDON_AIRPORT_CACHE_FILE: &str = "addon-airports.json";
const MAIN_WINDOW_STATE_FILE: &str = "main-window-state.json";
const APP_LOG_MAX_BYTES: u64 = 262_144;
const DELTAVA_SYNC_DOWNLOAD_FILE: &str = "deltava-pfpxsched.xml";
const DELTAVA_LOGBOOK_FALLBACK_FILE: &str = "dva-logbook.json";
const SIMBRIEF_WEBVIEW_DIR: &str = "simbrief-webview";
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
  const logbookPageUrl = 'https://www.deltava.org/logbook.do';
  const logbookExportUrl = 'https://www.deltava.org/mylogbook.ws';
  const syncFlagKey = 'flightPlannerDeltaSyncRequested';
  const syncResultPrefix = '__FLIGHT_PLANNER_SYNC_RESULT__';
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
  const parseLogbookExportIdFromUrl = (url) => {
    try {
      return new URL(url).searchParams.get('id') || '';
    } catch (_) {
      return '';
    }
  };
  const parseLogbookExportIdFromHtml = (html) => {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    return doc.querySelector('input[name="id"]')?.value || '';
  };
  const fetchScheduleXml = async () => {
    const response = await fetch(targetUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    const xml = await response.text();
    emitDebug(`xml:fetch-status:${response.status}:${xml.length}`);
    if (!response.ok) {
      throw new Error(`Schedule XML request failed with HTTP ${response.status}.`);
    }
    if (!xml || !xml.trimStart().startsWith('<')) {
      throw new Error('Delta Virtual returned a non-schedule XML response.');
    }
    return xml;
  };
  const fetchLogbookJsonExport = async () => {
    emitDebug('logbook:page-fetch-start');
    const pageResponse = await fetch(logbookPageUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    const pageHtml = await pageResponse.text();
    emitDebug(`logbook:page-status:${pageResponse.status}:${pageResponse.url}`);
    if (!pageResponse.ok) {
      throw new Error(`Logbook page request failed with HTTP ${pageResponse.status}.`);
    }

    let exportId = parseLogbookExportIdFromUrl(pageResponse.url);
    if (exportId) {
      emitDebug('logbook:id-source:url');
    } else {
      exportId = parseLogbookExportIdFromHtml(pageHtml);
      emitDebug(exportId ? 'logbook:id-source:hidden-input' : 'logbook:id-missing');
    }
    if (!exportId) {
      throw new Error('Unable to find Delta Virtual logbook export id.');
    }
    emitDebug(`logbook:id-parsed:${exportId}`);

    const exportResponse = await fetch(logbookExportUrl, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        export: 'JSONExport',
        id: exportId
      })
    });
    const filename = exportResponse.headers.get('X-Logbook-Filename') || '';
    const contentType = exportResponse.headers.get('Content-Type') || '';
    const jsonText = await exportResponse.text();
    emitDebug(`logbook:export-status:${exportResponse.status}:${jsonText.length}`);
    if (!exportResponse.ok) {
      throw new Error(`Logbook JSON export failed with HTTP ${exportResponse.status}.`);
    }
    return { jsonText, filename, contentType };
  };
  const postSyncResult = (payload) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(syncResultPrefix + JSON.stringify(payload));
    }
  };
  const runSyncDownloads = async () => {
    if (window.__flightPlannerDeltaDownloadsPosted) {
      emitDebug('state:downloads-already-posted');
      return true;
    }
    window.__flightPlannerDeltaDownloadsPosted = true;

    const payload = {
      xml: { ok: false },
      logbook: { ok: false }
    };

    try {
      payload.xml = { ok: true, xmlText: await fetchScheduleXml() };
    } catch (error) {
      payload.xml = { ok: false, error: error?.message || 'Schedule XML download failed.' };
      emitDebug(`xml:error:${payload.xml.error}`);
    }

    try {
      payload.logbook = { ok: true, ...(await fetchLogbookJsonExport()) };
    } catch (error) {
      payload.logbook = { ok: false, error: error?.message || 'Logbook JSON download failed.' };
      emitDebug(`logbook:error:${payload.logbook.error}`);
    }

    postSyncResult(payload);
    return true;
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
    if (window.__flightPlannerDeltaDownloadsPosted) {
      emitDebug('state:downloads-already-posted');
      return;
    }
    window.setTimeout(async () => {
      await runSyncDownloads();
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
    const posted = await runSyncDownloads();
    if (!posted) {
      emitDebug(`state:redirecting-fallback:${targetUrl}`);
      window.location.assign(targetUrl);
    }
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

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedWindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaSyncPayload {
    file_name: Option<String>,
    xml_text: Option<String>,
    status: String,
    xml_status: String,
    logbook_status: String,
    logbook_json: Option<DeltaLogbookArtifact>,
    warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaLogbookArtifact {
    file_name: String,
    path: String,
    bytes: usize,
    content_type: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaLogbookMetadata {
    date_iso: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaLogbookProgress {
    date_iso: Option<String>,
    visited_airports: Vec<String>,
    arrival_airports: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaWebSyncResult {
    xml: DeltaWebXmlResult,
    logbook: DeltaWebLogbookResult,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum DeltaWebAuthMessage {
    LoginSuccess,
    StorePassword { password: String },
    LoginFailed { reason: Option<String> },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaWebXmlResult {
    ok: bool,
    xml_text: Option<String>,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaWebLogbookResult {
    ok: bool,
    json_text: Option<String>,
    filename: Option<String>,
    content_type: Option<String>,
    error: Option<String>,
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

fn app_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app storage path: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Unable to create app data directory: {error}"))?;

    let storage_dir = app_data_dir.join(APP_STORAGE_DIR);
    fs::create_dir_all(&storage_dir)
        .map_err(|error| format!("Unable to create app storage directory: {error}"))?;

    Ok(storage_dir)
}

fn main_window_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_dir(app)?.join(MAIN_WINDOW_STATE_FILE))
}

fn read_saved_main_window_state(app: &AppHandle) -> Option<SavedWindowState> {
    let path = main_window_state_path(app).ok()?;
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<SavedWindowState>(&text).ok()
}

fn write_saved_main_window_state(app: &AppHandle, state: &SavedWindowState) -> Result<(), String> {
    let path = main_window_state_path(app)?;
    let text = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Unable to serialize main window state: {error}"))?;
    fs::write(path, text).map_err(|error| format!("Unable to write main window state: {error}"))
}

fn capture_main_window_state(
    window: &WebviewWindow,
    preserve_bounds_if_maximized: bool,
) -> Option<SavedWindowState> {
    let app = window.app_handle();
    let maximized = window.is_maximized().ok().unwrap_or(false);

    if maximized && preserve_bounds_if_maximized {
        let mut state = read_saved_main_window_state(&app).unwrap_or_default();
        state.maximized = true;
        return Some(state);
    }

    let position = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    if size.width == 0 || size.height == 0 {
        return None;
    }

    Some(SavedWindowState {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        maximized,
    })
}

fn persist_main_window_state(window: &WebviewWindow, preserve_bounds_if_maximized: bool) {
    let Some(state) = capture_main_window_state(window, preserve_bounds_if_maximized) else {
        return;
    };

    let _ = write_saved_main_window_state(&window.app_handle(), &state);
}

fn window_state_intersects_monitor(
    state: &SavedWindowState,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
) -> bool {
    let window_left = i64::from(state.x);
    let window_top = i64::from(state.y);
    let window_right = window_left + i64::from(state.width);
    let window_bottom = window_top + i64::from(state.height);
    let monitor_left = i64::from(monitor_x);
    let monitor_top = i64::from(monitor_y);
    let monitor_right = monitor_left + i64::from(monitor_width);
    let monitor_bottom = monitor_top + i64::from(monitor_height);

    window_left < monitor_right
        && window_right > monitor_left
        && window_top < monitor_bottom
        && window_bottom > monitor_top
}

fn center_window_state_on_monitor(
    state: &SavedWindowState,
    monitor_x: i32,
    monitor_y: i32,
    monitor_width: u32,
    monitor_height: u32,
) -> SavedWindowState {
    let width = state.width.min(monitor_width).max(1);
    let height = state.height.min(monitor_height).max(1);
    let centered_x = i64::from(monitor_x) + ((i64::from(monitor_width) - i64::from(width)) / 2);
    let centered_y = i64::from(monitor_y) + ((i64::from(monitor_height) - i64::from(height)) / 2);

    SavedWindowState {
        x: centered_x.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32,
        y: centered_y.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32,
        width,
        height,
        maximized: state.maximized,
    }
}

fn sanitize_saved_main_window_state(
    window: &WebviewWindow,
    state: SavedWindowState,
) -> SavedWindowState {
    let monitors = window.available_monitors().ok().unwrap_or_default();

    if monitors.iter().any(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        window_state_intersects_monitor(&state, position.x, position.y, size.width, size.height)
    }) {
        return state;
    }

    let fallback_monitor = window
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next());

    let Some(monitor) = fallback_monitor else {
        return state;
    };
    let position = monitor.position();
    let size = monitor.size();

    center_window_state_on_monitor(&state, position.x, position.y, size.width, size.height)
}

fn restore_main_window_state(window: &WebviewWindow) {
    let Some(saved_state) = read_saved_main_window_state(&window.app_handle()) else {
        return;
    };
    let state = sanitize_saved_main_window_state(window, saved_state);
    let _ = write_saved_main_window_state(&window.app_handle(), &state);

    if state.width > 0 && state.height > 0 {
        let _ = window.set_size(Size::Physical(PhysicalSize::new(state.width, state.height)));
    }

    let _ = window.set_position(Position::Physical(PhysicalPosition::new(state.x, state.y)));

    if state.maximized {
        let _ = window.maximize();
    }
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
    is_allowed_deltava_url(url)
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

fn build_logbook_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app.path().app_local_data_dir().map_err(|error| {
        format!("download_failed: Unable to resolve logbook storage path: {error}")
    })?;
    let logbook_dir = base_dir.join("deltava-sync").join("logbook");
    fs::create_dir_all(&logbook_dir)
        .map_err(|error| format!("download_failed: Unable to create logbook storage: {error}"))?;
    Ok(logbook_dir)
}

fn resolve_existing_logbook_json_path(app: &AppHandle) -> Option<PathBuf> {
    let logbook_dir = build_logbook_dir(app).ok()?;
    let fallback_path = logbook_dir.join(DELTAVA_LOGBOOK_FALLBACK_FILE);
    if fallback_path.is_file() {
        return Some(fallback_path);
    }

    fs::read_dir(logbook_dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let is_json = path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("json"))
                .unwrap_or(false);
            if !path.is_file() || !is_json {
                return None;
            }

            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .max_by_key(|(modified, _)| *modified)
        .map(|(_, path)| path)
}

fn get_json_field_i32(value: &Value, key: &str) -> Option<i32> {
    value
        .get(key)
        .and_then(Value::as_i64)
        .and_then(|number| i32::try_from(number).ok())
}

fn extract_logbook_date_parts(entry: &Value) -> Option<(i32, u32, u32)> {
    let date = entry.get("date")?;
    let year = get_json_field_i32(date, "y")?;
    let month = get_json_field_i32(date, "m")?;
    let day = get_json_field_i32(date, "d")?;

    if month < 0 || day < 1 {
        return None;
    }

    Some((year, month as u32, day as u32))
}

fn find_logbook_entries(json: &Value) -> Option<&Vec<Value>> {
    json.as_array()
        .or_else(|| json.get("flights").and_then(Value::as_array))
}

fn normalize_dva_logbook_month(raw_month: u32) -> Option<u32> {
    if raw_month <= 11 {
        return raw_month.checked_add(1);
    }

    if raw_month == 12 {
        return Some(12);
    }

    None
}

fn extract_latest_logbook_date_iso(json: &Value) -> Option<String> {
    let entries = find_logbook_entries(json)?;
    let latest_entry = entries.last()?;
    let (year, raw_month, day) = extract_logbook_date_parts(latest_entry)?;
    let month = normalize_dva_logbook_month(raw_month)?;

    NaiveDate::from_ymd_opt(year, month, day).map(|date| date.format("%Y-%m-%d").to_string())
}

fn read_deltava_logbook_metadata_internal(app: &AppHandle) -> DeltaLogbookMetadata {
    let Some(path) = resolve_existing_logbook_json_path(app) else {
        return DeltaLogbookMetadata { date_iso: None };
    };

    let Ok(text) = fs::read_to_string(&path) else {
        append_sync_log(&format!("logbook:metadata-read-failed {}", path.display()));
        return DeltaLogbookMetadata { date_iso: None };
    };

    let Ok(json) = serde_json::from_str::<Value>(&text) else {
        append_sync_log(&format!("logbook:metadata-invalid-json {}", path.display()));
        return DeltaLogbookMetadata { date_iso: None };
    };

    let date_iso = extract_latest_logbook_date_iso(&json);
    if date_iso.is_none() {
        append_sync_log(&format!("logbook:metadata-date-missing {}", path.display()));
    }

    DeltaLogbookMetadata { date_iso }
}

fn normalize_logbook_airport_code(value: &str) -> Option<String> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .map(|part| part.trim().to_ascii_uppercase())
        .find(|part| {
            (3..=5).contains(&part.len()) && part.chars().all(|ch| ch.is_ascii_alphanumeric())
        })
}

fn is_departure_airport_key(key: &str) -> bool {
    matches!(
        key,
        "dep"
            | "departure"
            | "depart"
            | "origin"
            | "from"
            | "fromicao"
            | "depicao"
            | "departureicao"
            | "departureairport"
            | "airportd"
            | "dairport"
            | "icaodep"
            | "icaodeparture"
    )
}

fn is_arrival_airport_key(key: &str) -> bool {
    matches!(
        key,
        "arr"
            | "arrival"
            | "destination"
            | "dest"
            | "to"
            | "toicao"
            | "arricao"
            | "arrivalicao"
            | "arrivalairport"
            | "airporta"
            | "aairport"
            | "icaoarr"
            | "icaoarrival"
    )
}

fn normalize_logbook_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase()
}

fn collect_airport_codes_from_value(value: &Value, airports: &mut BTreeSet<String>) {
    match value {
        Value::String(text) => {
            if let Some(code) = normalize_logbook_airport_code(text) {
                airports.insert(code);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_airport_codes_from_value(item, airports);
            }
        }
        Value::Object(map) => {
            for value in map.values() {
                collect_airport_codes_from_value(value, airports);
            }
        }
        _ => {}
    }
}

fn collect_airport_codes_from_airport_object(value: &Value, airports: &mut BTreeSet<String>) {
    let Value::Object(map) = value else {
        collect_airport_codes_from_value(value, airports);
        return;
    };

    for key in ["icao", "icaoCode", "fsIcao", "code", "iata"] {
        if let Some(code) = map
            .get(key)
            .and_then(Value::as_str)
            .and_then(normalize_logbook_airport_code)
        {
            airports.insert(code);
            return;
        }
    }
}

fn collect_logbook_airport_progress(
    value: &Value,
    visited_airports: &mut BTreeSet<String>,
    arrival_airports: &mut BTreeSet<String>,
) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_logbook_airport_progress(item, visited_airports, arrival_airports);
            }
        }
        Value::Object(map) => {
            for (key, value) in map {
                let normalized_key = normalize_logbook_key(key);
                if is_departure_airport_key(&normalized_key) {
                    collect_airport_codes_from_airport_object(value, visited_airports);
                } else if is_arrival_airport_key(&normalized_key) {
                    let mut arrivals = BTreeSet::new();
                    collect_airport_codes_from_airport_object(value, &mut arrivals);
                    for airport in arrivals {
                        arrival_airports.insert(airport.clone());
                        visited_airports.insert(airport);
                    }
                } else {
                    collect_logbook_airport_progress(value, visited_airports, arrival_airports);
                }
            }
        }
        _ => {}
    }
}

fn read_deltava_logbook_progress_internal(app: &AppHandle) -> DeltaLogbookProgress {
    let Some(path) = resolve_existing_logbook_json_path(app) else {
        return DeltaLogbookProgress {
            date_iso: None,
            visited_airports: Vec::new(),
            arrival_airports: Vec::new(),
        };
    };

    let Ok(text) = fs::read_to_string(&path) else {
        append_sync_log(&format!("logbook:progress-read-failed {}", path.display()));
        return DeltaLogbookProgress {
            date_iso: None,
            visited_airports: Vec::new(),
            arrival_airports: Vec::new(),
        };
    };

    let Ok(json) = serde_json::from_str::<Value>(&text) else {
        append_sync_log(&format!("logbook:progress-invalid-json {}", path.display()));
        return DeltaLogbookProgress {
            date_iso: None,
            visited_airports: Vec::new(),
            arrival_airports: Vec::new(),
        };
    };

    let mut visited_airports = BTreeSet::new();
    let mut arrival_airports = BTreeSet::new();
    if let Some(entries) = find_logbook_entries(&json) {
        for entry in entries {
            collect_logbook_airport_progress(entry, &mut visited_airports, &mut arrival_airports);
        }
    }

    DeltaLogbookProgress {
        date_iso: extract_latest_logbook_date_iso(&json),
        visited_airports: visited_airports.into_iter().collect(),
        arrival_airports: arrival_airports.into_iter().collect(),
    }
}

fn sanitize_logbook_filename(filename_hint: Option<&str>) -> String {
    let raw_name = filename_hint
        .and_then(|value| Path::new(value).file_name())
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DELTAVA_LOGBOOK_FALLBACK_FILE);

    let sanitized = raw_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();

    let sanitized = sanitized.trim_matches(&['.', '-', '_'][..]).to_string();
    let final_name = if sanitized.is_empty() {
        DELTAVA_LOGBOOK_FALLBACK_FILE.to_string()
    } else {
        sanitized
    };

    if final_name.to_ascii_lowercase().ends_with(".json") {
        final_name
    } else {
        format!("{final_name}.json")
    }
}

async fn store_logbook_json(
    app: &AppHandle,
    json_text: &str,
    filename_hint: Option<&str>,
    content_type: Option<String>,
) -> Result<DeltaLogbookArtifact, String> {
    let trimmed = json_text.trim();
    if trimmed.is_empty() {
        return Err("download_failed: Delta Virtual logbook JSON export was empty.".into());
    }

    serde_json::from_str::<Value>(trimmed).map_err(|error| {
        format!("invalid_json: Delta Virtual logbook JSON was invalid: {error}")
    })?;
    append_sync_log("logbook:json-valid");

    let logbook_dir = build_logbook_dir(app)?;
    let file_name = sanitize_logbook_filename(filename_hint);
    let final_path = logbook_dir.join(&file_name);
    let temp_path = logbook_dir.join(format!("{file_name}.tmp"));

    tokio::fs::write(&temp_path, trimmed.as_bytes())
        .await
        .map_err(|error| format!("download_failed: Unable to write logbook JSON: {error}"))?;
    if final_path.exists() {
        let _ = tokio::fs::remove_file(&final_path).await;
    }
    tokio::fs::rename(&temp_path, &final_path)
        .await
        .map_err(|error| format!("download_failed: Unable to store logbook JSON: {error}"))?;

    append_sync_log(&format!("logbook:write {}", final_path.display()));

    Ok(DeltaLogbookArtifact {
        file_name,
        path: final_path.to_string_lossy().into_owned(),
        bytes: trimmed.as_bytes().len(),
        content_type,
    })
}

async fn build_delta_sync_payload_from_web_result(
    app: &AppHandle,
    result: DeltaWebSyncResult,
) -> Result<DeltaSyncPayload, String> {
    let mut warnings = Vec::new();

    let xml_text = if result.xml.ok {
        let xml_text = result.xml.xml_text.unwrap_or_default();
        let trimmed = xml_text.trim_start();
        if !trimmed.starts_with('<') || !xml_text.contains("<FLIGHT>") {
            warnings.push("Delta Virtual returned an invalid schedule XML response.".into());
            None
        } else {
            Some(xml_text)
        }
    } else {
        warnings.push(
            result
                .xml
                .error
                .unwrap_or_else(|| "Delta Virtual schedule XML download failed.".into()),
        );
        None
    };

    let logbook_json = if result.logbook.ok {
        let json_text = result.logbook.json_text.unwrap_or_default();
        append_sync_log(&format!(
            "logbook:received len={} filename={}",
            json_text.len(),
            result.logbook.filename.as_deref().unwrap_or("none")
        ));
        match store_logbook_json(
            app,
            &json_text,
            result.logbook.filename.as_deref(),
            result.logbook.content_type,
        )
        .await
        {
            Ok(artifact) => Some(artifact),
            Err(error) => {
                warnings.push(error);
                None
            }
        }
    } else {
        warnings.push(
            result
                .logbook
                .error
                .unwrap_or_else(|| "Delta Virtual logbook JSON download failed.".into()),
        );
        None
    };

    let xml_status = if xml_text.is_some() {
        "success"
    } else {
        "failed"
    }
    .to_string();
    let logbook_status = if logbook_json.is_some() {
        "success"
    } else {
        "failed"
    }
    .to_string();

    if xml_text.is_none() && logbook_json.is_none() {
        return Err(format!(
            "download_failed: Delta Virtual sync failed. {}",
            summarize_warnings(&warnings)
                .unwrap_or_else(|| "No sync artifacts were downloaded.".into())
        ));
    }

    let status = if xml_text.is_some() && logbook_json.is_some() {
        "success"
    } else {
        "partial"
    }
    .to_string();

    Ok(DeltaSyncPayload {
        file_name: xml_text
            .as_ref()
            .map(|_| DELTAVA_SYNC_DOWNLOAD_FILE.to_string()),
        xml_text,
        status,
        xml_status,
        logbook_status,
        logbook_json,
        warnings,
    })
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

fn clear_user_data_internal(app: &AppHandle) -> Result<(), String> {
    close_sync_window(app);
    close_simbrief_dispatch_window(app.clone());

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        remove_path_if_exists(&app_data_dir.join(APP_STORAGE_DIR));
    }

    let _ = clear_auth_settings_internal(app);

    if let Ok(local_data_dir) = app.path().app_local_data_dir() {
        remove_path_if_exists(&local_data_dir.join("deltava-sync"));
        remove_path_if_exists(&local_data_dir.join("deltava-webview"));
        remove_path_if_exists(&local_data_dir.join(SIMBRIEF_WEBVIEW_DIR));
        remove_path_if_exists(&local_data_dir.join("EBWebView"));
    }

    remove_path_if_exists(&std::env::temp_dir().join(APP_STORAGE_DIR));
    Ok(())
}

fn close_sync_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DELTAVA_SYNC_LABEL) {
        let _ = window.close();
    }
}

async fn wait_for_sync_window_focus_return(
    app: &AppHandle,
    focus_lost_at: &std::sync::Arc<Mutex<Option<Instant>>>,
) {
    let Some(window) = app.get_webview_window(DELTAVA_SYNC_LABEL) else {
        return;
    };

    let recently_lost_focus = focus_lost_at
        .lock()
        .ok()
        .and_then(|guard| *guard)
        .map(|timestamp| {
            timestamp.elapsed() <= Duration::from_millis(DELTAVA_FOCUS_LOSS_RECENT_WINDOW_MILLIS)
        })
        .unwrap_or(false);

    if !recently_lost_focus {
        return;
    }

    append_sync_log("sync:waiting-for-focus-return");
    let deadline =
        tokio::time::Instant::now() + Duration::from_secs(DELTAVA_CLOSE_AFTER_PROMPT_WAIT_SECONDS);

    loop {
        if tokio::time::Instant::now() >= deadline {
            append_sync_log("sync:focus-return-timeout");
            break;
        }

        match window.is_focused() {
            Ok(true) => {
                append_sync_log("sync:focus-returned");
                break;
            }
            Ok(false) => {}
            Err(error) => {
                append_sync_log(&format!("sync:focus-check-failed {error}"));
                break;
            }
        }

        tokio::time::sleep(Duration::from_millis(250)).await;
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
fn read_deltava_logbook_metadata(app: AppHandle) -> DeltaLogbookMetadata {
    read_deltava_logbook_metadata_internal(&app)
}

#[tauri::command]
fn read_deltava_logbook_progress(app: AppHandle) -> DeltaLogbookProgress {
    read_deltava_logbook_progress_internal(&app)
}

#[tauri::command]
fn clear_user_data(app: AppHandle) -> Result<(), String> {
    clear_user_data_internal(&app)
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

                            if let Some(payload_text) = message.strip_prefix(DELTAVA_AUTH_MESSAGE_PREFIX) {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                append_sync_log(&format!("auth-message:received len={}", payload_text.len()));

                                tauri::async_runtime::spawn(async move {
                                    match serde_json::from_str::<DeltaWebAuthMessage>(&payload_text) {
                                        Ok(DeltaWebAuthMessage::LoginSuccess) => {
                                            append_sync_log("auth:login-success");
                                        }
                                        Ok(DeltaWebAuthMessage::StorePassword { password }) => {
                                            match save_password_to_credential_manager(&password) {
                                                Ok(()) => append_sync_log("auth:password-stored"),
                                                Err(error) => append_sync_log(&format!("auth:password-store-failed {error}")),
                                            }
                                        }
                                        Ok(DeltaWebAuthMessage::LoginFailed { reason }) => {
                                            let message = reason
                                                .as_deref()
                                                .unwrap_or("Delta Virtual login failed.");
                                            append_sync_log(&format!("auth:login-failed {message}"));
                                            app_handle.state::<DeltaSyncManager>().finish(
                                                DELTAVA_SYNC_LABEL,
                                                Err(format!("auth_failed: {message}")),
                                            );
                                            close_sync_window(&app_handle);
                                        }
                                        Err(error) => {
                                            append_sync_log(&format!(
                                                "auth:message-parse-failed {error}"
                                            ));
                                        }
                                    }
                                });
                                return Ok(());
                            }

                            if let Some(payload_text) = message.strip_prefix(DELTAVA_SYNC_RESULT_MESSAGE_PREFIX) {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                append_sync_log(&format!("sync-result:received len={}", payload_text.len()));

                                tauri::async_runtime::spawn(async move {
                                    let result = match serde_json::from_str::<DeltaWebSyncResult>(&payload_text) {
                                        Ok(web_result) => {
                                            build_delta_sync_payload_from_web_result(&app_handle, web_result).await
                                        }
                                        Err(error) => Err(format!(
                                            "download_failed: Unable to parse Delta Virtual sync result: {error}"
                                        )),
                                    };
                                    append_sync_log("sync-result:processed");

                                    app_handle
                                        .state::<DeltaSyncManager>()
                                        .finish(DELTAVA_SYNC_LABEL, result);
                                });
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
                                                file_name: Some(DELTAVA_SYNC_DOWNLOAD_FILE.into()),
                                                xml_text: Some(xml_text),
                                                status: "partial".into(),
                                                xml_status: "success".into(),
                                                logbook_status: "failed".into(),
                                                logbook_json: None,
                                                warnings: vec![
                                                    "Delta Virtual logbook JSON was not downloaded by the fallback XML capture path.".into(),
                                                ],
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
    let focus_lost_at = std::sync::Arc::new(Mutex::new(None::<Instant>));
    let focus_lost_at_for_events = focus_lost_at.clone();
    let auth_context = match read_auth_context_internal(&app) {
        Ok(context) => context,
        Err(error) => {
            append_sync_log(&format!("auth:load-failed {error}"));
            deltava_auth::DeltaVirtualAuthContext {
                settings: Default::default(),
                password: None,
            }
        }
    };
    append_sync_log(&format!(
        "auth:loaded has_password={} first_name_saved={} last_name_saved={}",
        auth_context.settings.has_password,
        !auth_context.settings.first_name.is_empty(),
        !auth_context.settings.last_name.is_empty()
    ));
    let login_automation_script = deltava_login::build_deltava_login_automation_script(&auth_context);

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
    .visible(false)
    .center()
    .data_directory(webview_data_directory)
    .on_navigation(|url| is_allowed_deltava_url(url))
    .on_page_load(move |webview_window, payload| {
        if payload.event() == tauri::webview::PageLoadEvent::Finished
            && should_probe_for_schedule(payload.url())
        {
            append_sync_log(&format!("page:finished {}", payload.url()));
            let _ = webview_window.eval(&login_automation_script);
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
                                    file_name: Some(DELTAVA_SYNC_DOWNLOAD_FILE.into()),
                                    xml_text: Some(xml_text),
                                    status: "partial".into(),
                                    xml_status: "success".into(),
                                    logbook_status: "failed".into(),
                                    logbook_json: None,
                                    warnings: vec![
                                        "Delta Virtual logbook JSON was not downloaded by the fallback XML download path.".into(),
                                    ],
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
        match event {
            WindowEvent::Focused(focused) => {
                if *focused {
                    if let Ok(mut guard) = focus_lost_at_for_events.lock() {
                        *guard = None;
                    }
                    append_sync_log("sync-window:focused");
                } else {
                    if let Ok(mut guard) = focus_lost_at_for_events.lock() {
                        *guard = Some(Instant::now());
                    }
                    append_sync_log("sync-window:blurred");
                }
            }
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                app_for_close.state::<DeltaSyncManager>().finish(
                    DELTAVA_SYNC_LABEL,
                    Err("cancelled: Delta Virtual sync window was closed before the XML was downloaded.".into()),
                );
            }
            _ => {}
        }
    });

    match tokio::time::timeout(Duration::from_secs(DELTAVA_SYNC_TIMEOUT_SECONDS), receiver).await {
        Ok(Ok(result)) => {
            wait_for_sync_window_focus_return(&app_for_page_load, &focus_lost_at).await;
            result
        }
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

    #[test]
    fn extract_latest_logbook_date_uses_last_entry_date_object() {
        let json: Value = serde_json::from_str(
            r#"{"flights": [
                {"date":{"y":2026,"m":3,"d":1},"time":"2099-01-01T00:00:00Z"},
                {"date":{"y":2026,"m":4,"d":11},"time":"2000-01-01T00:00:00Z"}
            ]}"#,
        )
        .expect("json");

        assert_eq!(
            extract_latest_logbook_date_iso(&json),
            Some("2026-05-11".to_string())
        );
    }

    #[test]
    fn extract_latest_logbook_date_uses_zero_based_months() {
        let json: Value = serde_json::from_str(
            r#"{"flights": [
                {"date":{"y":2026,"m":0,"d":31}},
                {"date":{"y":2026,"m":3,"d":11}}
            ]}"#,
        )
        .expect("json");

        assert_eq!(
            extract_latest_logbook_date_iso(&json),
            Some("2026-04-11".to_string())
        );
    }

    #[test]
    fn collect_logbook_airport_progress_tracks_departures_and_arrivals() {
        let json: Value = serde_json::from_str(
            r#"{"flights": [
                {"departureAirport":{"icao":"katl"},"arrivalAirport":{"icao":"KJFK"}},
                {"airportD":{"icao":"KLAX","name":"Los Angeles"},"airportA":{"icao":"KSFO","name":"San Francisco"}}
            ]}"#,
        )
        .expect("json");
        let mut visited_airports = BTreeSet::new();
        let mut arrival_airports = BTreeSet::new();

        for entry in find_logbook_entries(&json).expect("entries") {
            collect_logbook_airport_progress(entry, &mut visited_airports, &mut arrival_airports);
        }

        assert_eq!(
            visited_airports.into_iter().collect::<Vec<_>>(),
            vec![
                "KATL".to_string(),
                "KJFK".to_string(),
                "KLAX".to_string(),
                "KSFO".to_string()
            ]
        );
        assert_eq!(
            arrival_airports.into_iter().collect::<Vec<_>>(),
            vec!["KJFK".to_string(), "KSFO".to_string()]
        );
    }
}

fn main() {
    tauri::Builder::default()
        .manage(DeltaSyncManager::default())
        .manage(SimBriefDispatchManager::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let _ = initialize_sync_log_path(&app_handle);
            tauri::async_runtime::spawn(async move {
                prune_deltava_storage_internal(&app_handle, false, true);
            });

            if let Some(main_window) = app.get_webview_window("main") {
                restore_main_window_state(&main_window);
                let main_window_for_events = main_window.clone();

                main_window.on_window_event(move |event| match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                        persist_main_window_state(&main_window_for_events, true);
                    }
                    WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                        persist_main_window_state(&main_window_for_events, true);
                    }
                    _ => {}
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_deltava_sync,
            close_deltava_sync_window,
            prune_deltava_storage,
            read_deltava_logbook_metadata,
            read_deltava_logbook_progress,
            read_deltava_auth_settings,
            save_deltava_auth_settings,
            clear_deltava_auth_settings,
            clear_user_data,
            start_simbrief_dispatch,
            fetch_simbrief_aircraft_types,
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
