use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tokio::sync::oneshot;

#[cfg(windows)]
use webview2_com::{
    CoTaskMemPWSTR, Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4,
    WebMessageReceivedEventHandler,
};
#[cfg(windows)]
use windows::core::{Interface, PWSTR};

use crate::{
    deltava_auth::{read_auth_context_internal, save_password_to_credential_manager, DeltaVirtualAuthContext},
    deltava_login,
    resolve_app_log_path,
};

const DVA_DRAFT_LABEL: &str = "deltava-draft";
const DVA_DRAFT_WEBVIEW_DIR: &str = "deltava-draft-webview";
const DVA_DRAFT_LOGIN_URL: &str = "https://www.deltava.org/login.do";
const DVA_DRAFT_TARGET_URL: &str = "https://www.deltava.org/";
const DVA_DRAFT_RESULT_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_DVA_DRAFT_RESULT__";
const DVA_DRAFT_APP_LOG_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_DVA_DRAFT_APP_LOG__";
const DVA_DRAFT_TIMEOUT_SECONDS: u64 = 40;
const DVA_DRAFT_SUBMIT_SCRIPT_DELAY_MS: u64 = 2000;
const DVA_AUTH_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_DVA_AUTH__";
const DVA_DRAFT_ALLOWED_PAYLOAD_KEYS: [&str; 13] = [
    "airline",
    "flight",
    "leg",
    "airportD",
    "airportA",
    "eqType",
    "network",
    "pax",
    "alt",
    "remarks",
    "route",
    "simBriefID",
    "id",
];

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSubmitResult {
    pub ok: bool,
    pub status: u16,
    pub content_type: String,
    pub response_text: String,
    pub id: Option<i64>,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct DraftSubmitManager {
    active: Mutex<Option<ActiveDraftSubmit>>,
}

#[derive(Clone, Default)]
struct DraftFlowState {
    authenticated: bool,
    login_script_sent: bool,
    submit_script_sent: bool,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum DraftAuthMessage {
    LoginSuccess,
    StorePassword { password: String },
    LoginFailed { reason: Option<String> },
}

struct ActiveDraftSubmit {
    label: String,
    sender: oneshot::Sender<DraftSubmitResult>,
}

impl DraftSubmitManager {
    fn begin(
        &self,
        label: String,
        sender: oneshot::Sender<DraftSubmitResult>,
    ) -> Result<(), String> {
        let mut active = self.active.lock().map_err(|_| {
            "submit_failed: Unable to lock Delta Virtual draft submit state.".to_string()
        })?;

        if active.is_some() {
            return Err(
                "submit_failed: A Delta Virtual draft submission is already in progress.".into(),
            );
        }

        *active = Some(ActiveDraftSubmit { label, sender });
        Ok(())
    }

    fn finish(&self, label: &str, result: DraftSubmitResult) {
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

fn append_draft_log(message: &str) {
    eprintln!("[DVA Draft] {message}");
}

pub fn close_deltava_draft_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DVA_DRAFT_LABEL) {
        let _ = window.close();
    }
}

fn finish_draft_submit_result(
    app: &AppHandle,
    debug_enabled: bool,
    result: DraftSubmitResult,
) {
    let should_close = result.ok || !debug_enabled;
    app.state::<DraftSubmitManager>().finish(DVA_DRAFT_LABEL, result);
    if should_close {
        close_deltava_draft_window(app);
    }
}

fn is_allowed_deltava_draft_url(url: &tauri::webview::Url) -> bool {
    // The production draft flow stays on the www subdomain.
    url.scheme() == "https" && url.domain() == Some("www.deltava.org")
}

fn sanitize_draft_payload(payload: &Value) -> Value {
    let mut sanitized = serde_json::Map::new();
    let Some(object) = payload.as_object() else {
        return Value::Object(sanitized);
    };

    for key in DVA_DRAFT_ALLOWED_PAYLOAD_KEYS {
        if let Some(value) = object.get(key) {
            sanitized.insert(key.to_string(), value.clone());
        }
    }

    Value::Object(sanitized)
}

fn draft_payload_text(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .map(|value| match value {
            Value::String(text) => text.trim().to_string(),
            Value::Number(number) => number.to_string(),
            Value::Bool(boolean) => boolean.to_string(),
            Value::Null => String::new(),
            other => other.to_string(),
        })
        .unwrap_or_default()
}

fn is_simple_log_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.' | '/' | ':'))
}

fn truncate_log_text(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }

    let mut truncated = value.chars().take(limit.saturating_sub(3)).collect::<String>();
    truncated.push_str("...");
    truncated
}

