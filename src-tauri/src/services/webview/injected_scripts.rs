const DELTAVA_AUTO_SYNC_SCRIPT: &str = r#"
(() => {
  const targetUrl = 'https://www.deltava.org/pfpxsched.ws';
  const logbookPageUrl = 'https://www.deltava.org/logbook.do';
  const logbookExportUrl = 'https://www.deltava.org/mylogbook.ws';
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

pub(crate) fn build_deltava_auto_sync_script(nonce: &str) -> String {
    let nonce = serde_json::to_string(nonce).unwrap_or_else(|_| "\"\"".to_string());
    DELTAVA_AUTO_SYNC_SCRIPT.replace("__NONCE__", &nonce)
}
