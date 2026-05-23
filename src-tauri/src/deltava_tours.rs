use crate::deltava_auth::{read_auth_context_internal, save_password_to_credential_manager};
use crate::deltava_login::{
    build_deltava_login_automation_script, DvaLoginMessage, DvaLoginMessageKind,
};
use crate::{
    append_sync_log, build_webview_data_directory, initialize_sync_log_path,
    is_allowed_deltava_url, iso_now_utc, new_dva_nonce, should_probe_for_schedule,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, sync::Mutex, time::Duration};
use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tokio::sync::oneshot;
#[cfg(windows)]
use webview2_com::{
    CoTaskMemPWSTR, Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4,
    WebMessageReceivedEventHandler,
};
#[cfg(windows)]
use windows::core::{Interface, PWSTR};

const DELTAVA_TOURS_SYNC_LABEL: &str = "deltava-tours-sync";
const DELTAVA_TOURS_SYNC_TIMEOUT_SECONDS: u64 = 300;
const DELTAVA_TOURS_SYNC_RESULT_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_DVA_TOURS_SYNC_RESULT__";
const DELTAVA_DEBUG_MESSAGE_PREFIX: &str = "__FLIGHT_PLANNER_SYNC_DEBUG__";
const DELTAVA_TOURS_CACHE_FILE: &str = "dva-tours-cache.json";
const DELTAVA_LOGIN_URL: &str = "https://www.deltava.org/login.do";