fn redact_app_log_key(key: &str) -> bool {
    let normalized = key
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>();

    matches!(
        normalized.as_str(),
        "password" | "cookie" | "token" | "auth" | "apikey" | "authorization" | "setcookie" | "credential" | "secret"
    )
}

fn format_app_log_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(boolean) => boolean.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(text) => {
            let normalized = text.trim().replace('\r', " ").replace('\n', " ");
            let truncated = truncate_log_text(&normalized, 160);
            if is_simple_log_token(&truncated) {
                truncated
            } else {
                serde_json::to_string(&truncated).unwrap_or_else(|_| truncated)
            }
        }
        other => serde_json::to_string(other)
            .map(|text| truncate_log_text(&text, 220))
            .unwrap_or_else(|_| other.to_string()),
    }
}

fn format_app_log_data(data: Option<&Value>) -> String {
    let Some(value) = data else {
        return String::new();
    };

    let Some(object) = value.as_object() else {
        return String::new();
    };

    let entries = object
        .iter()
        .filter(|(_, value)| !value.is_null())
        .map(|(key, value)| {
            if redact_app_log_key(key) {
                format!("{key}=[REDACTED]")
            } else {
                format!("{key}={}", format_app_log_value(value))
            }
        })
        .collect::<Vec<_>>();

    if entries.is_empty() {
        String::new()
    } else {
        format!(" {}", entries.join(" "))
    }
}

fn append_app_log_line(app: &AppHandle, line: &str) -> Result<(), String> {
    let log_path = resolve_app_log_path(app)
        .map_err(|error| format!("submit_failed: {error}"))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("submit_failed: Unable to open app log file: {error}"))?;
    writeln!(file, "{line}")
        .map_err(|error| format!("submit_failed: Unable to write app log line: {error}"))?;
    Ok(())
}

fn append_draft_app_log_event(app: &AppHandle, event: &str, data: Option<&Value>) {
    let timestamp = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let line = format!("[{timestamp}] [DVA Draft] {event}{}", format_app_log_data(data));
    if let Err(error) = append_app_log_line(app, &line) {
        append_draft_log(&format!("app-log-write-failed {error}"));
    }
}

fn append_draft_submit_failed_stage(app: &AppHandle, stage: &str, error: &str) {
    let payload = json!({
        "stage": stage,
        "error": error
    });
    append_draft_app_log_event(app, "submit-failed", Some(&payload));
}

fn build_draft_webview_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| format!("submit_failed: Unable to resolve draft webview data path: {error}"))?
        .join(DVA_DRAFT_WEBVIEW_DIR);
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("submit_failed: Unable to create draft webview data path: {error}"))?;
    Ok(data_dir)
}

fn login_required_error_message() -> String {
    "session_required: Delta Virtual login required. Complete Delta Virtual login/sync and retry."
        .to_string()
}

fn build_deltava_draft_submission_script(payload_json: &str, app_log_prefix: &str) -> String {
    let payload_json = payload_json.to_string();
    let app_log_prefix = serde_json::to_string(app_log_prefix)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_DVA_DRAFT_APP_LOG__\"".to_string());
    let result_prefix = serde_json::to_string(DVA_DRAFT_RESULT_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_DVA_DRAFT_RESULT__\"".to_string());

    const TEMPLATE: &str = r#"
