use crate::deltava_auth::read_auth_context_internal;
use crate::deltava_login::build_deltava_login_automation_script;
use crate::{
    append_sync_log, build_webview_data_directory, is_allowed_deltava_url, new_dva_nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;
#[cfg(windows)]
use webview2_com::{
    CoTaskMemPWSTR, Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4,
    WebMessageReceivedEventHandler,
};
#[cfg(windows)]
use windows::core::{Interface, PWSTR};

const DELTAVA_TOUR_BRIEFING_LABEL_PREFIX: &str = "dva-tour-briefing";
const DELTAVA_TOUR_BRIEFING_TIMEOUT_SECONDS: u64 = 120;
const DELTAVA_TOUR_BRIEFING_RESULT_MESSAGE_PREFIX: &str =
    "__FLIGHT_PLANNER_DVA_TOUR_BRIEFING_RESULT__";
const DELTAVA_TOUR_BRIEFING_DEBUG_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_SYNC_DEBUG__";
const DELTAVA_LOGIN_URL: &str = "https://www.deltava.org/login.do";
const DELTAVA_HOME_URL: &str = "https://www.deltava.org/";

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaVirtualTourBriefingRequest {
    pub briefing_url: Option<String>,
    pub tour_id: Option<String>,
    pub source_id: Option<String>,
    pub hex_id: Option<String>,
    pub tour_path: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaVirtualTourBriefingResult {
    pub briefing_url: String,
    pub content_type: String,
    pub filename: String,
    pub base64: String,
    pub size_bytes: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaTourBriefingResultEnvelope {
    nonce: String,
    ok: bool,
    briefing_url: String,
    content_type: String,
    filename: String,
    base64: String,
    size_bytes: usize,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaWebDebugMessage {
    nonce: String,
    message: String,
}

#[derive(Clone, Debug, Default)]
struct BriefingFetchState {
    login_script_sent: bool,
    fetch_script_sent: bool,
}

fn normalize_text(value: &str) -> String {
    value.trim().to_string()
}

fn normalize_hex_id(value: &str) -> Option<String> {
    let normalized = normalize_text(value).to_lowercase();
    if normalized.is_empty() {
        return None;
    }

    if let Some(stripped) = normalized.strip_prefix("0x") {
        if !stripped.is_empty() && stripped.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return Some(format!("0x{}", stripped));
        }
    }

    if normalized.chars().all(|ch| ch.is_ascii_digit()) {
        return normalized
            .parse::<u64>()
            .ok()
            .map(|value| format!("0x{:x}", value));
    }

    if normalized.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Some(format!("0x{}", normalized));
    }

    None
}

fn extract_numeric_like_id(value: &str) -> Option<String> {
    let normalized = normalize_text(value);
    if normalized.is_empty() {
        return None;
    }

    if normalized.chars().all(|ch| ch.is_ascii_digit()) {
        return Some(normalized);
    }

    normalized
        .rsplit(':')
        .next()
        .filter(|segment| segment.chars().all(|ch| ch.is_ascii_digit()))
        .map(ToString::to_string)
}

fn resolve_briefing_url(request: &DeltaVirtualTourBriefingRequest) -> Result<String, String> {
    if let Some(raw_url) = request.briefing_url.as_deref() {
        return validate_briefing_url(raw_url);
    }

    let derived_hex_id = normalize_hex_id(request.hex_id.as_deref().unwrap_or_default())
        .or_else(|| normalize_hex_id(request.source_id.as_deref().unwrap_or_default()))
        .or_else(|| normalize_hex_id(request.tour_id.as_deref().unwrap_or_default()))
        .or_else(|| {
            extract_numeric_like_id(request.tour_path.as_deref().unwrap_or_default())
                .and_then(|value| normalize_hex_id(&value))
        })
        .or_else(|| {
            extract_numeric_like_id(request.source_id.as_deref().unwrap_or_default())
                .and_then(|value| normalize_hex_id(&value))
        })
        .or_else(|| {
            extract_numeric_like_id(request.tour_id.as_deref().unwrap_or_default())
                .and_then(|value| normalize_hex_id(&value))
        });

    let Some(hex_id) = derived_hex_id else {
        return Err(
            "download_failed: Unable to resolve a Delta Virtual briefing URL or hex tour id."
                .into(),
        );
    };

    let briefing_url = format!("https://www.deltava.org/attach/tbrief/{hex_id}");
    validate_briefing_url(&briefing_url)
}

fn validate_briefing_url(raw_url: &str) -> Result<String, String> {
    let normalized = normalize_text(raw_url);
    if normalized.is_empty() {
        return Err("download_failed: Briefing URL was empty.".into());
    }

    let url = if normalized.starts_with("/attach/tbrief/") {
        Url::parse(&format!("https://www.deltava.org{normalized}"))
            .map_err(|error| format!("download_failed: Invalid Delta Virtual briefing URL: {error}"))?
    } else {
        Url::parse(&normalized)
            .map_err(|error| format!("download_failed: Invalid Delta Virtual briefing URL: {error}"))?
    };

    let allowed_host = url
        .host_str()
        .map(|host| host.eq_ignore_ascii_case("deltava.org") || host.eq_ignore_ascii_case("www.deltava.org"))
        .unwrap_or(false);

    if url.scheme() != "https"
        || !allowed_host
        || !url.path().starts_with("/attach/tbrief/")
    {
        return Err("download_failed: Delta Virtual briefing URL was not allowed.".into());
    }

    Ok(url.to_string())
}

fn build_briefing_fetch_script(briefing_url: &str, nonce: &str) -> String {
    let briefing_url = serde_json::to_string(briefing_url).unwrap_or_else(|_| "\"\"".to_string());
    let nonce = serde_json::to_string(nonce).unwrap_or_else(|_| "\"\"".to_string());
    let result_prefix = serde_json::to_string(DELTAVA_TOUR_BRIEFING_RESULT_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_DVA_TOUR_BRIEFING_RESULT__\"".to_string());
    let debug_prefix = serde_json::to_string(DELTAVA_TOUR_BRIEFING_DEBUG_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_SYNC_DEBUG__\"".to_string());

    const TEMPLATE: &str = r#"
(() => {
  const briefingUrl = __BRIEFING_URL__;
  const nonce = __NONCE__;
  const resultPrefix = __RESULT_PREFIX__;
  const debugPrefix = __DEBUG_PREFIX__;

  const emitDebug = (message) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(debugPrefix + JSON.stringify({ nonce, message }));
    }
  };

  const postResult = (payload) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(resultPrefix + JSON.stringify({ nonce, ...payload }));
    }
  };

  const toBase64 = (bytes) => {
    let binary = '';
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      const slice = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...slice);
    }

    return btoa(binary);
  };

  const parseFilename = (contentDisposition) => {
    const raw = String(contentDisposition || '').trim();
    if (!raw) {
      return '';
    }

    const starMatch = raw.match(/filename\*\s*=\s*[^']*''([^;]+)/i);
    if (starMatch?.[1]) {
      try {
        return decodeURIComponent(starMatch[1].trim());
      } catch (_) {
        return starMatch[1].trim();
      }
    }

    const simpleMatch = raw.match(/filename\s*=\s*"?([^";]+)"?/i);
    return simpleMatch?.[1] ? simpleMatch[1].trim() : '';
  };

  const buildFallbackFilename = () => {
    const path = new URL(briefingUrl).pathname.split('/').filter(Boolean).pop() || 'briefing';
    return path.toLowerCase().endsWith('.pdf') ? path : `${path || 'briefing'}.pdf`;
  };

  const fetchBriefing = async () => {
    emitDebug(`briefing-fetch:start:${briefingUrl}`);
    try {
      const response = await fetch(briefingUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const contentType = String(response.headers.get('content-type') || '').trim();
      const contentDisposition = String(response.headers.get('content-disposition') || '').trim();
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isPdfMagic =
        bytes.length >= 4 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46;
      const isPdfContentType = /application\/pdf/i.test(contentType);
      const isOctetStream = /application\/octet-stream/i.test(contentType);

      if (response.status !== 200) {
        postResult({
          ok: false,
          briefingUrl,
          contentType,
          filename: '',
          base64: '',
          sizeBytes: bytes.length,
          error: `HTTP ${response.status}`
        });
        return;
      }

      if (!isPdfContentType && !(isOctetStream && isPdfMagic) && !isPdfMagic) {
        postResult({
          ok: false,
          briefingUrl,
          contentType,
          filename: '',
          base64: '',
          sizeBytes: bytes.length,
          error: 'Delta Virtual briefing response was not a PDF.'
        });
        return;
      }

      postResult({
        ok: true,
        briefingUrl,
        contentType: isPdfContentType || isOctetStream ? contentType || 'application/pdf' : 'application/pdf',
        filename: parseFilename(contentDisposition) || buildFallbackFilename(),
        base64: toBase64(bytes),
        sizeBytes: bytes.length,
        error: null
      });
    } catch (error) {
      postResult({
        ok: false,
        briefingUrl,
        contentType: '',
        filename: '',
        base64: '',
        sizeBytes: 0,
        error: error?.message || String(error)
      });
    }
  };

  fetchBriefing();
})();
"#;

    TEMPLATE
        .replace("__BRIEFING_URL__", &briefing_url)
        .replace("__NONCE__", &nonce)
        .replace("__RESULT_PREFIX__", &result_prefix)
        .replace("__DEBUG_PREFIX__", &debug_prefix)
}