const DELTAVA_TOURS_SYNC_SCRIPT_TEMPLATE: &str = r#"
(() => {
  const nonce = __NONCE__;
  const resultPrefix = __RESULT_PREFIX__;
  const debugPrefix = __DEBUG_PREFIX__;
  const toursListUrl = 'https://www.deltava.org/tours.ws';
  const tourDetailBaseUrl = 'https://www.deltava.org/tour.ws?id=';

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

  const normalizeText = (value) => String(value ?? '').trim();
  const normalizeId = (value) => normalizeText(value);
  const normalizeSegment = (value) => normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const normalizeDvaEpochSeconds = (value) => {
    const normalized = normalizeText(value);
    if (!normalized || normalized === '0' || normalized === 'null' || normalized === 'undefined') {
      return null;
    }

    const numericValue = Number(normalized);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return null;
    }

    return numericValue > 10000000000 ? Math.floor(numericValue / 1000) : Math.floor(numericValue);
  };
  const isValidId = (value) => {
    const normalized = normalizeId(value);
    return Boolean(normalized) && normalized !== '0' && normalized !== 'null' && normalized !== 'undefined';
  };
  const isJsonContentType = (value) => /json/i.test(String(value || ''));
  const buildPreview = (text) => normalizeText(text).replace(/\s+/g, ' ').slice(0, 160);
  const toArray = (value) => (Array.isArray(value) ? value : []);
  const formatDurationLabel = (durationMs) => {
    const numericDuration = Number(durationMs);
    if (!Number.isFinite(numericDuration) || numericDuration < 0) {
      return '';
    }

    const totalMinutes = Math.round(numericDuration / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };
  const buildFailure = (endpoint, response, responseText, message, tourId) => ({
    endpoint,
    status: Number.isFinite(response?.status) ? response.status : null,
    contentType: String(response?.headers?.get?.('Content-Type') || '').trim(),
    preview: isJsonContentType(response?.headers?.get?.('Content-Type'))
      ? ''
      : buildPreview(responseText),
    message,
    tourId: tourId || null
  });
  const isLoginPage = () => Boolean(
    window.location.href.includes('/login.do') ||
    document.querySelector('input[name="firstName"], input[name="lastName"], input[name="pwd"]')
  );
  const fetchEndpoint = async (endpoint) => {
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    const responseText = await response.text();
    const contentType = String(response.headers.get('Content-Type') || '').trim();

    if (!response.ok) {
      return {
        ok: false,
        error: buildFailure(endpoint, response, responseText, `HTTP ${response.status}`, null)
      };
    }

    try {
      return {
        ok: true,
        response,
        responseText,
        contentType,
        json: JSON.parse(responseText)
      };
    } catch (error) {
      return {
        ok: false,
        error: buildFailure(
          endpoint,
          response,
          responseText,
          `Invalid JSON response: ${error?.message || error}`,
          null
        )
      };
    }
  };
  const fetchJsonArray = async (endpoint) => {
    const result = await fetchEndpoint(endpoint);
    if (!result.ok) {
      return result;
    }

    if (!Array.isArray(result.json)) {
      return {
        ok: false,
        error: buildFailure(
          endpoint,
          result.response,
          result.responseText,
          'Delta Virtual tours list response was not an array.',
          null
        )
      };
    }

    return result;
  };
  const normalizeAirport = (airport) => ({
    icao: normalizeText(airport?.icao || airport?.id || airport?.code || '').toUpperCase(),
    iata: normalizeText(airport?.iata || '').toUpperCase(),
    name: normalizeText(airport?.name || airport?.airportName || airport?.description || '')
  });
  const buildFlightId = (tourId, flight) => {
    const airline = normalizeSegment(flight?.airline || flight?.airlineName || '');
    const flightNumber = normalizeSegment(flight?.flight || flight?.flightNumber || '');
    const leg = Number.isFinite(Number(flight?.leg)) ? `leg-${Number(flight?.leg)}` : '';
    const departure = normalizeSegment(flight?.airportD?.icao || flight?.departure || flight?.departureIcao || '');
    const destination = normalizeSegment(flight?.airportA?.icao || flight?.destination || flight?.destinationIcao || '');
    const departureTime = normalizeSegment(flight?.timeD?.text || flight?.departureTime || '');
    const arrivalTime = normalizeSegment(flight?.timeA?.text || flight?.arrivalTime || '');
    const equipment = normalizeSegment(flight?.eqType || flight?.equipment || flight?.aircraft || '');
    const route = normalizeSegment(flight?.route || '');
    const composite = [
      airline ? `airline-${airline}` : '',
      flightNumber ? `flight-${flightNumber}` : '',
      leg,
      departure ? `dep-${departure}` : '',
      destination ? `arr-${destination}` : '',
      departureTime ? `dpt-${departureTime}` : '',
      arrivalTime ? `arrt-${arrivalTime}` : '',
      equipment ? `eq-${equipment}` : '',
      route ? `route-${route}` : ''
    ]
      .filter(Boolean)
      .join(':');
    return `dva:dva:${tourId}${composite ? `:${composite}` : ''}`;
  };
  const normalizeTourFlight = (tour, flight, index) => {
    const tourId = normalizeId(tour?.id || tour?.sourceId);
    const departureAirport = normalizeAirport(flight?.airportD);
    const destinationAirport = normalizeAirport(flight?.airportA);
    const airline = normalizeText(flight?.airline || '').toUpperCase();
    const flightNumber = normalizeText(flight?.flight || flight?.flightNumber || '');
    const flightCode = airline && flightNumber ? `${airline}${flightNumber}` : normalizeText(flight?.flight || '');
    const departureTime = normalizeText(flight?.timeD?.text || flight?.departureTime || '');
    const arrivalTime = normalizeText(flight?.timeA?.text || flight?.arrivalTime || '');
    const durationMs = Number(flight?.duration);
    const numericDurationMs = Number.isFinite(durationMs) ? durationMs : null;
    const distance = Number(flight?.distance);
    const numericDistance = Number.isFinite(distance) ? distance : null;
    const equipment = normalizeText(flight?.eqType || flight?.equipment || flight?.aircraft || '');
    const departure = departureAirport.icao || departureAirport.iata;
    const destination = destinationAirport.icao || destinationAirport.iata;
    const route = normalizeText(flight?.route || `${departureAirport.name || departure} (${departure}) - ${destinationAirport.name || destination} (${destination})`);
    const blockMinutes = Number.isFinite(numericDurationMs) ? Math.max(0, Math.round(numericDurationMs / 60000)) : null;
    const blockTimeLabel = formatDurationLabel(numericDurationMs);
    const flightId = buildFlightId(tourId, flight);
    const segment = normalizeText(flight?.segment || flight?.leg || `Leg ${Number.isFinite(Number(flight?.leg)) ? Number(flight?.leg) : index + 1}`);

    return {
      flightId,
      sourceId: flightId,
      id: flightId,
      flightCode,
      flightNumber,
      leg: Number.isFinite(Number(flight?.leg)) ? Number(flight?.leg) : null,
      segment,
      airline,
      airlineName: normalizeText(flight?.airlineName || flight?.airline || airline),
      airlineIcao: airline,
      tourPath: `dva:${tourId}`,
      tourRowId: flightId,
      tourSourceId: tourId,
      tourLabel: normalizeText(tour?.name || ''),
      tourName: normalizeText(tour?.name || ''),
      from: departure,
      to: destination,
      departure,
      destination,
      departureIata: departureAirport.iata,
      destinationIata: destinationAirport.iata,
      departureName: departureAirport.name,
      destinationName: destinationAirport.name,
      route,
      equipment,
      aircraft: equipment,
      departureTime,
      arrivalTime,
      departureTimeLabel: departureTime,
      arrivalTimeLabel: arrivalTime,
      blockMinutes,
      blockTimeLabel,
      durationMs: numericDurationMs,
      distanceMi: numericDistance,
      distanceNm: null,
      schedule: departureTime && arrivalTime ? `${departureTime} - ${arrivalTime}${blockTimeLabel ? ` (${blockTimeLabel})` : ''}` : blockTimeLabel,
      isTourFlight: true
    };
  };
  const normalizeTour = (tour, flights, nowSeconds = Math.floor(Date.now() / 1000)) => {
    const sourceId = normalizeId(tour?.id || tour?.sourceId);
    const normalizedFlights = flights.map((flight, index) => normalizeTourFlight(tour, flight, index));
    const startDate = normalizeDvaEpochSeconds(tour?.startDate || tour?.start_date || '');
    const endDate = normalizeDvaEpochSeconds(tour?.endDate || tour?.end_date || '');
    const active = Boolean(tour?.active);
    const isExpired = endDate !== null && endDate > 0 && endDate < nowSeconds;
    const isCurrent =
      active &&
      !isExpired &&
      (startDate === null || startDate <= nowSeconds) &&
      (endDate === null || endDate >= nowSeconds);
    const isUpcoming = active && !isExpired && !isCurrent && startDate !== null && startDate > nowSeconds;
    const visibilityStatus = isExpired ? 'expired' : isUpcoming ? 'upcoming' : 'current';

    return {
      id: sourceId,
      sourceId,
      path: `dva:${sourceId}`,
      label: normalizeText(tour?.name || sourceId),
      owner: normalizeText(tour?.owner || ''),
      name: normalizeText(tour?.name || sourceId),
      status: normalizeText(tour?.status || ''),
      active,
      startDate: normalizeText(tour?.startDate || tour?.start_date || '') || null,
      endDate: normalizeText(tour?.endDate || tour?.end_date || '') || null,
      isExpired,
      isCurrent,
      isUpcoming,
      visibilityStatus,
      networks: toArray(tour?.networks).map((value) => normalizeText(value)).filter(Boolean),
      rows: normalizedFlights,
      flights: normalizedFlights
    };
  };
  const cloneTour = (tour) => ({
    ...tour,
    rows: Array.isArray(tour.rows) ? tour.rows.map((row) => ({ ...row })) : [],
    flights: Array.isArray(tour.flights) ? tour.flights.map((row) => ({ ...row })) : []
  });
  const evaluateCandidateTour = (tour, nowSeconds) => {
    const tourId = normalizeId(tour?.id || tour?.sourceId);
    const tourName = normalizeText(tour?.name || '');
    const active = tour?.active === true;
    const status = normalizeText(tour?.status || '');
    const rawStartDate = tour?.startDate ?? tour?.start_date ?? null;
    const rawEndDate = tour?.endDate ?? tour?.end_date ?? null;
    const startDate = normalizeDvaEpochSeconds(rawStartDate);
    const endDate = normalizeDvaEpochSeconds(rawEndDate);
    const isExpired = endDate !== null && endDate > 0 && endDate < nowSeconds;
    const isCurrent =
      active &&
      !isExpired &&
      (startDate === null || startDate <= nowSeconds) &&
      (endDate === null || endDate >= nowSeconds);
    const isUpcoming = active && !isExpired && !isCurrent && startDate !== null && startDate > nowSeconds;
    const visibilityStatus = isExpired ? 'expired' : isUpcoming ? 'upcoming' : 'current';
    let reason = 'include';

    if (!isValidId(tourId)) {
      reason = 'exclude:invalid-id';
    } else if (!active) {
      reason = 'exclude:inactive';
    }

    emitDebug(
      `tours:filter:${JSON.stringify({
        tourId: tourId || null,
        name: tourName,
        active,
        status,
        startDate: startDate,
        endDate: endDate,
        visibilityStatus,
        nowSeconds,
        reason
      })}`
    );

    return {
      include: reason === 'include',
      reason
    };
  };
  const runToursSync = async () => {
    if (window.__flightPlannerDeltaToursSyncPosted) {
      emitDebug('tours:already-posted');
      return true;
    }

    window.__flightPlannerDeltaToursSyncPosted = true;

    const listResponse = await fetchJsonArray(toursListUrl);
    if (!listResponse.ok) {
      const failure = listResponse.error;
      emitDebug(`tours:list-failed:${failure?.message || 'unknown'}`);
      postResult({
        ok: false,
        source: 'dva',
        lastSyncAt: null,
        totalListTours: 0,
        candidateTours: 0,
        syncedTours: 0,
        failedTourIds: [],
        message: failure?.message || 'Delta Virtual tours list download failed.',
        tours: [],
        detailFailures: failure ? [failure] : []
      });
      return true;
    }

    const totalListTours = listResponse.json.length;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const candidateTours = [];
    for (const tour of listResponse.json) {
      const evaluation = evaluateCandidateTour(tour, nowSeconds);
      if (evaluation.include) {
        candidateTours.push(tour);
      }
    }
    const tours = [];
    const detailFailures = [];
    const failedTourIds = [];

    for (const candidateTour of candidateTours) {
      const tourId = normalizeId(candidateTour.id || candidateTour.sourceId);
      const detailEndpoint = `${tourDetailBaseUrl}${encodeURIComponent(tourId)}`;
      const detailResponse = await fetchEndpoint(detailEndpoint);

      if (!detailResponse.ok) {
        const failure = {
          ...detailResponse.error,
          tourId
        };
        detailFailures.push(failure);
        failedTourIds.push(tourId);
        continue;
      }

      const detailTour = detailResponse.json && typeof detailResponse.json === 'object'
        ? detailResponse.json.tour && typeof detailResponse.json.tour === 'object'
          ? detailResponse.json.tour
          : detailResponse.json
        : null;
      const detailFlights = Array.isArray(detailTour?.flights) ? detailTour.flights : [];

      if (!detailFlights.length) {
        failedTourIds.push(tourId);
        const contentType = String(detailResponse.contentType || '').trim();
        detailFailures.push({
          endpoint: detailEndpoint,
          status: Number.isFinite(detailResponse.response?.status) ? detailResponse.response.status : null,
          contentType,
          preview: isJsonContentType(contentType) ? '' : buildPreview(detailResponse.responseText),
          message: 'Delta Virtual tour detail response did not include flights.',
          tourId
        });
        continue;
      }

      tours.push(cloneTour(normalizeTour(detailTour, detailFlights, nowSeconds)));
    }

    const syncedTours = tours.length;
    const hasFatalFailure = candidateTours.length > 0 && syncedTours === 0;
    const ok = !hasFatalFailure;
    const message = listResponse.json.length === 0
      ? 'No Delta Virtual tours were returned.'
      : candidateTours.length === 0
        ? 'No active Delta Virtual tours were available.'
        : syncedTours > 0
          ? failedTourIds.length
            ? `Synced ${syncedTours} Delta Virtual tours with ${failedTourIds.length} failed detail request${failedTourIds.length === 1 ? '' : 's'}.`
            : `Synced ${syncedTours} Delta Virtual tours.`
          : 'Delta Virtual tours could not be hydrated.';

    postResult({
      ok,
      source: 'dva',
      lastSyncAt: new Date().toISOString(),
      totalListTours,
      candidateTours: candidateTours.length,
      syncedTours,
      failedTourIds,
      message,
      tours,
      detailFailures
    });

    return true;
  };

  const maybeStartToursSync = async () => {
    if (window.__flightPlannerDeltaToursSyncInProgress) {
      return;
    }

    window.__flightPlannerDeltaToursSyncInProgress = true;
    try {
      await runToursSync();
    } finally {
      window.__flightPlannerDeltaToursSyncInProgress = false;
    }
  };

  if (window.location.origin !== 'https://www.deltava.org') {
    return;
  }

  emitDebug(`tours:loaded:${window.location.href}`);

  if (isLoginPage()) {
    emitDebug('tours:awaiting-login');
    return;
  }

  maybeStartToursSync().catch((error) => {
    emitDebug(`tours:error:${error?.message || error}`);
  });
})();
"#;

