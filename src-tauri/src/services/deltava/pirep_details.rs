use chrono::Utc;
use scraper::{Html, Selector};
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

use crate::services::deltava::url::is_allowed_deltava_url;
use crate::{append_sync_log, build_webview_data_directory, new_dva_nonce};

const DELTAVA_PIREP_DETAILS_LABEL_PREFIX: &str = "deltava-pirep-details";
const DELTAVA_PIREP_DETAILS_TIMEOUT_SECONDS: u64 = 25;
const DELTAVA_PIREP_DETAILS_RESULT_MESSAGE_PREFIX: &str =
    "__FLIGHT_PLANNER_DVA_PIREP_DETAILS_RESULT__";
const DELTAVA_PIREP_DETAILS_DEBUG_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_SYNC_DEBUG__";
const DELTAVA_PIREP_URL_PREFIX: &str = "https://www.deltava.org/pirep.do?id=";

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaVirtualPirepDetailsRequest {
    pub pirep_id: serde_json::Value,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaVirtualPirepDetailsResult {
    pub id: String,
    pub numeric_id: u64,
    pub source_url: String,
    pub departure_route: String,
    pub flight_route: String,
    pub arrival_route: String,
    pub route_summary: String,
    pub departure_runway: String,
    pub departure_runway_raw: String,
    pub arrival_runway: String,
    pub arrival_runway_raw: String,
    pub fetched_at: String,
}

#[derive(Clone, Debug, Default)]
struct ParsedPirepDetails {
    departure_route: String,
    flight_route: String,
    arrival_route: String,
    departure_runway_raw: String,
    arrival_runway_raw: String,
    found_labels: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaWebDebugMessage {
    nonce: String,
    message: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaPirepDetailsResultEnvelope {
    nonce: String,
    ok: bool,
    final_url: String,
    html_text: String,
    error: Option<String>,
}

fn normalize_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ").trim().to_string()
}

fn normalize_hex_id(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Number(number) => number.as_u64().map(|numeric| format!("0x{:x}", numeric)),
        serde_json::Value::String(text) => normalize_hex_id_text(text),
        _ => None,
    }
}

fn normalize_hex_id_text(value: &str) -> Option<String> {
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
        return normalized.parse::<u64>().ok().map(|numeric| format!("0x{:x}", numeric));
    }

    None
}

fn resolve_pirep_url(request: &DeltaVirtualPirepDetailsRequest) -> Result<(String, u64), String> {
    let Some(hex_id) = normalize_hex_id(&request.pirep_id) else {
        return Err("validation_failed: Delta Virtual PIREP id was missing or invalid.".into());
    };

    let numeric_id = if let Some(stripped) = hex_id.strip_prefix("0x") {
        u64::from_str_radix(stripped, 16).unwrap_or_default()
    } else {
        0
    };

    Ok((format!("{DELTAVA_PIREP_URL_PREFIX}{hex_id}"), numeric_id))
}

fn normalize_cell_text(raw: &str) -> String {
    normalize_text(raw)
}

fn normalize_runway_value(raw: &str) -> String {
    let normalized = normalize_text(raw);
    let Ok(regex) = regex::Regex::new(r"^([0-9]{1,2}[LCR]?|[A-Z0-9]{1,4}[LCR]?)\b") else {
        return normalized;
    };

    regex
        .captures(&normalized)
        .and_then(|captures| captures.get(1))
        .map(|match_value| match_value.as_str().to_string())
        .unwrap_or(normalized)
}

