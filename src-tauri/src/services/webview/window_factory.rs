use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::services::deltava::constants::DELTAVA_LOGBOOK_REFRESH_RESULT_MESSAGE_PREFIX;
use crate::services::deltava::sync_types::{
    DeltaWebDebugMessage, DeltaWebLogbookRefreshResult, DeltaWebSyncResult,
    DeltaWebXmlCaptureMessage, MAX_DELTAVA_DEBUG_MESSAGE_BYTES,
    MAX_DELTAVA_LOGBOOK_REFRESH_WEB_MESSAGE_BYTES, MAX_DELTAVA_SYNC_WEB_MESSAGE_BYTES,
    MAX_DELTAVA_XML_CAPTURE_WEB_MESSAGE_BYTES,
};
use crate::{
    app::state::DeltaSyncFinishOutcome, append_sync_log, append_sync_log_debug, DeltaSyncManager,
    DeltaSyncPayload, DELTAVA_DEBUG_MESSAGE_PREFIX, DELTAVA_SYNC_DOWNLOAD_FILE,
    DELTAVA_SYNC_RESULT_MESSAGE_PREFIX, DELTAVA_XML_MESSAGE_PREFIX,
};

pub(crate) const DELTAVA_SYNC_LABEL: &str = "deltava-sync";
const DELTAVA_LOGIN_URL: &str = "https://www.deltava.org/login.do";
const DELTAVA_FOCUS_LOSS_RECENT_WINDOW_MILLIS: u64 = 3000;
const DELTAVA_CLOSE_AFTER_PROMPT_WAIT_SECONDS: u64 = 30;

fn log_ignored_finish(source: &str, outcome: DeltaSyncFinishOutcome) {
    if matches!(outcome, DeltaSyncFinishOutcome::SessionMismatch) {
        static IGNORED_STALE_FINISHES: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
        let cache = IGNORED_STALE_FINISHES.get_or_init(|| Mutex::new(HashSet::new()));
        if let Ok(mut seen) = cache.lock() {
            let key = source.to_string();
            if !seen.insert(key) {
                return;
            }
        }
    }

    append_sync_log(&format!(
        "DVA sync finish ignored: source={source} outcome={outcome:?}"
    ));
}

fn is_allowed_deltava_url(url: &tauri::webview::Url) -> bool {
    url.scheme() == "https" && url.domain() == Some("www.deltava.org")
}

fn is_schedule_download_url(url: &tauri::webview::Url) -> bool {
    is_allowed_deltava_url(url) && url.path() == "/pfpxsched.ws"
}

/// Returns true for Delta Virtual pages where the sync script should run.
pub(crate) fn should_probe_for_schedule(url: &tauri::webview::Url) -> bool {
    is_allowed_deltava_url(url)
}

/// Closes the dedicated Delta sync window if it is currently open.
pub(crate) fn close_deltava_sync_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DELTAVA_SYNC_LABEL) {
        let _ = window.close();
    }
}