#[derive(Default)]
pub struct DeltaToursSyncManager {
    active: Mutex<Option<ActiveDeltaToursSync>>,
}

struct ActiveDeltaToursSync {
    label: String,
    sender: oneshot::Sender<Result<DeltaToursSyncPayload, String>>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeltaToursSyncPayload {
    ok: bool,
    source: String,
    last_sync_at: Option<String>,
    total_list_tours: usize,
    candidate_tours: usize,
    synced_tours: usize,
    failed_tour_ids: Vec<String>,
    message: String,
    tours: Vec<DeltaTourRecord>,
    #[serde(default)]
    detail_failures: Vec<DeltaTourSyncFailure>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaTourFlightRecord {
    flight_id: String,
    source_id: String,
    id: String,
    flight_code: String,
    flight_number: String,
    leg: Option<i64>,
    segment: String,
    airline: String,
    airline_name: String,
    airline_icao: String,
    tour_path: String,
    tour_row_id: String,
    tour_source_id: String,
    tour_label: String,
    tour_name: String,
    from: String,
    to: String,
    departure: String,
    destination: String,
    departure_iata: String,
    destination_iata: String,
    departure_name: String,
    destination_name: String,
    route: String,
    equipment: String,
    aircraft: String,
    departure_time: String,
    arrival_time: String,
    departure_time_label: String,
    arrival_time_label: String,
    block_minutes: Option<i64>,
    block_time_label: String,
    duration_ms: Option<i64>,
    distance_mi: Option<f64>,
    distance_nm: Option<f64>,
    schedule: String,
    is_tour_flight: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaTourRecord {
    id: String,
    source_id: String,
    path: String,
    label: String,
    owner: String,
    name: String,
    status: String,
    active: bool,
    start_date: Option<String>,
    end_date: Option<String>,
    #[serde(default)]
    is_expired: bool,
    #[serde(default)]
    is_current: bool,
    #[serde(default)]
    is_upcoming: bool,
    #[serde(default)]
    visibility_status: String,
    networks: Vec<String>,
    rows: Vec<DeltaTourFlightRecord>,
    flights: Vec<DeltaTourFlightRecord>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaTourSyncFailure {
    endpoint: String,
    status: Option<u16>,
    content_type: String,
    preview: String,
    message: String,
    tour_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaToursSyncResultEnvelope {
    nonce: String,
    #[serde(flatten)]
    payload: DeltaToursSyncPayload,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeltaWebDebugMessage {
    nonce: String,
    message: String,
}

fn app_storage_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app storage path: {error}"))?;

    fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Unable to create app data directory: {error}"))?;

    Ok(app_data_dir)
}

fn delta_virtual_tours_cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_storage_dir(app)?.join(DELTAVA_TOURS_CACHE_FILE))
}

fn write_delta_virtual_tours_cache_internal(
    app: &AppHandle,
    payload: &DeltaToursSyncPayload,
) -> Result<(), String> {
    let path = delta_virtual_tours_cache_path(app)?;
    let text = serde_json::to_string_pretty(payload).map_err(|error| {
        format!("download_failed: Unable to serialize Delta Virtual tours cache: {error}")
    })?;
    fs::write(path, text).map_err(|error| {
        format!("download_failed: Unable to write Delta Virtual tours cache: {error}")
    })
}

fn log_delta_virtual_tours_failure(failure: &DeltaTourSyncFailure) {
    let status = failure
        .status
        .map(|value| value.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let preview = if failure.preview.is_empty() {
        String::new()
    } else {
        format!(" preview={}", failure.preview)
    };

    append_sync_log(&format!(
        "tours:fetch-failed endpoint={} status={} content-type={}{}{}",
        failure.endpoint,
        status,
        failure.content_type,
        preview,
        if failure.message.is_empty() {
            String::new()
        } else {
            format!(" message={}", failure.message)
        }
    ));
}

impl DeltaToursSyncManager {
    fn begin(
        &self,
        label: String,
        sender: oneshot::Sender<Result<DeltaToursSyncPayload, String>>,
    ) -> Result<(), String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "download_failed: Unable to lock sync state.".to_string())?;

        if active.is_some() {
            return Err("download_failed: A Delta Virtual sync is already in progress.".into());
        }

        *active = Some(ActiveDeltaToursSync { label, sender });
        Ok(())
    }

    fn finish(&self, label: &str, result: Result<DeltaToursSyncPayload, String>) {
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

fn build_deltava_tours_sync_script(nonce: &str) -> String {
    let nonce = serde_json::to_string(nonce).unwrap_or_else(|_| "\"\"".to_string());
    let tours_result_prefix = serde_json::to_string(DELTAVA_TOURS_SYNC_RESULT_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_DVA_TOURS_SYNC_RESULT__\"".to_string());
    let debug_prefix = serde_json::to_string(DELTAVA_DEBUG_MESSAGE_PREFIX)
        .unwrap_or_else(|_| "\"__FLIGHT_PLANNER_SYNC_DEBUG__\"".to_string());

    DELTAVA_TOURS_SYNC_SCRIPT_TEMPLATE
        .replace("__NONCE__", &nonce)
        .replace("__RESULT_PREFIX__", &tours_result_prefix)
        .replace("__DEBUG_PREFIX__", &debug_prefix)
}

fn close_deltava_tours_sync_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DELTAVA_TOURS_SYNC_LABEL) {
        let _ = window.close();
    }
}

async fn build_tours_sync_payload_from_web_result(
    app: &AppHandle,
    mut result: DeltaToursSyncPayload,
) -> Result<DeltaToursSyncPayload, String> {
    if result.last_sync_at.is_none() {
        result.last_sync_at = Some(iso_now_utc());
    }

    for failure in &result.detail_failures {
        log_delta_virtual_tours_failure(failure);
    }

    write_delta_virtual_tours_cache_internal(app, &result)?;
    if let Err(error) = crate::deltava_tour_progress::reconcile_deltava_tour_progress_internal(app)
    {
        append_sync_log(&format!("tour-progress:reconcile-failed {error}"));
    }

    Ok(result)
}

#[cfg(windows)]
fn attach_windows_tours_message_handler(
    window: &WebviewWindow,
    app: AppHandle,
    sync_nonce: String,
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
                    let _ = settings4.SetIsPasswordAutosaveEnabled(false);
                    let _ = settings4.SetIsGeneralAutofillEnabled(false);
                    append_sync_log("webview:settings4-autofill-disabled");
                } else {
                    append_sync_log("webview:settings4-unavailable");
                }

                let app_handle = app.clone();
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
                                if let Ok(debug_line) = serde_json::from_str::<DeltaWebDebugMessage>(debug_line) {
                                    if debug_line.nonce == sync_nonce {
                                        append_sync_log(&format!("webview:{}", debug_line.message));
                                    }
                                }
                                return Ok(());
                            }