fn build_route_summary(departure_route: &str, flight_route: &str, arrival_route: &str) -> String {
    [departure_route, flight_route, arrival_route]
        .into_iter()
        .map(normalize_text)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_pirep_detail_html(html_text: &str) -> ParsedPirepDetails {
    let document = Html::parse_document(html_text);
    let row_selector = Selector::parse("tr").expect("valid row selector");
    let cell_selector = Selector::parse("td, th").expect("valid cell selector");

    let mut parsed = ParsedPirepDetails::default();

    for row in document.select(&row_selector) {
        let cells = row.select(&cell_selector).collect::<Vec<_>>();
        if cells.len() < 2 {
            continue;
        }

        let label = normalize_cell_text(&cells[0].text().collect::<String>());
        let value = normalize_cell_text(&cells[1].text().collect::<String>());

        match label.as_str() {
            "Departure Route" => {
                parsed.departure_route = value;
                parsed.found_labels += 1;
            }
            "Flight Route" => {
                parsed.flight_route = value;
                parsed.found_labels += 1;
            }
            "Arrival Route" => {
                parsed.arrival_route = value;
                parsed.found_labels += 1;
            }
            "Takeoff Runway" => {
                parsed.departure_runway_raw = value;
                parsed.found_labels += 1;
            }
            "Landing Runway" => {
                parsed.arrival_runway_raw = value;
                parsed.found_labels += 1;
            }
            _ => {}
        }
    }

    parsed
}

fn build_result_from_html(
    source_url: String,
    numeric_id: u64,
    html_text: &str,
) -> Result<DeltaVirtualPirepDetailsResult, String> {
    let lower_html = html_text.to_ascii_lowercase();
    if lower_html.contains("security violation") || lower_html.contains("login") {
        return Err("auth_required: Delta Virtual session is not available. Run DVA sync first.".into());
    }

    let parsed = parse_pirep_detail_html(html_text);
    let route_summary = build_route_summary(
        &parsed.departure_route,
        &parsed.flight_route,
        &parsed.arrival_route,
    );
    let departure_runway = normalize_runway_value(&parsed.departure_runway_raw);
    let arrival_runway = normalize_runway_value(&parsed.arrival_runway_raw);

    Ok(DeltaVirtualPirepDetailsResult {
        id: source_url
            .rsplit('=')
            .next()
            .map(str::to_string)
            .unwrap_or_default(),
        numeric_id,
        source_url,
        departure_route: parsed.departure_route,
        flight_route: parsed.flight_route,
        arrival_route: parsed.arrival_route,
        route_summary,
        departure_runway,
        departure_runway_raw: parsed.departure_runway_raw,
        arrival_runway,
        arrival_runway_raw: parsed.arrival_runway_raw,
        fetched_at: Utc::now().to_rfc3339(),
    })
}

fn build_pirep_details_fetch_script(target_url: &str, nonce: &str) -> String {
    let target_url = serde_json::to_string(target_url).unwrap_or_else(|_| "\"\"".to_string());
    let nonce = serde_json::to_string(nonce).unwrap_or_else(|_| "\"\"".to_string());
    let result_prefix = serde_json::to_string(DELTAVA_PIREP_DETAILS_RESULT_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_DVA_PIREP_DETAILS_RESULT__\"".to_string());
    let debug_prefix = serde_json::to_string(DELTAVA_PIREP_DETAILS_DEBUG_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_SYNC_DEBUG__\"".to_string());

    const TEMPLATE: &str = r#"
(() => {
  const targetUrl = __TARGET_URL__;
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

  const isLoginPage = (htmlText, finalUrl) => {
    const lowerHtml = String(htmlText || '').toLowerCase();
    const lowerUrl = String(finalUrl || '').toLowerCase();
    return lowerUrl.includes('/login.do') ||
      lowerHtml.includes('security violation') ||
      lowerHtml.includes('login') && lowerHtml.includes('password');
  };

  const fetchDetails = async () => {
    emitDebug(`pirep-details:fetch-start:${targetUrl}`);
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      const htmlText = await response.text();
      const finalUrl = String(response.url || window.location.href || targetUrl);
      emitDebug(`pirep-details:fetch-status:${response.status}:${finalUrl}`);

      if (isLoginPage(htmlText, finalUrl)) {
        postResult({
          ok: false,
          status: response.status,
          finalUrl,
          htmlText,
          error: 'auth_required: Delta Virtual session is not available. Run DVA sync first.'
        });
        return;
      }

      if (!response.ok) {
        postResult({
          ok: false,
          status: response.status,
          finalUrl,
          htmlText,
          error: `download_failed: Delta Virtual PIREP request failed with HTTP ${response.status}.`
        });
        return;
      }

      postResult({
        ok: true,
        status: response.status,
        finalUrl,
        htmlText,
        error: null
      });
    } catch (error) {
      postResult({
        ok: false,
        status: 0,
        finalUrl: targetUrl,
        htmlText: '',
        error: error?.message || String(error)
      });
    }
  };

  if (window.location.origin !== 'https://www.deltava.org') {
    postResult({
      ok: false,
      status: 0,
      finalUrl: window.location.href || targetUrl,
      htmlText: '',
      error: 'download_failed: Delta Virtual PIREP requests must run on the Delta Virtual site.'
    });
    return;
  }

  fetchDetails();
})();
"#;

    TEMPLATE
        .replace("__TARGET_URL__", &target_url)
        .replace("__NONCE__", &nonce)
        .replace("__RESULT_PREFIX__", &result_prefix)
        .replace("__DEBUG_PREFIX__", &debug_prefix)
}