async fn wait_for_sync_window_focus_return(
    app: &AppHandle,
    focus_lost_at: &Arc<Mutex<Option<Instant>>>,
    _debug_enabled: bool,
) {
    append_sync_log("sync-focus-return-started");

    let Some(window) = app.get_webview_window(DELTAVA_SYNC_LABEL) else {
        append_sync_log("sync-focus-return-succeeded reason=window-missing");
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
        append_sync_log("sync-focus-return-succeeded reason=no-recent-focus-loss");
        return;
    }

    let deadline =
        tokio::time::Instant::now() + Duration::from_secs(DELTAVA_CLOSE_AFTER_PROMPT_WAIT_SECONDS);

    loop {
        if tokio::time::Instant::now() >= deadline {
            append_sync_log("sync-focus-return-failed reason=timeout");
            break;
        }

        match window.is_focused() {
            Ok(true) => {
                append_sync_log("sync-focus-return-succeeded");
                break;
            }
            Ok(false) => {}
            Err(error) => {
                append_sync_log(&format!("sync-focus-return-failed error={error}"));
                break;
            }
        }

        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}

/// Runs the Delta sync focus cleanup in the background so sync result delivery never blocks.
pub(crate) fn spawn_deltava_sync_focus_return_cleanup(
    app: AppHandle,
    focus_lost_at: Arc<Mutex<Option<Instant>>>,
    debug_enabled: bool,
) {
    tauri::async_runtime::spawn(async move {
        wait_for_sync_window_focus_return(&app, &focus_lost_at, debug_enabled).await;
    });
}

#[cfg(windows)]
fn attach_windows_xml_message_handler(
    window: &WebviewWindow,
    app: AppHandle,
    download_path: PathBuf,
    sync_nonce: String,
    debug_enabled: bool,
) -> Result<(), String> {
    use std::sync::Mutex as StdMutex;

    use webview2_com::{
        CoTaskMemPWSTR, Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4,
        WebMessageReceivedEventHandler,
    };
    use windows::core::{Interface, PWSTR};

    let registration_error = Arc::new(StdMutex::new(None::<String>));
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
                    let _ = settings4.SetIsPasswordAutosaveEnabled(false);
                    let _ = settings4.SetIsGeneralAutofillEnabled(false);
                    append_sync_log_debug(debug_enabled, "webview:settings4-autofill-disabled");
                } else {
                    append_sync_log_debug(debug_enabled, "webview:settings4-unavailable");
                }

                let app_handle = app.clone();
                let xml_path = download_path.clone();
                let sync_nonce = sync_nonce.clone();
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
                                if debug_line.len() > MAX_DELTAVA_DEBUG_MESSAGE_BYTES {
                                    return Ok(());
                                }
                                if let Ok(debug_line) = serde_json::from_str::<DeltaWebDebugMessage>(debug_line) {
                                    if debug_line.nonce == sync_nonce {
                                        append_sync_log_debug(
                                            debug_enabled,
                                            &format!("webview:{}", debug_line.message),
                                        );
                                    }
                                }
                                return Ok(());
                            }

                            if let Some(payload_text) = message.strip_prefix(crate::DELTAVA_AUTH_MESSAGE_PREFIX) {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let sync_nonce = sync_nonce.clone();

                                tauri::async_runtime::spawn(async move {
                                    match serde_json::from_str::<crate::services::deltava::login::DvaLoginMessage>(&payload_text) {
                                                Ok(message) if message.nonce == sync_nonce => {
                                                    let crate::services::deltava::login::DvaLoginMessage {
                                                        kind,
                                                        reason,
                                                        password,
                                                        .. 
                                                    } = message;

                                                    match kind {
                                                        crate::services::deltava::login::DvaLoginMessageKind::LoginSuccess => {
                                                            append_sync_log_debug(debug_enabled, "auth-succeeded");
                                                        }
                                                        crate::services::deltava::login::DvaLoginMessageKind::StorePassword => {
                                                            if let Some(password) = password.as_deref() {
                                                                match crate::services::deltava::auth::save_password_to_credential_manager(password) {
                                                                    Ok(()) => append_sync_log_debug(debug_enabled, "auth-succeeded"),
                                                                    Err(error) => append_sync_log(&format!("auth-failed error={error}")),
                                                                }
                                                            }
                                                        }
                                                crate::services::deltava::login::DvaLoginMessageKind::LoginFailed => {
                                                    let reason = reason
                                                        .as_deref()
                                                        .unwrap_or("Delta Virtual login failed.");
                                                    append_sync_log(&format!("auth-failed error={reason}"));
                                                    let outcome = app_handle.state::<DeltaSyncManager>().finish(
                                                        DELTAVA_SYNC_LABEL,
                                                        &sync_nonce,
                                                        Err(format!("auth_failed: {reason}")),
                                                    );
                                                    if outcome != DeltaSyncFinishOutcome::Completed {
                                                        log_ignored_finish("web-result", outcome);
                                                    }
                                                    close_deltava_sync_window(&app_handle);
                                                }
                                            }
                                        }
                                        _ => {}
                                    }
                                });
                                return Ok(());
                            }

                            if let Some(payload_text) = message.strip_prefix(DELTAVA_SYNC_RESULT_MESSAGE_PREFIX) {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let sync_nonce = sync_nonce.clone();

                                if payload_text.len() > MAX_DELTAVA_SYNC_WEB_MESSAGE_BYTES {
                                    let outcome = app_handle
                                        .state::<DeltaSyncManager>()
                                        .finish(
                                            DELTAVA_SYNC_LABEL,
                                            &sync_nonce,
                                            Err("download_failed: Delta Virtual response was too large.".into()),
                                        );
                                    if outcome != DeltaSyncFinishOutcome::Completed {
                                        log_ignored_finish("web-result-too-large", outcome);
                                    }
                                    return Ok(());
                                }

                                tauri::async_runtime::spawn(async move {
                                    let result = match serde_json::from_str::<DeltaWebSyncResult>(&payload_text) {
                                        Ok(web_result) if web_result.nonce == sync_nonce => {
                                            crate::services::deltava::sync_payload::build_delta_sync_payload_from_web_result(
                                                &app_handle,
                                                web_result,
                                                debug_enabled,
                                            )
                                            .await
                                        }
                                        Ok(_) => return,
                                        Err(error) => Err(format!(
                                            "download_failed: Unable to parse Delta Virtual sync result: {error}"
                                        )),
                                    };
                                    if result.is_ok() {
                                        append_sync_log("sync-result-ready");
                                        append_sync_log_debug(debug_enabled, "succeeded stage=sync-result");
                                    } else {
                                        append_sync_log_debug(debug_enabled, "failed stage=sync-result");
                                    }

                                    let outcome = app_handle
                                        .state::<DeltaSyncManager>()
                                        .finish(DELTAVA_SYNC_LABEL, &sync_nonce, result);
                                    if outcome != DeltaSyncFinishOutcome::Completed {
                                        log_ignored_finish("web-result", outcome);
                                    }
                                });
                                return Ok(());
                            }

                            if let Some(payload_text) =
                                message.strip_prefix(DELTAVA_LOGBOOK_REFRESH_RESULT_MESSAGE_PREFIX)
                            {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let sync_nonce = sync_nonce.clone();

                                if payload_text.len() > MAX_DELTAVA_LOGBOOK_REFRESH_WEB_MESSAGE_BYTES {
                                    let outcome = app_handle
                                        .state::<DeltaSyncManager>()
                                        .finish(
                                            DELTAVA_SYNC_LABEL,
                                            &sync_nonce,
                                            Err("download_failed: Delta Virtual response was too large.".into()),
                                        );
                                    if outcome != DeltaSyncFinishOutcome::Completed {
                                        log_ignored_finish("logbook-refresh-too-large", outcome);
                                    }
                                    return Ok(());
                                }

                                tauri::async_runtime::spawn(async move {
                                    let result = match serde_json::from_str::<DeltaWebLogbookRefreshResult>(&payload_text)
                                    {
                                        Ok(web_result) if web_result.nonce == sync_nonce => {
                                            crate::services::deltava::sync_payload::build_delta_logbook_refresh_payload_from_web_result(
                                                &app_handle,
                                                web_result,
                                                debug_enabled,
                                            )
                                            .await
                                        }
                                        Ok(_) => return,
                                        Err(error) => Err(format!(
                                            "download_failed: Unable to parse Delta Virtual logbook refresh result: {error}"
                                        )),
                                    };
                                    if result.is_ok() {
                                        append_sync_log("logbook-refresh-result-ready");
                                        append_sync_log_debug(
                                            debug_enabled,
                                            "succeeded stage=logbook-refresh-result",
                                        );
                                    } else {
                                        append_sync_log_debug(
                                            debug_enabled,
                                            "failed stage=logbook-refresh-result",
                                        );
                                    }

                                    let outcome = app_handle
                                        .state::<DeltaSyncManager>()
                                        .finish(DELTAVA_SYNC_LABEL, &sync_nonce, result);
                                    if outcome != DeltaSyncFinishOutcome::Completed {
                                        log_ignored_finish("logbook-refresh-result", outcome);
                                    }
                                });
                                return Ok(());
                            }

                            if let Some(payload_text) = message.strip_prefix(DELTAVA_XML_MESSAGE_PREFIX) {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let xml_path = xml_path.clone();
                                let sync_nonce = sync_nonce.clone();

                                if payload_text.len() > MAX_DELTAVA_XML_CAPTURE_WEB_MESSAGE_BYTES {
                                    let outcome = app_handle
                                        .state::<DeltaSyncManager>()
                                        .finish(
                                            DELTAVA_SYNC_LABEL,
                                            &sync_nonce,
                                            Err("download_failed: Delta Virtual response was too large.".into()),
                                        );
                                    if outcome != DeltaSyncFinishOutcome::Completed {
                                        log_ignored_finish("xml-capture-too-large", outcome);
                                    }
                                    return Ok(());
                                }

                                tauri::async_runtime::spawn(async move {
                                    let Ok(message) = serde_json::from_str::<DeltaWebXmlCaptureMessage>(&payload_text) else {
                                        return;
                                    };
                                    if message.nonce != sync_nonce {
                                        return;
                                    }

                                    let xml_text = message.xml_text;
                                    let trimmed = xml_text.trim_start().to_string();
                                    append_sync_log_debug(debug_enabled, "schedule-fetch-requested");
                                    let result = if !trimmed.starts_with('<') || !xml_text.contains("<FLIGHT>") {
                                        Err("invalid_xml: Delta Virtual returned a non-schedule response.".to_string())
                                    } else {
                                        match tokio::fs::write(&xml_path, &xml_text).await {
                                            Ok(_) => Ok(DeltaSyncPayload {
                                                file_name: Some(DELTAVA_SYNC_DOWNLOAD_FILE.into()),
                                                xml_text: Some(xml_text),
                                                status: "partial".into(),
                                                xml_status: "success".into(),
                                                logbook_status: "failed".into(),
                                                profile_status: "skipped".into(),
                                                accomplishment_eligibility: None,
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
                                    if result.is_ok() {
                                        append_sync_log("succeeded stage=xml-capture");
                                    } else {
                                        append_sync_log("failed stage=xml-capture");
                                    }

                                    let outcome = app_handle
                                        .state::<DeltaSyncManager>()
                                        .finish(DELTAVA_SYNC_LABEL, &sync_nonce, result);
                                    if outcome != DeltaSyncFinishOutcome::Completed {
                                        log_ignored_finish("xml-capture", outcome);
                                    }
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

/// Builds the dedicated Delta Virtual sync window and wires all webview handlers.
pub(crate) fn build_deltava_sync_window(
    app: AppHandle,
    webview_data_directory: PathBuf,
    download_path: PathBuf,
    sync_nonce: String,
    debug_enabled: bool,
    login_automation_script: String,
    auto_sync_script: String,
    focus_lost_at: Arc<Mutex<Option<Instant>>>,
) -> Result<WebviewWindow, String> {
    let login_url = DELTAVA_LOGIN_URL
        .parse()
        .map_err(|error| format!("download_failed: Invalid Delta Virtual login URL: {error}"))?;

    let app_for_download = app.clone();
    let app_for_close = app.clone();
    let download_path_for_download_hook = download_path.clone();
    let focus_lost_at_for_events = focus_lost_at.clone();
    let sync_nonce_for_download = sync_nonce.clone();
    let sync_nonce_for_xml = sync_nonce.clone();
    let sync_nonce_for_close = sync_nonce.clone();

    let window = WebviewWindowBuilder::new(&app, DELTAVA_SYNC_LABEL, WebviewUrl::External(login_url))
        .title("Delta Virtual Sync")
        .inner_size(520.0, 760.0)
        .min_inner_size(460.0, 680.0)
        .resizable(true)
        .visible(false)
        .center()
        .data_directory(webview_data_directory)
        .on_navigation(|url| is_allowed_deltava_url(url))
        .on_page_load(move |webview_window, payload| {
            let event_name = match payload.event() {
                tauri::webview::PageLoadEvent::Started => "Started",
                tauri::webview::PageLoadEvent::Finished => "Finished",
            };
            let url = payload.url().to_string();
            let should_probe = should_probe_for_schedule(payload.url());
            append_sync_log_debug(
                debug_enabled,
                &format!("webview:page-load event={event_name} url={url} probe={should_probe}"),
            );

            if payload.event() == tauri::webview::PageLoadEvent::Finished && should_probe {
                match webview_window.eval(&login_automation_script) {
                    Ok(()) => append_sync_log_debug(debug_enabled, "webview:eval:login:ok"),
                    Err(error) => append_sync_log_debug(
                        debug_enabled,
                        &format!("webview:eval:login:failed error={error}"),
                    ),
                }
                match webview_window.eval(&auto_sync_script) {
                    Ok(()) => append_sync_log_debug(debug_enabled, "webview:eval:auto-sync:ok"),
                    Err(error) => append_sync_log_debug(
                        debug_enabled,
                        &format!("webview:eval:auto-sync:failed error={error}"),
                    ),
                }
            }
        })
        .on_download(move |_webview, event| match event {
            tauri::webview::DownloadEvent::Requested { url, destination } => {
                append_sync_log_debug(debug_enabled, "schedule-fetch-requested");
                if !is_schedule_download_url(&url) {
                    return false;
                }

                *destination = download_path_for_download_hook.clone();
                true
            }
            tauri::webview::DownloadEvent::Finished { url, path, success } => {
                if !is_schedule_download_url(&url) {
                    return true;
                }

                let resolved_path = path.unwrap_or_else(|| download_path_for_download_hook.clone());
                let app_handle = app_for_download.clone();
                let sync_nonce = sync_nonce_for_download.clone();

                tauri::async_runtime::spawn(async move {
                    let result = if success {
                        match tokio::fs::read_to_string(&resolved_path).await {
                            Ok(xml_text) => {
                                let trimmed = xml_text.trim_start();
                                if !trimmed.starts_with('<') || !xml_text.contains("<FLIGHT>") {
                                    Err(
                                        "invalid_xml: Delta Virtual returned a non-schedule response."
                                            .into(),
                                    )
                                } else {
                                    Ok(DeltaSyncPayload {
                                        file_name: Some(DELTAVA_SYNC_DOWNLOAD_FILE.into()),
                                        xml_text: Some(xml_text),
                                        status: "partial".into(),
                                        xml_status: "success".into(),
                                        logbook_status: "failed".into(),
                                        profile_status: "skipped".into(),
                                        accomplishment_eligibility: None,
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

                    if result.is_ok() {
                        if let Ok(metadata) = tokio::fs::metadata(&resolved_path).await {
                            append_sync_log(&format!(
                                "schedule-fetch-succeeded source=download bytes={}",
                                metadata.len()
                            ));
                        } else {
                            append_sync_log("schedule-fetch-succeeded source=download bytes=0");
                        }
                    } else {
                        append_sync_log("failed");
                    }

                    let outcome = app_handle
                        .state::<DeltaSyncManager>()
                        .finish(DELTAVA_SYNC_LABEL, &sync_nonce, result);
                    if outcome != DeltaSyncFinishOutcome::Completed {
                        log_ignored_finish("download", outcome);
                    }
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
    attach_windows_xml_message_handler(
        &window,
        app.clone(),
        download_path.clone(),
        sync_nonce_for_xml.clone(),
        debug_enabled,
    )?;

    append_sync_log_debug(debug_enabled, "sync:webview-ready");

    window.on_window_event(move |event| match event {
        WindowEvent::Focused(focused) => {
            if *focused {
                if let Ok(mut guard) = focus_lost_at_for_events.lock() {
                    *guard = None;
                }
                append_sync_log_debug(debug_enabled, "sync-window:focused");
            } else {
                if let Ok(mut guard) = focus_lost_at_for_events.lock() {
                    *guard = Some(Instant::now());
                }
                append_sync_log_debug(debug_enabled, "sync-window:blurred");
            }
        }
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            let sync_nonce = sync_nonce_for_close.clone();
            let outcome = app_for_close.state::<DeltaSyncManager>().finish(
                DELTAVA_SYNC_LABEL,
                &sync_nonce,
                Err("cancelled: Delta Virtual sync window was closed before the XML was downloaded.".into()),
            );
            if outcome != DeltaSyncFinishOutcome::Completed {
                log_ignored_finish("window-close", outcome);
            }
        }
        _ => {}
    });

    Ok(window)
}
