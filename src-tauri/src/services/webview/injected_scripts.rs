const DELTAVA_AUTO_SYNC_SCRIPT: &str = r#"
(() => {
  const targetUrl = 'https://www.deltava.org/pfpxsched.ws';
  const logbookPageUrl = 'https://www.deltava.org/logbook.do';
  const logbookExportUrl = 'https://www.deltava.org/mylogbook.ws';
  const accomplishmentEligibilityUrl = 'https://www.deltava.org/acceligibility.do';
  const syncFlagKey = 'flightPlannerDeltaSyncRequested';
  const nonce = __NONCE__;
  const syncResultPrefix = '__FLIGHT_PLANNER_SYNC_RESULT__';
  const debugPrefix = '__FLIGHT_PLANNER_SYNC_DEBUG__';
  const emitDebug = (message) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(debugPrefix + JSON.stringify({ nonce, message }));
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
  const readBoundedText = async (response, maxBytes, label) => {
    const contentLength = Number(response.headers.get('content-length') || NaN);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`${label} exceeded the ${maxBytes} byte limit.`);
    }

    if (!response.body?.getReader) {
      const text = await response.text();
      if (new TextEncoder().encode(text).length > maxBytes) {
        throw new Error(`${label} exceeded the ${maxBytes} byte limit.`);
      }
      return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (value && value.length) {
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
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(bytes);
  };
  const fetchScheduleXml = async () => {
    const response = await fetch(targetUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    const xml = await readBoundedText(response, __SCHEDULE_XML_MAX_BYTES__, 'Delta Virtual schedule XML');
    emitDebug(`xml:fetch-status:${response.status}:${xml.length}`);
    if (!response.ok) {
      throw new Error(`Schedule XML request failed with HTTP ${response.status}.`);
    }
    if (!xml || !xml.trimStart().startsWith('<')) {
      throw new Error('Delta Virtual returned a non-schedule XML response.');
    }
    return xml;
  };
  __LOGBOOK_EXPORT_HELPERS__
  const fetchAccomplishmentEligibilityHtml = async () => {
    emitDebug('accomplishments:fetch-start');
    const response = await fetch(accomplishmentEligibilityUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    const htmlText = await readBoundedText(response, __ACCOMPLISHMENT_HTML_MAX_BYTES__, 'Delta Virtual accomplishment eligibility HTML');
    emitDebug(`accomplishments:fetch-status:${response.status}:${htmlText.length}`);
    if (!response.ok) {
      throw new Error(`Accomplishment eligibility request failed with HTTP ${response.status}.`);
    }
    const normalizedText = String(htmlText || '').toUpperCase();
    if (!normalizedText.includes('ACCOMPLISHMENT ELIGIBILITY')) {
      throw new Error('Delta Virtual returned an unexpected accomplishment eligibility response.');
    }
    if (normalizedText.includes('SECURITY VIOLATION') || normalizedText.includes('LOGIN')) {
      throw new Error('Delta Virtual returned an authenticated accomplishment eligibility page.');
    }
    return htmlText;
  };
  const postSyncResult = (payload) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(syncResultPrefix + JSON.stringify({ nonce, ...payload }));
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
      logbook: { ok: false },
      accomplishments: { ok: false }
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

    try {
      payload.accomplishments = {
        ok: true,
        htmlText: await fetchAccomplishmentEligibilityHtml()
      };
    } catch (error) {
      payload.accomplishments = {
        ok: false,
        error: error?.message || 'Accomplishment eligibility download failed.'
      };
      emitDebug(`accomplishments:error:${payload.accomplishments.error}`);
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

const DELTAVA_LOGBOOK_REFRESH_SCRIPT: &str = r#"
(() => {
  const targetUrl = 'https://www.deltava.org/logbook.do';
  const logbookPageUrl = 'https://www.deltava.org/logbook.do';
  const logbookExportUrl = 'https://www.deltava.org/mylogbook.ws';
  const syncFlagKey = 'flightPlannerDeltaLogbookRefreshRequested';
  const nonce = __NONCE__;
  const syncResultPrefix = '__FLIGHT_PLANNER_LOGBOOK_REFRESH_RESULT__';
  const debugPrefix = '__FLIGHT_PLANNER_SYNC_DEBUG__';
  const emitDebug = (message) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(debugPrefix + JSON.stringify({ nonce, message }));
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
    icon.textContent = '⟳';
    icon.style.fontSize = '42px';
    icon.style.lineHeight = '1';
    icon.style.animation = 'flightPlannerHourglassPulse 1.1s ease-in-out infinite';

    const text = document.createElement('div');
    text.textContent = 'Refreshing your logbook data...';

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
  const readBoundedText = async (response, maxBytes, label) => {
    const contentLength = Number(response.headers.get('content-length') || NaN);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`${label} exceeded the ${maxBytes} byte limit.`);
    }

    if (!response.body?.getReader) {
      const text = await response.text();
      if (new TextEncoder().encode(text).length > maxBytes) {
        throw new Error(`${label} exceeded the ${maxBytes} byte limit.`);
      }
      return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (value && value.length) {
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
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(bytes);
  };
  const fetchLogbookJsonExport = async () => {
    emitDebug('logbook:page-fetch-start');
    const pageResponse = await fetch(logbookPageUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    const pageHtml = await readBoundedText(pageResponse, __LOGBOOK_PAGE_HTML_MAX_BYTES__, 'Delta Virtual logbook page HTML');
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
    const jsonText = await readBoundedText(exportResponse, __LOGBOOK_JSON_MAX_BYTES__, 'Delta Virtual logbook JSON export');
    emitDebug(`logbook:export-status:${exportResponse.status}:${jsonText.length}`);
    if (!exportResponse.ok) {
      throw new Error(`Logbook JSON export failed with HTTP ${exportResponse.status}.`);
    }
    return { jsonText, filename, contentType };
  };
  const postRefreshResult = (payload) => {
    if (window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage(syncResultPrefix + JSON.stringify({ nonce, ...payload }));
    }
  };
  const runRefreshDownloads = async () => {
    if (window.__flightPlannerDeltaLogbookRefreshPosted) {
      emitDebug('state:refresh-already-posted');
      return true;
    }
    window.__flightPlannerDeltaLogbookRefreshPosted = true;

    try {
      postRefreshResult({
        logbook: { ok: true, ...(await fetchLogbookJsonExport()) }
      });
      return true;
    } catch (error) {
      postRefreshResult({
        logbook: { ok: false, error: error?.message || 'Logbook JSON download failed.' }
      });
      emitDebug(`logbook:error:${error?.message || 'Logbook JSON download failed.'}`);
      return true;
    }
  };
  if (window.location.origin !== 'https://www.deltava.org') {
    return;
  }
  emitDebug(`script:loaded:${window.location.href}`);

  const markRefreshRequested = () => {
    window.__flightPlannerDeltaLogbookRefreshRequested = true;
    try {
      window.sessionStorage.setItem(syncFlagKey, '1');
    } catch (_) {}
  };

  if (!window.__flightPlannerDeltaLogbookRefreshListenersBound) {
    window.__flightPlannerDeltaLogbookRefreshListenersBound = true;
    emitDebug('listener:bound');
    document.addEventListener('submit', () => {
      markRefreshRequested();
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
        markRefreshRequested();
        emitDebug(`event:click:${text || idName || 'unknown'}`);
      }
    }, true);
  }

  if (window.location.href === targetUrl) {
    emitDebug('state:at-logbook');
    showSyncOverlay();
    if (window.__flightPlannerDeltaLogbookRefreshPosted) {
      emitDebug('state:refresh-already-posted');
      return;
    }
    window.setTimeout(async () => {
      await runRefreshDownloads();
    }, 100);
    return;
  }

  let refreshRequested = false;
  try {
    refreshRequested = window.sessionStorage.getItem(syncFlagKey) === '1';
  } catch (_) {
    refreshRequested = Boolean(window.__flightPlannerDeltaLogbookRefreshRequested);
  }

  if (!refreshRequested) {
    emitDebug('state:not-requested');
    return;
  }

  if (window.__flightPlannerDeltaLogbookRefreshPending) {
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

  window.__flightPlannerDeltaLogbookRefreshPending = true;
  emitDebug(`state:fetching:${targetUrl}`);
  showSyncOverlay();
  window.setTimeout(async () => {
    const posted = await runRefreshDownloads();
    if (!posted) {
      emitDebug(`state:redirecting-fallback:${targetUrl}`);
      window.location.assign(targetUrl);
    }
  }, 250);
})();
"#;

const LOGBOOK_EXPORT_HELPERS: &str = r#"
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
  const fetchLogbookJsonExport = async () => {
    emitDebug('logbook:page-fetch-start');
    const pageResponse = await fetch(logbookPageUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    const pageHtml = await readBoundedText(pageResponse, __LOGBOOK_PAGE_HTML_MAX_BYTES__, 'Delta Virtual logbook page HTML');
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
    const jsonText = await readBoundedText(exportResponse, __LOGBOOK_JSON_MAX_BYTES__, 'Delta Virtual logbook JSON export');
    emitDebug(`logbook:export-status:${exportResponse.status}:${jsonText.length}`);
    if (!exportResponse.ok) {
      throw new Error(`Logbook JSON export failed with HTTP ${exportResponse.status}.`);
    }
    return { jsonText, filename, contentType };
  };
"#;

pub(crate) fn build_deltava_auto_sync_script(nonce: &str) -> String {
    let nonce = serde_json::to_string(nonce).unwrap_or_else(|_| "\"\"".to_string());
    DELTAVA_AUTO_SYNC_SCRIPT
        .replace("__LOGBOOK_EXPORT_HELPERS__", LOGBOOK_EXPORT_HELPERS)
        .replace("__SCHEDULE_XML_MAX_BYTES__", &crate::services::deltava::sync_types::MAX_DELTAVA_SCHEDULE_XML_BYTES.to_string())
        .replace("__ACCOMPLISHMENT_HTML_MAX_BYTES__", &crate::services::deltava::sync_types::MAX_DELTAVA_ACCOMPLISHMENT_HTML_BYTES.to_string())
        .replace("__LOGBOOK_PAGE_HTML_MAX_BYTES__", &crate::services::deltava::sync_types::MAX_DELTAVA_LOGBOOK_PAGE_HTML_BYTES.to_string())
        .replace("__LOGBOOK_JSON_MAX_BYTES__", &crate::services::deltava::sync_types::MAX_DELTAVA_LOGBOOK_JSON_BYTES.to_string())
        .replace("__NONCE__", &nonce)
}

pub(crate) fn build_deltava_logbook_refresh_script(nonce: &str) -> String {
    let nonce = serde_json::to_string(nonce).unwrap_or_else(|_| "\"\"".to_string());
    DELTAVA_LOGBOOK_REFRESH_SCRIPT
        .replace("__LOGBOOK_PAGE_HTML_MAX_BYTES__", &crate::services::deltava::sync_types::MAX_DELTAVA_LOGBOOK_PAGE_HTML_BYTES.to_string())
        .replace("__LOGBOOK_JSON_MAX_BYTES__", &crate::services::deltava::sync_types::MAX_DELTAVA_LOGBOOK_JSON_BYTES.to_string())
        .replace("__NONCE__", &nonce)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_no_unresolved_placeholders(script: &str) {
        assert!(!script.contains("__SCHEDULE_XML_MAX_BYTES__"));
        assert!(!script.contains("__LOGBOOK_PAGE_HTML_MAX_BYTES__"));
        assert!(!script.contains("__LOGBOOK_JSON_MAX_BYTES__"));
        assert!(!script.contains("__ACCOMPLISHMENT_HTML_MAX_BYTES__"));
        assert!(!script.contains("__NONCE__"));
    }

    #[test]
    fn build_deltava_auto_sync_script_has_single_bounded_reader() {
        let script = build_deltava_auto_sync_script("nonce-test");
        assert_eq!(script.matches("const readBoundedText = async").count(), 1);
        assert_no_unresolved_placeholders(&script);
    }

    #[test]
    fn build_deltava_logbook_refresh_script_has_single_bounded_reader() {
        let script = build_deltava_logbook_refresh_script("nonce-test");
        assert_eq!(script.matches("const readBoundedText = async").count(), 1);
        assert_no_unresolved_placeholders(&script);
    }
}