                            if let Some(payload_text) = message.strip_prefix(crate::DELTAVA_AUTH_MESSAGE_PREFIX) {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let sync_nonce = sync_nonce.clone();

                                tauri::async_runtime::spawn(async move {
                                    match serde_json::from_str::<DvaLoginMessage>(&payload_text) {
                                        Ok(message) if message.nonce == sync_nonce => {
                                            let DvaLoginMessage {
                                                kind,
                                                reason,
                                                password,
                                                ..
                                            } = message;

                                            match kind {
                                                DvaLoginMessageKind::LoginSuccess => {
                                                    append_sync_log("auth-succeeded");
                                                }
                                                DvaLoginMessageKind::StorePassword => {
                                                    if let Some(password) = password.as_deref() {
                                                        match save_password_to_credential_manager(password) {
                                                            Ok(()) => append_sync_log("auth-succeeded"),
                                                            Err(error) => append_sync_log(&format!("auth-failed error={error}")),
                                                        }
                                                    }
                                                }
                                                DvaLoginMessageKind::LoginFailed => {
                                                    let reason = reason
                                                        .as_deref()
                                                        .unwrap_or("Delta Virtual login failed.");
                                                    append_sync_log(&format!("auth-failed error={reason}"));
                                                    app_handle.state::<DeltaToursSyncManager>().finish(
                                                        DELTAVA_TOURS_SYNC_LABEL,
                                                        Err(format!("auth_failed: {reason}")),
                                                    );
                                                    close_deltava_tours_sync_window(&app_handle);
                                                }
                                            }
                                        }
                                        _ => {}
                                    }
                                });
                                return Ok(());
                            }