(() => {
  const payload = __PAYLOAD_DATA__;
  const requestPayload = (() => {
    const nextPayload = {};

    for (const key of ['airline', 'flight', 'leg', 'airportD', 'airportA', 'eqType', 'network', 'pax', 'alt', 'remarks', 'route', 'simBriefID', 'id']) {
      if (Object.prototype.hasOwnProperty.call(payload || {}, key)) {
        nextPayload[key] = payload[key];
      }
    }

    return nextPayload;
  })();
  const appLogPrefix = __APP_LOG_PREFIX__;
  const resultPrefix = __RESULT_PREFIX__;
  const allowedOrigins = new Set(['https://www.deltava.org']);

  const emitAppLog = (event, data = null) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(appLogPrefix + JSON.stringify({ event, data }));
    }
  };

  const normalizeValue = (value) => String(value || '').trim();
  const normalizePaxValue = (value) => {
    const normalized = normalizeValue(value);
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  };

  const buildPayloadMetadata = () => {
    const pax = normalizePaxValue(requestPayload.pax);
    return {
      airline: normalizeValue(requestPayload.airline),
      flight: requestPayload.flight ?? null,
      leg: requestPayload.leg ?? null,
      airportD: normalizeValue(requestPayload.airportD),
      airportA: normalizeValue(requestPayload.airportA),
      eqType: normalizeValue(requestPayload.eqType),
      network: normalizeValue(requestPayload.network),
      pax: pax === null ? '' : pax,
      alt: normalizeValue(requestPayload.alt),
      hasRoute: Boolean(normalizeValue(requestPayload.route)),
      hasSimBriefID: Boolean(normalizeValue(requestPayload.simBriefID)),
      hasDraftReportId: Boolean(requestPayload.id)
    };
  };

  const extractResponseMessage = (responseText) => {
    const text = normalizeValue(responseText);

    if (!text) {
      return '';
    }

    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        const message = typeof parsed?.message === 'string' ? parsed.message : '';
        if (message) {
          return normalizeValue(message);
        }

        const errorMessage = typeof parsed?.error === 'string' ? parsed.error : '';
        if (errorMessage) {
          return normalizeValue(errorMessage);
        }
      } catch (_) {}
    }

    const messageMatch = text.match(/<p><b>Message<\/b>\s*([^<]+)<\/p>/i);
    if (messageMatch?.[1]) {
      return normalizeValue(messageMatch[1]);
    }

    const invalidIdMatch = text.match(/Invalid Flight Report ID - \d+/i);
    if (invalidIdMatch?.[0]) {
      return normalizeValue(invalidIdMatch[0]);
    }

    return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const postResult = (result) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(resultPrefix + JSON.stringify(result));
    }
  };

  emitAppLog('location', {
    href: window.location.href,
    origin: window.location.origin
  });

  if (!allowedOrigins.has(window.location.origin)) {
    return;
  }

  if (window.__flightPlannerDeltaDraftPending) {
    return;
  }

  window.__flightPlannerDeltaDraftPending = true;
  emitAppLog('payload-ready', {
    ...buildPayloadMetadata(),
    href: window.location.href,
    origin: window.location.origin
  });

  const finish = (result) => {
    window.__flightPlannerDeltaDraftPending = false;
    postResult(result);
  };

  window.setTimeout(async () => {
    try {
      const requestUrl = `${window.location.origin}/draftsubmit.ws?ts=${Date.now()}`;
      emitAppLog('submit-request', {
        href: window.location.href,
        origin: window.location.origin,
        requestUrl
      });
      const response = await fetch(requestUrl, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(requestPayload)
      });
      const responseText = await response.text().catch(() => '');
      const responseContentType = response.headers?.get?.('content-type') || '';
      let parsedId = null;

      if (responseText) {
        try {
          const parsed = JSON.parse(responseText);
          const rawId = parsed?.id;
          const numericId = Number.parseInt(String(rawId || '').trim(), 10);
          if (Number.isFinite(numericId) && numericId > 0) {
            parsedId = numericId;
          }
        } catch (_) {}
      }

      const hasPositiveId = Number.isInteger(parsedId) && parsedId > 0;
      const parsedMessage = response.ok && hasPositiveId
        ? ''
        : (response.ok
          ? extractResponseMessage(responseText)
          : (extractResponseMessage(responseText) || `HTTP ${response.status}`));
      const result = {
        ok: Boolean(response.ok && hasPositiveId),
        status: response.status,
        contentType: responseContentType,
        sentEqType: requestPayload.eqType || '',
        parsedMessage,
        responseText,
        id: parsedId,
        error: response.ok && hasPositiveId ? null : (parsedMessage || null)
      };

      emitAppLog('submit-response', {
        status: result.status,
        contentType: result.contentType || '',
        sentEqType: result.sentEqType || '',
        parsedMessage: result.parsedMessage || '',
        returnedIdPresent: Number.isInteger(parsedId) && parsedId > 0
      });
      finish(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result = {
        ok: false,
        status: 0,
        contentType: '',
        sentEqType: requestPayload.eqType || '',
        parsedMessage: '',
        responseText: '',
        id: null,
        error: message || 'Delta Virtual draft submission failed.'
      };
      emitAppLog('submit-failed', {
        stage: 'fetch',
        error: message || 'Delta Virtual draft submission failed.'
      });
      window.__flightPlannerDeltaDraftPending = false;
      postResult(result);
    }
  }, 100);
})();
"#;

    TEMPLATE
        .replace("__PAYLOAD_DATA__", &payload_json)
        .replace("__APP_LOG_PREFIX__", &app_log_prefix)
        .replace("__RESULT_PREFIX__", &result_prefix)
}

