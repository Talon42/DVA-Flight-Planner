use serde::Serialize;

use crate::services::deltava::{
    constants::{DELTAVA_DEBUG_MESSAGE_PREFIX, DELTAVA_LOGBOOK_REFRESH_RESULT_MESSAGE_PREFIX, DELTAVA_SYNC_RESULT_MESSAGE_PREFIX},
    sync_types::{
        MAX_DELTAVA_ACCOMPLISHMENT_HTML_BYTES, MAX_DELTAVA_LOGBOOK_JSON_BYTES,
        MAX_DELTAVA_LOGBOOK_PAGE_HTML_BYTES, MAX_DELTAVA_SCHEDULE_XML_BYTES,
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnabledArtifacts {
    schedule: bool,
    logbook: bool,
    accomplishments: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScriptLimits {
    schedule_xml: usize,
    logbook_page_html: usize,
    logbook_json: usize,
    accomplishment_html: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncScriptConfig<'a> {
    mode: &'a str,
    target_url: &'a str,
    schedule_url: Option<&'a str>,
    logbook_page_url: &'a str,
    logbook_export_url: &'a str,
    accomplishment_url: Option<&'a str>,
    sync_flag_key: &'a str,
    requested_key: &'a str,
    listeners_bound_key: &'a str,
    pending_key: &'a str,
    downloads_posted_key: &'a str,
    result_prefix: &'a str,
    debug_prefix: &'a str,
    overlay_text: &'a str,
    overlay_icon: &'a str,
    enabled_artifacts: EnabledArtifacts,
    limits: ScriptLimits,
}

const DELTAVA_SYNC_SCRIPT: &str = r#"
(() => {
  const config = __CONFIG__;
  const nonce = __NONCE__;
  const emitDebug = (message) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(config.debugPrefix + JSON.stringify({ nonce, message }));
    }
  };
  const ensureSyncOverlay = () => {
    let overlay = document.getElementById('flight-planner-sync-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'flight-planner-sync-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', background: '#ffffff', zIndex: '2147483647', display: 'none',
      alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px',
      color: '#0f172a', fontFamily: 'Segoe UI, Tahoma, Arial, sans-serif', fontSize: '14px'
    });
    const icon = document.createElement('div');
    icon.textContent = config.overlayIcon;
    Object.assign(icon.style, { fontSize: '42px', lineHeight: '1', animation: 'flightPlannerHourglassPulse 1.1s ease-in-out infinite' });
    const text = document.createElement('div');
    text.textContent = config.overlayText;
    const style = document.createElement('style');
    style.textContent = '@keyframes flightPlannerHourglassPulse { 0% { opacity: .45; transform: scale(.95); } 50% { opacity: 1; transform: scale(1); } 100% { opacity: .45; transform: scale(.95); } }';
    overlay.append(icon, text, style);
    document.documentElement.appendChild(overlay);
    return overlay;
  };
  const showSyncOverlay = () => { ensureSyncOverlay().style.display = 'flex'; };
  const readBoundedText = async (response, maxBytes, label) => {
    const contentLength = Number(response.headers.get('content-length') || NaN);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error(`${label} exceeded the ${maxBytes} byte limit.`);
    if (!response.body?.getReader) {
      const text = await response.text();
      if (new TextEncoder().encode(text).length > maxBytes) throw new Error(`${label} exceeded the ${maxBytes} byte limit.`);
      return text;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.length) {
          totalBytes += value.length;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            throw new Error(`${label} exceeded the ${maxBytes} byte limit.`);
          }
          chunks.push(value);
        }
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
  };
  const fetchScheduleXml = async () => {
    const response = await fetch(config.scheduleUrl, { method: 'GET', credentials: 'include', cache: 'no-store' });
    const xml = await readBoundedText(response, config.limits.scheduleXml, 'Delta Virtual schedule XML');
    emitDebug(`xml:fetch-status:${response.status}:${xml.length}`);
    if (!response.ok) throw new Error(`Schedule XML request failed with HTTP ${response.status}.`);
    if (!xml || !xml.trimStart().startsWith('<')) throw new Error('Delta Virtual returned a non-schedule XML response.');
    return xml;
  };
  const parseLogbookExportIdFromUrl = (url) => {
    try { return new URL(url).searchParams.get('id') || ''; } catch (_) { return ''; }
  };
  const parseLogbookExportIdFromHtml = (html) => {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    return doc.querySelector('input[name="id"]')?.value || '';
  };
  const fetchLogbookJsonExport = async () => {
    emitDebug('logbook:page-fetch-start');
    const pageResponse = await fetch(config.logbookPageUrl, { method: 'GET', credentials: 'include', cache: 'no-store' });
    const pageHtml = await readBoundedText(pageResponse, config.limits.logbookPageHtml, 'Delta Virtual logbook page HTML');
    emitDebug(`logbook:page-status:${pageResponse.status}:${pageResponse.url}`);
    if (!pageResponse.ok) throw new Error(`Logbook page request failed with HTTP ${pageResponse.status}.`);
    let exportId = parseLogbookExportIdFromUrl(pageResponse.url);
    if (exportId) emitDebug('logbook:id-source:url');
    else { exportId = parseLogbookExportIdFromHtml(pageHtml); emitDebug(exportId ? 'logbook:id-source:hidden-input' : 'logbook:id-missing'); }
    if (!exportId) throw new Error('Unable to find Delta Virtual logbook export id.');
    emitDebug(`logbook:id-parsed:${exportId}`);
    const exportResponse = await fetch(config.logbookExportUrl, {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ export: 'JSONExport', id: exportId })
    });
    const filename = exportResponse.headers.get('X-Logbook-Filename') || '';
    const contentType = exportResponse.headers.get('Content-Type') || '';
    const jsonText = await readBoundedText(exportResponse, config.limits.logbookJson, 'Delta Virtual logbook JSON export');
    emitDebug(`logbook:export-status:${exportResponse.status}:${jsonText.length}`);
    if (!exportResponse.ok) throw new Error(`Logbook JSON export failed with HTTP ${exportResponse.status}.`);
    return { jsonText, filename, contentType, exportId };
  };
  const fetchAccomplishmentEligibilityHtml = async () => {
    emitDebug('accomplishments:fetch-start');
    const response = await fetch(config.accomplishmentUrl, { method: 'GET', credentials: 'include', cache: 'no-store' });
    const htmlText = await readBoundedText(response, config.limits.accomplishmentHtml, 'Delta Virtual accomplishment eligibility HTML');
    emitDebug(`accomplishments:fetch-status:${response.status}:${htmlText.length}`);
    if (!response.ok) throw new Error(`Accomplishment eligibility request failed with HTTP ${response.status}.`);
    const normalizedText = String(htmlText || '').toUpperCase();
    if (!normalizedText.includes('ACCOMPLISHMENT ELIGIBILITY')) throw new Error('Delta Virtual returned an unexpected accomplishment eligibility response.');
    if (normalizedText.includes('SECURITY VIOLATION') || normalizedText.includes('LOGIN')) throw new Error('Delta Virtual returned an authenticated accomplishment eligibility page.');
    return htmlText;
  };
  const postResult = (payload) => {
    if (window.chrome?.webview?.postMessage) window.chrome.webview.postMessage(config.resultPrefix + JSON.stringify({ nonce, ...payload }));
  };
  const shouldTryScheduleFallback = (message) => {
    const normalized = String(message || '').toLowerCase();
    return !normalized.includes('exceeded the') && !normalized.includes('byte limit');
  };
  const runDownloads = async () => {
    if (window[config.downloadsPostedKey]) { emitDebug('state:downloads-already-posted'); return true; }
    window[config.downloadsPostedKey] = true;
    const payload = {};
    if (config.enabledArtifacts.schedule) {
      try { payload.xml = { ok: true, xmlText: await fetchScheduleXml() }; }
      catch (error) { payload.xml = { ok: false, error: error?.message || 'Schedule XML download failed.' }; emitDebug(`xml:error:${payload.xml.error}`); }
    }
    if (config.enabledArtifacts.logbook) {
      try { payload.logbook = { ok: true, ...(await fetchLogbookJsonExport()) }; }
      catch (error) { payload.logbook = { ok: false, error: error?.message || 'Logbook JSON download failed.' }; emitDebug(`logbook:error:${payload.logbook.error}`); }
    }
    if (config.enabledArtifacts.accomplishments) {
      try { payload.accomplishments = { ok: true, htmlText: await fetchAccomplishmentEligibilityHtml() }; }
      catch (error) { payload.accomplishments = { ok: false, error: error?.message || 'Accomplishment eligibility download failed.' }; emitDebug(`accomplishments:error:${payload.accomplishments.error}`); }
    }
    if (config.enabledArtifacts.schedule && !payload.xml.ok && window.location.href !== config.targetUrl && shouldTryScheduleFallback(payload.xml.error)) {
      emitDebug(`xml:fallback-navigation:${config.targetUrl}`);
      window[config.downloadsPostedKey] = false;
      return false;
    }
    postResult(payload);
    return true;
  };
  if (window.location.origin !== 'https://www.deltava.org') return;
  emitDebug(`script:loaded:${window.location.href}`);
  const markRequested = () => {
    window[config.requestedKey] = true;
    try { window.sessionStorage.setItem(config.syncFlagKey, '1'); } catch (_) {}
  };
  if (!window[config.listenersBoundKey]) {
    window[config.listenersBoundKey] = true;
    emitDebug('listener:bound');
    document.addEventListener('submit', () => { markRequested(); emitDebug('event:submit'); }, true);
    document.addEventListener('click', (event) => {
      const element = event.target?.closest ? event.target.closest('button, input[type="submit"], input[type="button"], a') : null;
      if (!element) return;
      const text = (element.innerText || element.value || element.textContent || '').toLowerCase();
      const idName = `${element.id || ''} ${element.name || ''}`.toLowerCase();
      if (text.includes('login') || idName.includes('login') || idName.includes('signin')) { markRequested(); emitDebug(`event:click:${text || idName || 'unknown'}`); }
    }, true);
  }
  if (window.location.href === config.targetUrl) {
    emitDebug('state:at-target');
    showSyncOverlay();
    if (window[config.downloadsPostedKey]) { emitDebug('state:downloads-already-posted'); return; }
    window.setTimeout(runDownloads, 100);
    return;
  }
  let requested = false;
  try { requested = window.sessionStorage.getItem(config.syncFlagKey) === '1'; }
  catch (_) { requested = Boolean(window[config.requestedKey]); }
  if (!requested) { emitDebug('state:not-requested'); return; }
  if (window[config.pendingKey]) { emitDebug('state:pending'); return; }
  if (document.querySelector('input[type="password"], input[name*="pass" i], input[id*="pass" i]')) { emitDebug('state:waiting-auth'); return; }
  window[config.pendingKey] = true;
  emitDebug(`state:fetching:${config.targetUrl}`);
  showSyncOverlay();
  window.setTimeout(async () => {
    if (!(await runDownloads())) { emitDebug(`state:redirecting-fallback:${config.targetUrl}`); window.location.assign(config.targetUrl); }
  }, 250);
})();
"#;