fn close_briefing_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
}

#[cfg(windows)]
fn attach_windows_briefing_message_handler(
    window: &WebviewWindow,
    app: AppHandle,
    sync_nonce: String,
    briefing_window_label: String,
    sender: Arc<Mutex<Option<oneshot::Sender<Result<DeltaVirtualTourBriefingResult, String>>>>>,
) -> Result<(), String> {
    let registration_error = Arc::new(Mutex::new(None::<String>));
    let registration_error_for_closure = registration_error.clone();

    window
        .with_webview(move |platform| unsafe {
            let result = (|| -> Result<(), String> {
                let webview = platform
                    .controller()
                    .CoreWebView2()
                    .map_err(|error| {
                        format!("download_failed: Unable to access WebView2 instance: {error}")
                    })?;
                let settings = webview
                    .Settings()
                    .map_err(|error| format!("download_failed: Unable to access WebView2 settings: {error}"))?;
                if let Ok(settings4) = settings.cast::<ICoreWebView2Settings4>() {
                    let _ = settings4.SetIsPasswordAutosaveEnabled(false);
                    let _ = settings4.SetIsGeneralAutofillEnabled(false);
                }

                let app_handle = app.clone();
                let sync_nonce = sync_nonce.clone();
                let briefing_window_label = briefing_window_label.clone();
                let sender = sender.clone();
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

                            if let Some(debug_line) =
                                message.strip_prefix(DELTAVA_TOUR_BRIEFING_DEBUG_MESSAGE_PREFIX)
                            {
                                if let Ok(debug_line) =
                                    serde_json::from_str::<DeltaWebDebugMessage>(debug_line)
                                {
                                    if debug_line.nonce == sync_nonce {
                                        append_sync_log(&format!("webview:{}", debug_line.message));
                                    }
                                }
                                return Ok(());
                            }

                            if let Some(payload_text) =
                                message.strip_prefix(crate::DELTAVA_AUTH_MESSAGE_PREFIX)
                            {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let sync_nonce = sync_nonce.clone();
                                let sender_for_task = sender.clone();
                                let briefing_window_label_for_task = briefing_window_label.clone();

                                tauri::async_runtime::spawn(async move {
                                    match serde_json::from_str::<crate::deltava_login::DvaLoginMessage>(&payload_text) {
                                        Ok(message) if message.nonce == sync_nonce => {
                                            let crate::deltava_login::DvaLoginMessage {
                                                kind,
                                                reason,
                                                password,
                                                ..
                                            } = message;

                                            match kind {
                                                crate::deltava_login::DvaLoginMessageKind::LoginSuccess => {
                                                    append_sync_log("auth-succeeded");
                                                }
                                                crate::deltava_login::DvaLoginMessageKind::StorePassword => {
                                                    if let Some(password) = password.as_deref() {
                                                        let _ = crate::deltava_auth::save_password_to_credential_manager(password);
                                                    }
                                                }
                                                crate::deltava_login::DvaLoginMessageKind::LoginFailed => {
                                                    let reason = reason
                                                        .as_deref()
                                                        .unwrap_or("Delta Virtual login failed.");
                                                    append_sync_log(&format!("auth-failed error={reason}"));
                                                    if let Some(sender) = sender_for_task.lock().ok().and_then(|mut slot| slot.take()) {
                                                        let _ = sender.send(Err(format!("auth_failed: {reason}")));
                                                    }
                                                    close_briefing_window(&app_handle, &briefing_window_label_for_task);
                                                }
                                            }
                                        }
                                        _ => {}
                                    }
                                });
                                return Ok(());
                            }

                            if let Some(payload_text) = message.strip_prefix(
                                DELTAVA_TOUR_BRIEFING_RESULT_MESSAGE_PREFIX,
                            ) {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let briefing_window_label = briefing_window_label.clone();
                                let sender = sender.clone();
                                let sync_nonce = sync_nonce.clone();
                                let sender_for_task = sender.clone();
                                let briefing_window_label_for_task = briefing_window_label.clone();

                                tauri::async_runtime::spawn(async move {
                                    match serde_json::from_str::<DeltaTourBriefingResultEnvelope>(&payload_text) {
                                        Ok(envelope) if envelope.nonce == sync_nonce => {
                                            if envelope.ok {
                                                let decoded = match STANDARD.decode(envelope.base64.as_bytes()) {
                                                    Ok(bytes) => bytes,
                                                    Err(error) => {
                                                        if let Some(sender) = sender_for_task.lock().ok().and_then(|mut slot| slot.take()) {
                                                            let _ = sender.send(Err(format!(
                                                                "download_failed: Unable to decode Delta Virtual briefing PDF: {error}"
                                                            )));
                                                        }
                                                        close_briefing_window(&app_handle, &briefing_window_label_for_task);
                                                        return;
                                                    }
                                                };

                                                if decoded.len() < 4 || &decoded[0..4] != b"%PDF" {
                                                    if let Some(sender) = sender_for_task.lock().ok().and_then(|mut slot| slot.take()) {
                                                        let _ = sender.send(Err(
                                                            "download_failed: Delta Virtual briefing response was not a PDF."
                                                                .into(),
                                                        ));
                                                    }
                                                    close_briefing_window(&app_handle, &briefing_window_label_for_task);
                                                    return;
                                                }

                                                let content_type = envelope.content_type.trim().to_string();
                                                let normalized_content_type = content_type.to_ascii_lowercase();
                                                if !normalized_content_type.starts_with("application/pdf")
                                                    && !normalized_content_type.starts_with("application/octet-stream")
                                                {
                                                    if let Some(sender) = sender_for_task.lock().ok().and_then(|mut slot| slot.take()) {
                                                        let _ = sender.send(Err(
                                                            "download_failed: Delta Virtual briefing response had an invalid content type."
                                                                .into(),
                                                        ));
                                                    }
                                                    close_briefing_window(&app_handle, &briefing_window_label_for_task);
                                                    return;
                                                }

                                                let result = DeltaVirtualTourBriefingResult {
                                                    briefing_url: envelope.briefing_url,
                                                    content_type: if normalized_content_type.starts_with("application/octet-stream") {
                                                        "application/pdf".to_string()
                                                    } else {
                                                        content_type
                                                    },
                                                    filename: envelope.filename,
                                                    base64: envelope.base64,
                                                    size_bytes: envelope.size_bytes,
                                                };
                                                if let Some(sender) = sender_for_task.lock().ok().and_then(|mut slot| slot.take()) {
                                                    let _ = sender.send(Ok(result));
                                                }
                                                close_briefing_window(&app_handle, &briefing_window_label_for_task);
                                            } else {
                                                let error = envelope.error.unwrap_or_else(|| {
                                                    "Delta Virtual briefing download failed.".to_string()
                                                });
                                                if let Some(sender) = sender_for_task.lock().ok().and_then(|mut slot| slot.take()) {
                                                    let _ = sender.send(Err(format!(
                                                        "download_failed: {error}"
                                                    )));
                                                }
                                                close_briefing_window(&app_handle, &briefing_window_label_for_task);
                                            }
                                        }
                                        Ok(_) => {}
                                        Err(error) => {
                                            if let Some(sender) = sender_for_task.lock().ok().and_then(|mut slot| slot.take()) {
                                                let _ = sender.send(Err(format!(
                                                    "download_failed: Unable to parse Delta Virtual briefing result: {error}"
                                                )));
                                            }
                                            close_briefing_window(&app_handle, &briefing_window_label_for_task);
                                        }
                                    }
                                });
                                return Ok(());
                            }

                            Ok(())
                        })),
                        &mut token,
                    )
                    .map_err(|error| {
                        format!(
                            "download_failed: Unable to register Delta Virtual briefing listener: {error}"
                        )
                    })?;

                Ok(())
            })();

            if let Err(error) = result {
                if let Ok(mut slot) = registration_error_for_closure.lock() {
                    *slot = Some(error);
                }
            }
        })
        .map_err(|error| {
            format!("download_failed: Unable to attach Delta Virtual briefing capture: {error}")
        })?;

    if let Ok(mut slot) = registration_error.lock() {
        if let Some(error) = slot.take() {
            return Err(error);
        }
    }

    Ok(())
}