async fn inject_deltava_draft_submit_script_after_delay(
    window: tauri::WebviewWindow,
    app: AppHandle,
    debug_enabled: bool,
    submit_script: String,
    _flight: String,
    _airport_d: String,
    _airport_a: String,
) {
    tokio::time::sleep(Duration::from_millis(DVA_DRAFT_SUBMIT_SCRIPT_DELAY_MS)).await;
    let eval_result = window.eval(&submit_script);

    if let Err(error) = eval_result {
        let submit_error = format!("Unable to inject Delta Virtual draft submit script: {error}");
        append_draft_submit_failed_stage(&app, "script-eval", &submit_error);
        finish_draft_submit_result(
            &app,
            debug_enabled,
            DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some(submit_error),
            },
        );
    }
}

fn schedule_deltava_draft_submit_script(
    window: tauri::WebviewWindow,
    app: AppHandle,
    debug_enabled: bool,
    flow_state: Arc<Mutex<DraftFlowState>>,
    submit_script: String,
    flight: String,
    airport_d: String,
    airport_a: String,
) {
    let should_schedule = flow_state
        .lock()
        .ok()
        .map(|mut state| {
            if state.submit_script_sent {
                false
            } else {
                state.submit_script_sent = true;
                true
            }
        })
        .unwrap_or(false);

    if !should_schedule {
        return;
    }

    tauri::async_runtime::spawn(inject_deltava_draft_submit_script_after_delay(
        window,
        app,
        debug_enabled,
        submit_script,
        flight,
        airport_d,
        airport_a,
    ));
}