fn limits() -> ScriptLimits {
    ScriptLimits {
        schedule_xml: MAX_DELTAVA_SCHEDULE_XML_BYTES,
        logbook_page_html: MAX_DELTAVA_LOGBOOK_PAGE_HTML_BYTES,
        logbook_json: MAX_DELTAVA_LOGBOOK_JSON_BYTES,
        accomplishment_html: MAX_DELTAVA_ACCOMPLISHMENT_HTML_BYTES,
    }
}

fn build_script(config: SyncScriptConfig<'_>, nonce: &str) -> String {
    let config = serde_json::to_string(&config).unwrap_or_else(|_| "{}".to_string());
    let nonce = serde_json::to_string(nonce).unwrap_or_else(|_| "\"\"".to_string());
    DELTAVA_SYNC_SCRIPT.replace("__CONFIG__", &config).replace("__NONCE__", &nonce)
}

pub(crate) fn build_deltava_auto_sync_script(nonce: &str) -> String {
    build_script(SyncScriptConfig {
        mode: "full",
        target_url: "https://www.deltava.org/pfpxsched.ws",
        schedule_url: Some("https://www.deltava.org/pfpxsched.ws"),
        logbook_page_url: "https://www.deltava.org/logbook.do",
        logbook_export_url: "https://www.deltava.org/mylogbook.ws",
        accomplishment_url: Some("https://www.deltava.org/acceligibility.do"),
        sync_flag_key: "flightPlannerDeltaSyncRequested",
        requested_key: "__flightPlannerDeltaSyncRequested",
        listeners_bound_key: "__flightPlannerDeltaSyncListenersBound",
        pending_key: "__flightPlannerDeltaSyncPending",
        downloads_posted_key: "__flightPlannerDeltaDownloadsPosted",
        result_prefix: DELTAVA_SYNC_RESULT_MESSAGE_PREFIX,
        debug_prefix: DELTAVA_DEBUG_MESSAGE_PREFIX,
        overlay_text: "Downloading and processing schedule...",
        overlay_icon: "⌛",
        enabled_artifacts: EnabledArtifacts { schedule: true, logbook: true, accomplishments: true },
        limits: limits(),
    }, nonce)
}