#[cfg(windows)]
async fn fetch_delta_virtual_tour_briefing_windows(
    app: AppHandle,
    request: DeltaVirtualTourBriefingRequest,
) -> Result<DeltaVirtualTourBriefingResult, String> {
    let briefing_url = resolve_briefing_url(&request)?;
    let sync_nonce = new_dva_nonce();
    let briefing_window_label = format!("{DELTAVA_TOUR_BRIEFING_LABEL_PREFIX}-{sync_nonce}");
    let webview_data_directory = build_webview_data_directory(&app)?;

    let auth_context = match read_auth_context_internal(&app) {
        Ok(context) => context,
        Err(error) => {
            append_sync_log(&format!("auth-failed error={error}"));
            crate::deltava_auth::DeltaVirtualAuthContext {
                settings: Default::default(),
                password: None,
            }
        }
    };

    let login_automation_script = build_deltava_login_automation_script(
        &auth_context,
        DELTAVA_LOGIN_URL,
        DELTAVA_HOME_URL,
        &sync_nonce,
    );
    let briefing_fetch_script = build_briefing_fetch_script(&briefing_url, &sync_nonce);
    let flow_state = Arc::new(Mutex::new(BriefingFetchState::default()));
    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));

    close_briefing_window(&app, &briefing_window_label);

    let login_url = DELTAVA_LOGIN_URL
        .parse()
        .map_err(|error| format!("download_failed: Invalid Delta Virtual login URL: {error}"))?;

    let window = WebviewWindowBuilder::new(
        &app,
        &briefing_window_label,
        WebviewUrl::External(login_url),
    )
    .title("Delta Virtual Tour Briefing")
    .inner_size(420.0, 320.0)
    .min_inner_size(320.0, 240.0)
    .resizable(true)
    .visible(false)
    .center()
    .data_directory(webview_data_directory)
    .on_navigation(|url| is_allowed_deltava_url(url))
    .on_page_load({
        let flow_state = flow_state.clone();
        move |webview_window, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished
                || !is_allowed_deltava_url(payload.url())
            {
                return;
            }

            let current_url = payload.url().to_string();
            let is_login_page = current_url.starts_with(DELTAVA_LOGIN_URL);
            let state_snapshot = flow_state.lock().ok().map(|state| state.clone());

            if is_login_page {
                if let Some(state) = state_snapshot.as_ref() {
                    if state.login_script_sent {
                        return;
                    }
                }

                if let Ok(mut state) = flow_state.lock() {
                    if state.login_script_sent {
                        return;
                    }
                    state.login_script_sent = true;
                }

                let _ = webview_window.eval(&login_automation_script);
                return;
            }

            if let Some(state) = state_snapshot.as_ref() {
                if state.fetch_script_sent {
                    return;
                }
            }

            if let Ok(mut state) = flow_state.lock() {
                if state.fetch_script_sent {
                    return;
                }
                state.fetch_script_sent = true;
            }

            let _ = webview_window.eval(&briefing_fetch_script);
        }
    })
    .build()
    .map_err(|error| format!("download_failed: Unable to open Delta Virtual briefing window: {error}"))?;

    attach_windows_briefing_message_handler(
        &window,
        app.clone(),
        sync_nonce.clone(),
        briefing_window_label.clone(),
        sender.clone(),
    )?;

    let timeout = tokio::time::timeout(
        Duration::from_secs(DELTAVA_TOUR_BRIEFING_TIMEOUT_SECONDS),
        receiver,
    )
    .await
    .map_err(|_| {
        close_briefing_window(&app, &briefing_window_label);
        "download_failed: Delta Virtual briefing request timed out.".to_string()
    })?;

    match timeout {
        Ok(result) => result,
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(not(windows))]
async fn fetch_delta_virtual_tour_briefing_windows(
    _: AppHandle,
    _: DeltaVirtualTourBriefingRequest,
) -> Result<DeltaVirtualTourBriefingResult, String> {
    Err("download_failed: Delta Virtual briefing downloads are only supported on Windows.".into())
}