async fn run_deltava_draft_submission_attempt(
    app: &AppHandle,
    debug_enabled: bool,
    payload_json: &str,
    flight: &str,
    airport_d: &str,
    airport_a: &str,
) -> DraftSubmitResult {
    let flight_for_log = flight.to_string();
    let airport_d_for_log = airport_d.to_string();
    let airport_a_for_log = airport_a.to_string();

    let auth_context = match read_auth_context_internal(app) {
        Ok(context) => context,
        Err(_) => DeltaVirtualAuthContext {
            settings: Default::default(),
            password: None,
        },
    };
    let login_script = deltava_login::build_deltava_login_automation_script(
        &auth_context,
        DVA_DRAFT_LOGIN_URL,
        DVA_DRAFT_TARGET_URL,
    );
    let submit_script = build_deltava_draft_submission_script(
        payload_json,
        DVA_DRAFT_APP_LOG_MESSAGE_PREFIX,
    );

    let login_url = match DVA_DRAFT_LOGIN_URL.parse::<tauri::webview::Url>() {
        Ok(url) => url,
        Err(error) => {
            let error = format!("Invalid Delta Virtual login URL: {error}");
            append_draft_submit_failed_stage(app, "login-url", &error);
            return DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some(error),
            };
        }
    };

    let (sender, receiver) = oneshot::channel();
    {
        let draft_manager = app.state::<DraftSubmitManager>();
        if let Err(error) = draft_manager.begin(DVA_DRAFT_LABEL.to_string(), sender) {
            append_draft_submit_failed_stage(app, "draft-manager", &error);
            return DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some(error),
            };
        }
    }

    let webview_data_directory = match build_draft_webview_data_directory(app) {
        Ok(path) => path,
        Err(error) => {
            append_draft_submit_failed_stage(app, "webview-open", &error);
            finish_draft_submit_result(
                app,
                debug_enabled,
                DraftSubmitResult {
                    ok: false,
                    status: 0,
                    content_type: String::new(),
                    response_text: String::new(),
                    id: None,
                    error: Some(error.clone()),
                },
            );
            return DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some(error),
            };
        }
    };

    let flow_state = Arc::new(Mutex::new(DraftFlowState::default()));
    let app_for_window_event = app.clone();
    let app_for_page_load = app.clone();
    let flow_state_for_page_load = flow_state.clone();
    let flow_state_for_event = flow_state.clone();
    let flight_for_page_load = flight_for_log.clone();
    let airport_d_for_page_load = airport_d_for_log.clone();
    let airport_a_for_page_load = airport_a_for_log.clone();
    let submit_script_for_page_load = submit_script.clone();

    append_draft_app_log_event(
        app,
        "webview-build-started",
        Some(&json!({
            "loginUrl": DVA_DRAFT_LOGIN_URL,
            "targetUrl": DVA_DRAFT_TARGET_URL
        })),
    );
    let window = match WebviewWindowBuilder::new(
        app,
        DVA_DRAFT_LABEL,
        WebviewUrl::External("about:blank".parse().unwrap()),
    )
        .title("Delta Virtual Draft Report")
        .inner_size(520.0, 760.0)
        .min_inner_size(460.0, 680.0)
        .resizable(true)
        .visible(false)
        .center()
        .data_directory(webview_data_directory)
        .on_navigation(|url| is_allowed_deltava_draft_url(url))
        .on_page_load(move |webview_window, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished
                || !is_allowed_deltava_draft_url(payload.url())
            {
                return;
            }

            let current_url = payload.url().to_string();
            let is_login_page = current_url.starts_with(DVA_DRAFT_LOGIN_URL);
            let state_snapshot = flow_state_for_page_load.lock().ok().map(|state| state.clone());

            if is_login_page {
                if let Some(state) = state_snapshot.as_ref() {
                    if state.authenticated || state.login_script_sent {
                        return;
                    }
                }

                if let Ok(mut state) = flow_state_for_page_load.lock() {
                    if state.login_script_sent {
                        return;
                    }
                    state.login_script_sent = true;
                }

                append_draft_app_log_event(
                    &app_for_page_load,
                    "login-started",
                    Some(&json!({
                        "status": "started"
                    })),
                );
                let eval_result = webview_window.eval(&login_script);
                if let Err(error) = eval_result {
                    let submit_error = format!("Unable to inject Delta Virtual login script: {error}");
                    append_draft_submit_failed_stage(&app_for_page_load, "login-script", &submit_error);
                    finish_draft_submit_result(
                        &app_for_page_load,
                        debug_enabled,
                        DraftSubmitResult {
                            ok: false,
                            status: 0,
                            content_type: String::new(),
                            response_text: String::new(),
                            id: None,
                            error: Some(submit_error),
                        },
                    );
                }
                return;
            }

            if let Some(state) = state_snapshot.as_ref() {
                if !state.authenticated && !state.login_script_sent {
                    return;
                }
            }

            schedule_deltava_draft_submit_script(
                webview_window.clone(),
                app_for_page_load.clone(),
                debug_enabled,
                flow_state_for_page_load.clone(),
                submit_script_for_page_load.clone(),
                flight_for_page_load.clone(),
                airport_d_for_page_load.clone(),
                airport_a_for_page_load.clone(),
            );
        })
        .build()
    {
        Ok(window) => window,
        Err(error) => {
            let error = format!("Unable to open Delta Virtual draft window: {error}");
            append_draft_submit_failed_stage(app, "webview-open", &error);
            finish_draft_submit_result(
                app,
                debug_enabled,
                DraftSubmitResult {
                    ok: false,
                    status: 0,
                    content_type: String::new(),
                    response_text: String::new(),
                    id: None,
                    error: Some(error.clone()),
                },
            );
            return DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some(error),
            };
        }
    };

    if let Err(error) = attach_windows_draft_message_handler(
        &window,
        window.clone(),
        app.clone(),
        debug_enabled,
        flow_state_for_event.clone(),
        submit_script.clone(),
        flight_for_log.clone(),
        airport_d_for_log.clone(),
        airport_a_for_log.clone(),
    ) {
        append_draft_submit_failed_stage(app, "message-handler", &error);
        finish_draft_submit_result(
            app,
            debug_enabled,
            DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some(error.clone()),
            },
        );
        return DraftSubmitResult {
            ok: false,
            status: 0,
            content_type: String::new(),
            response_text: String::new(),
            id: None,
            error: Some(error),
        };
    }
    let _ = window.navigate(login_url.clone());

    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            let session_is_active = app_for_window_event
                .state::<DraftSubmitManager>()
                .active
                .lock()
                .ok()
                .map(|active| active.is_some())
                .unwrap_or(false);
            if !session_is_active {
                return;
            }

            let error = login_required_error_message();
            append_draft_submit_failed_stage(&app_for_window_event, "window-closed", &error);
            finish_draft_submit_result(
                &app_for_window_event,
                debug_enabled,
                DraftSubmitResult {
                    ok: false,
                    status: 0,
                    content_type: String::new(),
                    response_text: String::new(),
                    id: None,
                    error: Some(error),
                },
            );
        }
        _ => {}
    });

    match tokio::time::timeout(Duration::from_secs(DVA_DRAFT_TIMEOUT_SECONDS), receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            finish_draft_submit_result(
                app,
                debug_enabled,
                DraftSubmitResult {
                    ok: false,
                    status: 0,
                    content_type: String::new(),
                    response_text: String::new(),
                    id: None,
                    error: Some("Delta Virtual draft submission stopped unexpectedly.".into()),
                },
            );
            DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some("Delta Virtual draft submission stopped unexpectedly.".into()),
            }
        }
        Err(_) => {
            append_draft_submit_failed_stage(app, "timeout", "Delta Virtual draft submission timed out.");
            finish_draft_submit_result(
                app,
                debug_enabled,
                DraftSubmitResult {
                    ok: false,
                    status: 0,
                    content_type: String::new(),
                    response_text: String::new(),
                    id: None,
                    error: Some("Delta Virtual draft submission timed out.".into()),
                },
            );
            DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some("Delta Virtual draft submission timed out.".into()),
            }
        }
    }
}