pub(crate) fn build_deltava_logbook_refresh_script(nonce: &str) -> String {
    build_script(SyncScriptConfig {
        mode: "logbookRefresh",
        target_url: "https://www.deltava.org/logbook.do",
        schedule_url: None,
        logbook_page_url: "https://www.deltava.org/logbook.do",
        logbook_export_url: "https://www.deltava.org/mylogbook.ws",
        accomplishment_url: None,
        sync_flag_key: "flightPlannerDeltaLogbookRefreshRequested",
        requested_key: "__flightPlannerDeltaLogbookRefreshRequested",
        listeners_bound_key: "__flightPlannerDeltaLogbookRefreshListenersBound",
        pending_key: "__flightPlannerDeltaLogbookRefreshPending",
        downloads_posted_key: "__flightPlannerDeltaLogbookRefreshPosted",
        result_prefix: DELTAVA_LOGBOOK_REFRESH_RESULT_MESSAGE_PREFIX,
        debug_prefix: DELTAVA_DEBUG_MESSAGE_PREFIX,
        overlay_text: "Refreshing your logbook data...",
        overlay_icon: "⟳",
        enabled_artifacts: EnabledArtifacts { schedule: false, logbook: true, accomplishments: false },
        limits: limits(),
    }, nonce)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_shared_template_is_resolved(script: &str) {
        assert!(!script.contains("__CONFIG__"));
        assert!(!script.contains("__NONCE__"));
        assert_eq!(script.matches("const readBoundedText = async").count(), 1);
        assert_eq!(script.matches("const fetchLogbookJsonExport = async").count(), 1);
        assert!(script.contains("nonce-test"));
    }

    #[test]
    fn full_sync_enables_all_artifacts_and_limits() {
        let script = build_deltava_auto_sync_script("nonce-test");
        assert_shared_template_is_resolved(&script);
        assert!(script.contains("https://www.deltava.org/pfpxsched.ws"));
        assert!(script.contains("https://www.deltava.org/acceligibility.do"));
        assert!(script.contains(DELTAVA_SYNC_RESULT_MESSAGE_PREFIX));
        assert!(script.contains(&MAX_DELTAVA_SCHEDULE_XML_BYTES.to_string()));
        assert!(script.contains("\"schedule\":true"));
        assert!(script.contains("\"accomplishments\":true"));
    }

    #[test]
    fn logbook_refresh_disables_unrequested_artifacts() {
        let script = build_deltava_logbook_refresh_script("nonce-test");
        assert_shared_template_is_resolved(&script);
        assert!(script.contains("https://www.deltava.org/logbook.do"));
        assert!(script.contains("https://www.deltava.org/mylogbook.ws"));
        assert!(script.contains(DELTAVA_LOGBOOK_REFRESH_RESULT_MESSAGE_PREFIX));
        assert!(!script.contains("https://www.deltava.org/pfpxsched.ws"));
        assert!(!script.contains("https://www.deltava.org/acceligibility.do"));
        assert!(script.contains("\"schedule\":false"));
        assert!(script.contains("\"accomplishments\":false"));
        assert!(script.contains("Refreshing your logbook data..."));
    }
}