#[tauri::command]
pub async fn fetch_delta_virtual_tour_briefing(
    app: AppHandle,
    request: DeltaVirtualTourBriefingRequest,
) -> Result<DeltaVirtualTourBriefingResult, String> {
    fetch_delta_virtual_tour_briefing_windows(app, request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_hex_id_derives_expected_value() {
        assert_eq!(normalize_hex_id("50"), Some("0x32".to_string()));
        assert_eq!(normalize_hex_id("0x32"), Some("0x32".to_string()));
        assert_eq!(normalize_hex_id("32"), Some("0x20".to_string()));
    }

    #[test]
    fn validate_briefing_url_accepts_only_dva_paths() {
        assert!(
            validate_briefing_url("https://www.deltava.org/attach/tbrief/0x32")
                .expect("valid briefing url")
                .contains("/attach/tbrief/0x32")
        );
        assert!(validate_briefing_url("/attach/tbrief/0x32").is_ok());
        assert!(validate_briefing_url("https://example.com/attach/tbrief/0x32").is_err());
    }

    #[test]
    fn resolve_briefing_url_derives_from_numeric_ids() {
        let request = DeltaVirtualTourBriefingRequest {
            tour_id: Some("50".to_string()),
            ..Default::default()
        };

        let url = resolve_briefing_url(&request).expect("derived briefing url");
        assert_eq!(url, "https://www.deltava.org/attach/tbrief/0x32");
    }
}