#[cfg(windows)]
fn attach_windows_draft_message_handler(
    window: &tauri::WebviewWindow,
    draft_window: tauri::WebviewWindow,
    app: AppHandle,
    debug_enabled: bool,
    flow_state: Arc<Mutex<DraftFlowState>>,
    submit_script: String,
    flight_for_log: String,
    airport_d_for_log: String,
    airport_a_for_log: String,
) -> Result<(), String> {
    let registration_error = std::sync::Arc::new(Mutex::new(None::<String>));
    let registration_error_for_closure = registration_error.clone();

    window
        .with_webview(move |platform| unsafe {
            let result = (|| -> Result<(), String> {
                let webview = platform
                    .controller()
                    .CoreWebView2()
                    .map_err(|error| format!("submit_failed: Unable to access WebView2 instance: {error}"))?;
                let settings = webview
                    .Settings()
                    .map_err(|error| format!("submit_failed: Unable to access WebView2 settings: {error}"))?;

                if let Ok(settings4) = settings.cast::<ICoreWebView2Settings4>() {
                    let _ = settings4.SetIsPasswordAutosaveEnabled(true);
                    let _ = settings4.SetIsGeneralAutofillEnabled(true);
                }

                let app_handle = app.clone();
                let mut token = 0i64;

                webview
                    .add_WebMessageReceived(
                        &WebMessageReceivedEventHandler::create(Box::new(
                            move |_, args| {
                                let Some(args) = args else {
                                    return Ok(());
                                };

                                let mut message = PWSTR::null();
                                args.TryGetWebMessageAsString(&mut message)?;
                                let message = CoTaskMemPWSTR::from(message).to_string();

                                if let Some(app_log_text) = message.strip_prefix(DVA_DRAFT_APP_LOG_MESSAGE_PREFIX) {
                                    match serde_json::from_str::<Value>(app_log_text) {
                                        Ok(payload) => {
                                            if let Some(event) = payload.get("event").and_then(Value::as_str) {
                                                append_draft_app_log_event(&app_handle, event, payload.get("data"));
                                            }
                                        }
                                        Err(_) => {}
                                    }
                                    return Ok(());
                                }

                if let Some(payload_text) = message.strip_prefix(DVA_AUTH_MESSAGE_PREFIX) {
                    let payload_text = payload_text.to_string();
                    let app_handle = app_handle.clone();
                    let draft_window = draft_window.clone();
                    let flow_state = flow_state.clone();
                    let submit_script = submit_script.clone();
                    let flight_for_log = flight_for_log.clone();
                    let airport_d_for_log = airport_d_for_log.clone();
                    let airport_a_for_log = airport_a_for_log.clone();

                    tauri::async_runtime::spawn(async move {
                        match serde_json::from_str::<DraftAuthMessage>(&payload_text) {
                            Ok(DraftAuthMessage::LoginSuccess) => {
                                let mut should_navigate = false;
                                let mut should_log_login_finished = false;
                                if let Ok(mut state) = flow_state.lock() {
                                    if !state.authenticated {
                                        state.authenticated = true;
                                        should_navigate = true;
                                        should_log_login_finished = true;
                                    }
                                }

                                if should_log_login_finished {
                                    append_draft_app_log_event(
                                        &app_handle,
                                        "login-finished",
                                        Some(&json!({
                                            "status": "success"
                                        })),
                                    );
                                }

                                if should_navigate {
                                    let _ = draft_window.eval("window.location.assign('https://www.deltava.org/');");
                                    schedule_deltava_draft_submit_script(
                                        draft_window.clone(),
                                        app_handle.clone(),
                                        debug_enabled,
                                        flow_state.clone(),
                                        submit_script.clone(),
                                        flight_for_log.clone(),
                                        airport_d_for_log.clone(),
                                        airport_a_for_log.clone(),
                                    );
                                }
                            }
                            Ok(DraftAuthMessage::StorePassword { password }) => {
                                if let Err(error) = save_password_to_credential_manager(&password) {
                                    append_draft_submit_failed_stage(&app_handle, "login-password", &error);
                                    finish_draft_submit_result(
                                        &app_handle,
                                        debug_enabled,
                                        DraftSubmitResult {
                                            ok: false,
                                            status: 0,
                                            content_type: String::new(),
                                            response_text: String::new(),
                                            id: None,
                                            error: Some(login_required_error_message()),
                                        },
                                    );
                                    return;
                                }

                                let mut should_navigate = false;
                                let mut should_log_login_finished = false;
                                if let Ok(mut state) = flow_state.lock() {
                                    if !state.authenticated {
                                        state.authenticated = true;
                                        should_navigate = true;
                                        should_log_login_finished = true;
                                    }
                                }

                                if should_log_login_finished {
                                    append_draft_app_log_event(
                                        &app_handle,
                                        "login-finished",
                                        Some(&json!({
                                            "status": "success"
                                        })),
                                    );
                                }

                                if should_navigate {
                                    let _ = draft_window.eval("window.location.assign('https://www.deltava.org/');");
                                    schedule_deltava_draft_submit_script(
                                        draft_window.clone(),
                                        app_handle.clone(),
                                        debug_enabled,
                                        flow_state.clone(),
                                        submit_script.clone(),
                                        flight_for_log.clone(),
                                        airport_d_for_log.clone(),
                                        airport_a_for_log.clone(),
                                    );
                                }
                            }
                            Ok(DraftAuthMessage::LoginFailed { reason }) => {
                                let message = reason
                                    .as_deref()
                                    .unwrap_or("Delta Virtual login failed.")
                                    .to_string();
                                append_draft_submit_failed_stage(&app_handle, "login", &message);
                                finish_draft_submit_result(
                                    &app_handle,
                                    debug_enabled,
                                    DraftSubmitResult {
                                        ok: false,
                                        status: 0,
                                        content_type: String::new(),
                                        response_text: String::new(),
                                        id: None,
                                        error: Some(login_required_error_message()),
                                    },
                                );
                            }
                            Err(error) => {
                                append_draft_submit_failed_stage(&app_handle, "login-parse", &error.to_string());
                                finish_draft_submit_result(
                                    &app_handle,
                                    debug_enabled,
                                    DraftSubmitResult {
                                        ok: false,
                                        status: 0,
                                        content_type: String::new(),
                                        response_text: String::new(),
                                        id: None,
                                        error: Some(login_required_error_message()),
                                    },
                                );
                            }
                        }
                    });
                    return Ok(());
                }

                if let Some(payload_text) = message.strip_prefix(DVA_DRAFT_RESULT_MESSAGE_PREFIX) {
                    let payload_text = payload_text.to_string();
                    let app_handle = app_handle.clone();
                    let debug_enabled = debug_enabled;

                                    tauri::async_runtime::spawn(async move {
                                        match serde_json::from_str::<DraftSubmitResult>(&payload_text) {
                                            Ok(result) => {
                                                if result.ok {
                                                    let mut data = serde_json::Map::new();
                                                    data.insert("status".to_string(), json!(result.status));
                                                    data.insert(
                                                        "returnedIdPresent".to_string(),
                                                        json!(result.id.filter(|value| *value > 0).is_some()),
                                                    );
                                                    data.insert(
                                                        "contentType".to_string(),
                                                        json!(result.content_type.clone()),
                                                    );
                                                    let payload = Value::Object(data);
                                                    append_draft_app_log_event(
                                                        &app_handle,
                                                        "submit-succeeded",
                                                        Some(&payload),
                                                    );
                                                } else {
                                                    let payload = json!({
                                                        "status": result.status,
                                                        "contentType": result.content_type.clone(),
                                                        "returnedIdPresent": false,
                                                        "parsedError": result.error.clone().unwrap_or_default()
                                                    });
                                                    append_draft_app_log_event(
                                                        &app_handle,
                                                        "submit-failed",
                                                        Some(&payload),
                                                    );
                                                }
                                                finish_draft_submit_result(&app_handle, debug_enabled, result);
                                            }
                                            Err(error) => {
                                                let payload = json!({
                                                    "status": 0,
                                                    "parsedError": format!("parse-failed: {error}")
                                                });
                                                append_draft_app_log_event(
                                                    &app_handle,
                                                    "submit-failed",
                                                    Some(&payload),
                                                );
                                                finish_draft_submit_result(
                                                    &app_handle,
                                                    debug_enabled,
                                                    DraftSubmitResult {
                                                        ok: false,
                                                        status: 0,
                                                        content_type: String::new(),
                                                        response_text: String::new(),
                                                        id: None,
                                                        error: Some(format!("parse-failed: {error}")),
                                                    },
                                                );
                                            }
                                        }
                                    });
                                    return Ok(());
                                }

                                Ok(())
                            },
                        )),
                        &mut token,
                    )
                    .map_err(|error| format!("submit_failed: Unable to register draft webview message handler: {error}"))?;

                Ok(())
            })();

            if let Err(error) = result {
                if let Ok(mut guard) = registration_error_for_closure.lock() {
                    *guard = Some(error);
                }
            }
        })
        .map_err(|error| format!("submit_failed: Unable to attach draft webview message handler: {error}"))?;

    if let Some(error) = registration_error
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
    {
        return Err(error);
    }

    Ok(())
}