                            if let Some(payload_text) = message.strip_prefix(DELTAVA_TOURS_SYNC_RESULT_MESSAGE_PREFIX) {
                                let payload_text = payload_text.to_string();
                                let app_handle = app_handle.clone();
                                let sync_nonce = sync_nonce.clone();

                                tauri::async_runtime::spawn(async move {
                                    match serde_json::from_str::<DeltaToursSyncResultEnvelope>(&payload_text) {
                                        Ok(envelope) if envelope.nonce == sync_nonce => {
                                            let result = build_tours_sync_payload_from_web_result(&app_handle, envelope.payload).await;
                                            app_handle
                                                .state::<DeltaToursSyncManager>()
                                                .finish(DELTAVA_TOURS_SYNC_LABEL, result);
                                            close_deltava_tours_sync_window(&app_handle);
                                        }
                                        Ok(_) => {}
                                        Err(error) => {
                                            app_handle.state::<DeltaToursSyncManager>().finish(
                                                DELTAVA_TOURS_SYNC_LABEL,
                                                Err(format!(
                                                    "download_failed: Unable to parse Delta Virtual tours sync result: {error}"
                                                )),
                                            );
                                            close_deltava_tours_sync_window(&app_handle);
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
                        format!("download_failed: Unable to register Delta Virtual tours listener: {error}")
                    })?;

                Ok(())
            })();

            if let Err(error) = result {
                if let Ok(mut slot) = registration_error_for_closure.lock() {
                    *slot = Some(error);
                }
            }
        })
        .map_err(|error| format!("download_failed: Unable to attach Delta Virtual tours capture: {error}"))?;

    if let Ok(mut slot) = registration_error.lock() {
        if let Some(error) = slot.take() {
            return Err(error);
        }
    }

    Ok(())
}

