#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tokio::sync::oneshot;
#[cfg(windows)]
use webview2_com::{
    CoTaskMemPWSTR, WebMessageReceivedEventHandler,
};
#[cfg(windows)]
use windows::core::PWSTR;

const DELTAVA_LOGIN_URL: &str = "https://www.deltava.org/login.do";
const DELTAVA_SYNC_LABEL: &str = "deltava-sync";
const DELTAVA_SYNC_TIMEOUT_SECONDS: u64 = 300;
const DELTAVA_XML_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_PFPX_XML__";
const DELTAVA_DEBUG_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_SYNC_DEBUG__";
const APP_STORAGE_DIR: &str = "flight-planner";
const IMPORT_ERRORS_LOG_FILE: &str = "import_errors.txt";
static DELTAVA_SYNC_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

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

fn is_allowed_deltava_url(url: &tauri::webview::Url) -> bool {
    url.scheme() == "https" && url.domain() == Some("www.deltava.org")
}

fn is_schedule_download_url(url: &tauri::webview::Url) -> bool {
    is_allowed_deltava_url(url) && url.path() == "/pfpxsched.ws"
}

fn should_probe_for_schedule(url: &tauri::webview::Url) -> bool {
    is_allowed_deltava_url(url) && url.path() != "/pfpxsched.ws"
}

fn build_download_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("download_failed: Unable to resolve app data path: {error}"))?;
    let download_dir = base_dir.join("deltava-sync").join("downloads");
    fs::create_dir_all(&download_dir)
        .map_err(|error| format!("download_failed: Unable to create sync directory: {error}"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    Ok(download_dir.join(format!("deltava-pfpxsched-{timestamp}.xml")))
}

fn resolve_default_log_path() -> Option<PathBuf> {
    let storage_dir = std::env::temp_dir().join(APP_STORAGE_DIR);
    let _ = fs::create_dir_all(&storage_dir);
    Some(storage_dir.join(IMPORT_ERRORS_LOG_FILE))
}

fn initialize_sync_log_path(app: &AppHandle) -> Option<PathBuf> {
    if let Some(existing) = DELTAVA_SYNC_LOG_PATH.get() {
        return Some(existing.clone());
    }

    let resolved = match app.path().app_local_data_dir() {
        Ok(base_dir) => {
            let storage_dir = base_dir.join(APP_STORAGE_DIR);
            if fs::create_dir_all(&storage_dir).is_ok() {
                Some(storage_dir.join(IMPORT_ERRORS_LOG_FILE))
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
        if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(log_path) {
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

fn close_sync_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DELTAVA_SYNC_LABEL) {
        let _ = window.close();
    }
}

#[tauri::command]
fn close_deltava_sync_window(app: AppHandle) {
    close_sync_window(&app);
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

    let window = WebviewWindowBuilder::new(&app, DELTAVA_SYNC_LABEL, WebviewUrl::External(login_url))
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
        .on_download(move |_webview, event| {
            match event {
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
                                        Err("invalid_xml: Delta Virtual returned a non-schedule response.".into())
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
            }
        })
        .build()
        .map_err(|error| format!("download_failed: Unable to open Delta Virtual sync window: {error}"))?;

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
                Err("auth_failed: Timed out waiting for Delta Virtual login or schedule download.".into()),
            );
            close_sync_window(&app_for_page_load);
            Err("auth_failed: Timed out waiting for Delta Virtual login or schedule download.".into())
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(DeltaSyncManager::default())
        .invoke_handler(tauri::generate_handler![
            start_deltava_sync,
            close_deltava_sync_window
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running flight planner app");
}