#[cfg(not(windows))]
fn attach_windows_draft_message_handler(
    _window: &tauri::WebviewWindow,
    _draft_window: tauri::WebviewWindow,
    _app: AppHandle,
    _debug_enabled: bool,
    _flow_state: Arc<Mutex<DraftFlowState>>,
    _submit_script: String,
    _flight_for_log: String,
    _airport_d_for_log: String,
    _airport_a_for_log: String,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn submit_deltava_draft_flight_report(
    app: AppHandle,
    payload: Value,
    debug_enabled: bool,
) -> DraftSubmitResult {
    let payload = sanitize_draft_payload(&payload);

    let payload_json = match serde_json::to_string(&payload) {
        Ok(json) => json,
        Err(error) => {
            let error = format!("Unable to serialize draft payload: {error}");
            append_draft_submit_failed_stage(&app, "payload-serialize", &error);
            return DraftSubmitResult {
                ok: false,
                status: 0,
                content_type: String::new(),
                response_text: String::new(),
                id: None,
                error: Some(error),
            };
        }
    };

    let flight = draft_payload_text(&payload, "flight");
    let airport_d = draft_payload_text(&payload, "airportD");
    let airport_a = draft_payload_text(&payload, "airportA");

    let validation_errors = {
        let airline = payload
            .get("airline")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let flight = payload
            .get("flight")
            .and_then(Value::as_i64)
            .unwrap_or_default();
        let airport_d = payload
            .get("airportD")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let airport_a = payload
            .get("airportA")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let eq_type = payload
            .get("eqType")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let network = payload
            .get("network")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();

        let mut errors = Vec::new();
        if airline.is_empty() {
            errors.push("airline is missing".to_string());
        }
        if flight <= 0 {
            errors.push("flight number is missing or invalid".to_string());
        }
        if airport_d.is_empty() {
            errors.push("departure airport is missing".to_string());
        }
        if airport_a.is_empty() {
            errors.push("arrival airport is missing".to_string());
        }
        if eq_type.is_empty() {
            errors.push("equipment type is missing".to_string());
        }
        if network != "Offline" && network != "VATSIM" {
            errors.push("network must be Offline or VATSIM".to_string());
        }
        errors
    };

    if !validation_errors.is_empty() {
        let error = format!("validation_failed: {}", validation_errors.join("; "));
        append_draft_submit_failed_stage(&app, "validation", &error);
        return DraftSubmitResult {
            ok: false,
            status: 0,
            content_type: String::new(),
            response_text: String::new(),
            id: None,
            error: Some(error),
        };
    }

    #[cfg(not(windows))]
    {
        let error = "Delta Virtual draft submission is only available on Windows.".to_string();
        append_draft_submit_failed_stage(&app, "platform", &error);
        return DraftSubmitResult {
            ok: false,
            status: 0,
            content_type: String::new(),
            response_text: String::new(),
            id: None,
            error: Some(error),
        };
    }

    run_deltava_draft_submission_attempt(
        &app,
        debug_enabled,
        &payload_json,
        &flight,
        &airport_d,
        &airport_a,
    )
    .await
}