pub async fn sync_delta_virtual_tours(
    app: AppHandle,
    tours_sync_manager: State<'_, DeltaToursSyncManager>,
) -> Result<DeltaToursSyncPayload, String> {
    let initialized_log_path = initialize_sync_log_path(&app);
    let _ = initialized_log_path;
    let sync_nonce = new_dva_nonce();
    append_sync_log("tours:started");
    close_deltava_tours_sync_window(&app);

    let (sender, receiver) = oneshot::channel();
    tours_sync_manager.begin(DELTAVA_TOURS_SYNC_LABEL.to_string(), sender)?;

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
    append_sync_log(&format!(
        "auth-succeeded hasPassword={} firstNameSaved={} lastNameSaved={}",
        auth_context.settings.has_password,
        !auth_context.settings.first_name.is_empty(),
        !auth_context.settings.last_name.is_empty()
    ));

    let login_automation_script = build_deltava_login_automation_script(
        &auth_context,
        DELTAVA_LOGIN_URL,
        "https://www.deltava.org/",
        &sync_nonce,
    );
    let tours_sync_script = build_deltava_tours_sync_script(&sync_nonce);

    let login_url = DELTAVA_LOGIN_URL
        .parse()
        .map_err(|error| format!("download_failed: Invalid Delta Virtual login URL: {error}"))?;

    let window = WebviewWindowBuilder::new(
        &app,
        DELTAVA_TOURS_SYNC_LABEL,
        WebviewUrl::External(login_url),
    )
    .title("Delta Virtual Tours Sync")
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
            let _ = webview_window.eval(&login_automation_script);
            let _ = webview_window.eval(&tours_sync_script);
        }
    })
    .build()
    .map_err(|error| {
        format!("download_failed: Unable to open Delta Virtual tours sync window: {error}")
    })?;

    #[cfg(windows)]
    attach_windows_tours_message_handler(&window, app.clone(), sync_nonce.clone())?;
    append_sync_log("tours:webview-ready");

    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed) {
            app_for_close.state::<DeltaToursSyncManager>().finish(
                DELTAVA_TOURS_SYNC_LABEL,
                Err("cancelled: Delta Virtual tours sync window was closed before the response was downloaded.".into()),
            );
        }
    });

    match tokio::time::timeout(
        Duration::from_secs(DELTAVA_TOURS_SYNC_TIMEOUT_SECONDS),
        receiver,
    )
    .await
    {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("download_failed: Delta Virtual tours sync stopped unexpectedly.".into()),
        Err(_) => {
            app.state::<DeltaToursSyncManager>().finish(
                DELTAVA_TOURS_SYNC_LABEL,
                Err(
                    "auth_failed: Timed out waiting for Delta Virtual login or tour download."
                        .into(),
                ),
            );
            close_deltava_tours_sync_window(&app);
            Err("auth_failed: Timed out waiting for Delta Virtual login or tour download.".into())
        }
    }
}