fn close_pirep_details_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
}

#[cfg(windows)]
fn attach_windows_pirep_message_handler(
    window: &WebviewWindow,
    app: AppHandle,
    sync_nonce: String,
    pirep_window_label: String,
    numeric_id: u64,
    sender: Arc<Mutex<Option<oneshot::Sender<Result<DeltaVirtualPirepDetailsResult, String>>>>>,
) -> Result<(), String> {
    let registration_error = Arc::new(Mutex::new(None::<String>));
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
                }

                let app_handle = app.clone();
                let sync_nonce = sync_nonce.clone();
                let pirep_window_label = pirep_window_label.clone();
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
                                message.strip_prefix(DELTAVA_PIREP_DETAILS_DEBUG_MESSAGE_PREFIX)
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
                                message.strip_prefix(DELTAVA_PIREP_DETAILS_RESULT_MESSAGE_PREFIX)
                            {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let pirep_window_label = pirep_window_label.clone();
                                let sender = sender.clone();
                                let sync_nonce = sync_nonce.clone();

                                tauri::async_runtime::spawn(async move {
                                    match serde_json::from_str::<DeltaPirepDetailsResultEnvelope>(&payload_text) {
                                        Ok(envelope) if envelope.nonce == sync_nonce => {
                                            let result = if envelope.ok {
                                                build_result_from_html(
                                                    envelope.final_url.clone(),
                                                    numeric_id,
                                                    &envelope.html_text,
                                                )
                                            } else {
                                                Err(envelope.error.unwrap_or_else(|| {
                                                    "download_failed: Delta Virtual PIREP request failed.".into()
                                                }))
                                            };

                                            if let Some(sender) =
                                                sender.lock().ok().and_then(|mut slot| slot.take())
                                            {
                                                let _ = sender.send(result);
                                            }
                                            close_pirep_details_window(&app_handle, &pirep_window_label);
                                        }
                                        Ok(_) => {}
                                        Err(error) => {
                                            if let Some(sender) =
                                                sender.lock().ok().and_then(|mut slot| slot.take())
                                            {
                                                let _ = sender.send(Err(format!(
                                                    "download_failed: Unable to parse Delta Virtual PIREP result: {error}"
                                                )));
                                            }
                                            close_pirep_details_window(&app_handle, &pirep_window_label);
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
                            "download_failed: Unable to register Delta Virtual PIREP listener: {error}"
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
            format!("download_failed: Unable to attach Delta Virtual PIREP capture: {error}")
        })?;

    if let Ok(mut slot) = registration_error.lock() {
        if let Some(error) = slot.take() {
            return Err(error);
        }
    }

    Ok(())
}

#[cfg(windows)]
async fn fetch_delta_virtual_pirep_details_windows(
    app: AppHandle,
    request: DeltaVirtualPirepDetailsRequest,
) -> Result<DeltaVirtualPirepDetailsResult, String> {
    let (target_url, numeric_id) = resolve_pirep_url(&request)?;
    let sync_nonce = new_dva_nonce();
    let pirep_window_label = format!("{DELTAVA_PIREP_DETAILS_LABEL_PREFIX}-{sync_nonce}");
    let webview_data_directory = build_webview_data_directory(&app)?;
    let fetch_script = build_pirep_details_fetch_script(&target_url, &sync_nonce);
    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));

    close_pirep_details_window(&app, &pirep_window_label);

    let target_window_url = WebviewUrl::External(
        target_url
            .parse()
            .map_err(|error| format!("download_failed: Invalid Delta Virtual PIREP URL: {error}"))?,
    );

    let window = WebviewWindowBuilder::new(&app, &pirep_window_label, target_window_url)
        .title("Delta Virtual PIREP Details")
        .inner_size(320.0, 240.0)
        .min_inner_size(320.0, 240.0)
        .resizable(true)
        .visible(false)
        .center()
        .data_directory(webview_data_directory)
        .on_navigation(|url| is_allowed_deltava_url(url))
        .on_page_load({
            let fetch_script = fetch_script.clone();
            move |webview_window, payload| {
                if payload.event() != tauri::webview::PageLoadEvent::Finished
                    || !is_allowed_deltava_url(payload.url())
                {
                    return;
                }

                let _ = webview_window.eval(&fetch_script);
            }
        })
        .build()
        .map_err(|error| {
            format!("download_failed: Unable to open Delta Virtual PIREP window: {error}")
        })?;

    attach_windows_pirep_message_handler(
        &window,
        app.clone(),
        sync_nonce.clone(),
        pirep_window_label.clone(),
        numeric_id,
        sender.clone(),
    )?;

    let timeout = tokio::time::timeout(
        Duration::from_secs(DELTAVA_PIREP_DETAILS_TIMEOUT_SECONDS),
        receiver,
    )
    .await
    .map_err(|_| {
        close_pirep_details_window(&app, &pirep_window_label);
        "download_failed: Delta Virtual PIREP request timed out.".to_string()
    })?;

    match timeout {
        Ok(result) => result.map(|mut details| {
            details.id = target_url
                .rsplit('=')
                .next()
                .map(str::to_string)
                .unwrap_or_default();
            details.source_url = target_url;
            details
        }),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(not(windows))]
async fn fetch_delta_virtual_pirep_details_windows(
    _: AppHandle,
    _: DeltaVirtualPirepDetailsRequest,
) -> Result<DeltaVirtualPirepDetailsResult, String> {
    Err("download_failed: Delta Virtual PIREP requests are only supported on Windows.".into())
}

pub async fn fetch_delta_virtual_pirep_details(
    app: AppHandle,
    request: DeltaVirtualPirepDetailsRequest,
) -> Result<DeltaVirtualPirepDetailsResult, String> {
    fetch_delta_virtual_pirep_details_windows(app, request).await
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_HTML: &str = r#"
<html>
  <body>
    <table>
      <tr><td>Departure Route</td><td>GLADZ4.LULLS</td></tr>
      <tr><td>Flight Route</td><td>LULLS Y196 CANOA UB879 NOSAT</td></tr>
      <tr><td>Arrival Route</td><td>NOSA1B.NOSAT</td></tr>
      <tr><td>Takeoff Runway</td><td>08R (Asphalt - 10,495 feet, takeoff run 6,153 feet)</td></tr>
      <tr><td>Landing Runway</td><td>12L (was 12) (Asphalt - 9,171 feet, 1,731 feet from threshold)</td></tr>
    </table>
  </body>
</html>
"#;

    #[test]
    fn parses_route_and_runway_fields_from_sample_table() {
        let parsed = parse_pirep_detail_html(SAMPLE_HTML);

        assert_eq!(parsed.departure_route, "GLADZ4.LULLS");
        assert_eq!(parsed.flight_route, "LULLS Y196 CANOA UB879 NOSAT");
        assert_eq!(parsed.arrival_route, "NOSA1B.NOSAT");
        assert_eq!(parsed.departure_runway_raw, "08R (Asphalt - 10,495 feet, takeoff run 6,153 feet)");
        assert_eq!(parsed.arrival_runway_raw, "12L (was 12) (Asphalt - 9,171 feet, 1,731 feet from threshold)");
    }

    #[test]
    fn builds_route_summary_without_double_spaces() {
        assert_eq!(build_route_summary("A", "", "C"), "A C");
    }

    #[test]
    fn normalizes_runway_tokens() {
        assert_eq!(normalize_runway_value("08R (Asphalt - 10,495 feet)"), "08R");
        assert_eq!(normalize_runway_value("12L (was 12) (Asphalt - 9,171 feet)"), "12L");
        assert_eq!(normalize_runway_value("36"), "36");
    }

    #[test]
    fn missing_labels_remain_empty() {
        let parsed = parse_pirep_detail_html("<html><body><table><tr><td>Other</td><td>Value</td></tr></table></body></html>");
        assert_eq!(parsed.departure_route, "");
        assert_eq!(parsed.found_labels, 0);
    }

    #[test]
    fn auth_page_is_rejected_by_service_layer() {
        let error = build_result_from_html(
            "https://www.deltava.org/pirep.do?id=0x1d2a91".to_string(),
            1911377,
            "<html><body>Login</body></html>",
        )
        .expect_err("auth page should be rejected");

        assert!(error.contains("auth_required"));
    }
}
