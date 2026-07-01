import { buildDvaPirepId } from "../../domain/logbook/logbook.model.js";
import { invokeAppCommand } from "./invoke.client.js";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Loads a Delta Virtual tour briefing PDF through the Rust-backed capture flow.
export async function fetchDeltaVirtualTourBriefing(briefingUrl) {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual briefing downloads are only available in the desktop app.");
  }

  const normalizedBriefingUrl = String(briefingUrl || "").trim();

  return invokeAppCommand(
    "fetch_delta_virtual_tour_briefing",
    {
      request: {
        briefingUrl: normalizedBriefingUrl
      }
    },
    {
      subsystem: "DVA Tours",
      event: "briefing-fetch-failed",
      metadata: {
        hasBriefingUrl: Boolean(normalizedBriefingUrl)
      }
    }
  );
}

// Loads the selected Delta Virtual PIREP detail page and returns the scraped payload, route, and runway fields.
export async function fetchDeltaVirtualPirepDetails(pirepId) {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual PIREP detail requests are only available in the desktop app.");
  }

  const normalizedPirepId = buildDvaPirepId(pirepId);
  if (!normalizedPirepId) {
    throw new Error("validation_failed: Delta Virtual PIREP id was missing or invalid.");
  }

  try {
    const result = await invokeAppCommand(
      "fetch_delta_virtual_pirep_details",
      {
        request: {
          pirepId: normalizedPirepId
        }
      },
      {
        subsystem: "DVA PIREP",
        event: "pirep-details-failed",
        metadata: {
          hasPirepId: Boolean(normalizedPirepId)
        }
      }
    );

    return {
      id: String(result?.id || normalizedPirepId).trim(),
      numericId: Number(result?.numericId ?? result?.numeric_id ?? 0) || null,
      sourceUrl: String(result?.sourceUrl ?? result?.source_url ?? "").trim(),
      payloadPassengers: String(
        result?.payloadPassengers ?? result?.payload_passengers ?? ""
      ).trim(),
      payloadCargo: String(result?.payloadCargo ?? result?.payload_cargo ?? "").trim(),
      payloadRaw: String(result?.payloadRaw ?? result?.payload_raw ?? "").trim(),
      departureRoute: String(result?.departureRoute ?? result?.departure_route ?? "").trim(),
      flightRoute: String(result?.flightRoute ?? result?.flight_route ?? "").trim(),
      arrivalRoute: String(result?.arrivalRoute ?? result?.arrival_route ?? "").trim(),
      routeSummary: String(result?.routeSummary ?? result?.route_summary ?? "").trim(),
      departureRunway: String(result?.departureRunway ?? result?.departure_runway ?? "").trim(),
      departureRunwayLength: String(
        result?.departureRunwayLength ?? result?.departure_runway_length ?? ""
      ).trim(),
      departureRunwayDisplay: String(
        result?.departureRunwayDisplay ?? result?.departure_runway_display ?? ""
      ).trim(),
      departureRunwayRaw: String(
        result?.departureRunwayRaw ?? result?.departure_runway_raw ?? ""
      ).trim(),
      arrivalRunway: String(result?.arrivalRunway ?? result?.arrival_runway ?? "").trim(),
      arrivalRunwayLength: String(result?.arrivalRunwayLength ?? result?.arrival_runway_length ?? "").trim(),
      arrivalRunwayDisplay: String(
        result?.arrivalRunwayDisplay ?? result?.arrival_runway_display ?? ""
      ).trim(),
      arrivalRunwayThresholdDistance: String(
        result?.arrivalRunwayThresholdDistance ?? result?.arrival_runway_threshold_distance ?? ""
      ).trim(),
      arrivalRunwayRaw: String(result?.arrivalRunwayRaw ?? result?.arrival_runway_raw ?? "").trim(),
      fetchedAt: String(result?.fetchedAt ?? result?.fetched_at ?? "").trim()
    };
  } catch (error) {
    if (error instanceof Error) {
      const normalized = normalizePirepDetailsError(error.message);
      normalized.kind = error.kind || normalized.kind;
      throw normalized;
    }

    throw normalizePirepDetailsError(String(error));
  }
}

function normalizePirepDetailsError(message) {
  if (!message) {
    return new Error("Delta Virtual PIREP details failed.");
  }

  const [kind, ...rest] = String(message).split(":");
  const normalizedMessage = rest.length ? rest.join(":").trim() : String(message);
  const error = new Error(normalizedMessage || "Delta Virtual PIREP details failed.");
  error.kind = rest.length ? kind : "download_failed";
  return error;
}

function normalizeSyncError(message) {
  if (!message) {
    return new Error("Delta Virtual sync failed.");
  }

  const [kind, ...rest] = String(message).split(":");
  const normalizedMessage = rest.length ? rest.join(":").trim() : String(message);
  const error = new Error(normalizedMessage || "Delta Virtual sync failed.");
  error.kind = rest.length ? kind : "download_failed";
  return error;
}

function buildSafeLogbookResult(error = "") {
  return {
    dateIso: null,
    lastSyncAt: null,
    profileMetadata: null,
    entries: [],
    entryCount: 0,
    error: String(error || "").trim()
  };
}

export async function syncScheduleFromDeltaVirtual({
  syncRunId = "",
  debugEnabled = false
} = {}) {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual sync is only available in the desktop app.");
  }

  try {
    const result = await invokeAppCommand("start_deltava_sync", {
      syncRunId: String(syncRunId || "").trim(),
      debugEnabled: Boolean(debugEnabled)
    });
    const fileName = result?.fileName ?? result?.file_name;
    const xmlText = result?.xmlText ?? result?.xml_text;
    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    const logbookJson = result?.logbookJson ?? result?.logbook_json ?? null;

    if (!fileName || !xmlText) {
      const error = new Error(
        logbookJson
          ? "partial_success: Delta Virtual schedule download failed, but logbook JSON was saved."
          : "download_failed: Delta Virtual sync returned an incomplete payload."
      );
      error.syncResult = result;
      throw error;
    }

    return { fileName, xmlText, warnings, logbookJson };
  } catch (error) {
    if (error instanceof Error) {
      const normalized = normalizeSyncError(error.message);
      normalized.syncResult = error.syncResult;
      throw normalized;
    }

    throw normalizeSyncError(String(error));
  }
}

export async function refreshDeltaVirtualLogbook({
  syncRunId = "",
  debugEnabled = false
} = {}) {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual logbook refresh is only available in the desktop app.");
  }

  try {
    const result = await invokeAppCommand("refresh_deltava_logbook", {
      syncRunId: String(syncRunId || "").trim(),
      debugEnabled: Boolean(debugEnabled)
    });
    const fileName =
      result?.fileName ??
      result?.file_name ??
      result?.logbookJson?.fileName ??
      result?.logbook_json?.file_name ??
      null;
    const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
    const logbookJson = result?.logbookJson ?? result?.logbook_json ?? null;

    return {
      fileName,
      warnings,
      logbookJson,
      status: String(result?.status || "").trim(),
      xmlStatus: String(result?.xmlStatus || result?.xml_status || "").trim(),
      logbookStatus: String(result?.logbookStatus || result?.logbook_status || "").trim()
    };
  } catch (error) {
    if (error instanceof Error) {
      const normalized = normalizeSyncError(error.message);
      normalized.syncResult = error.syncResult;
      throw normalized;
    }

    throw normalizeSyncError(String(error));
  }
}

// Resets only the DVA sync/webview session state without clearing the full app profile.
export async function resetDeltaVirtualSyncSession() {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invokeAppCommand("reset_deltava_sync_session");
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeSyncError(error.message);
    }

    throw normalizeSyncError(String(error));
  }
}

export async function syncDeltaVirtualTours({
  syncRunId = "",
  debugEnabled = false
} = {}) {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual tour sync is only available in the desktop app.");
  }

  try {
    const result = await invokeAppCommand("sync_delta_virtual_tours", {
      syncRunId: String(syncRunId || "").trim(),
      debugEnabled: Boolean(debugEnabled)
    });
    return {
      ok: Boolean(result?.ok),
      source: String(result?.source || "dva").trim().toLowerCase() || "dva",
      lastSyncAt: result?.lastSyncAt ?? result?.last_sync_at ?? null,
      totalListTours: Number(result?.totalListTours ?? result?.total_list_tours ?? 0),
      candidateTours: Number(result?.candidateTours ?? result?.candidate_tours ?? 0),
      syncedTours: Number(result?.syncedTours ?? result?.synced_tours ?? 0),
      failedTourIds: Array.isArray(result?.failedTourIds ?? result?.failed_tour_ids)
        ? result?.failedTourIds ?? result?.failed_tour_ids
        : [],
      message: String(result?.message || "").trim(),
      tours: Array.isArray(result?.tours) ? result.tours : []
    };
  } catch (error) {
    if (error instanceof Error) {
      const normalized = normalizeSyncError(error.message);
      normalized.syncResult = error.syncResult;
      throw normalized;
    }

    throw normalizeSyncError(String(error));
  }
}

export async function closeDeltaVirtualSyncWindow() {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invokeAppCommand("close_deltava_sync_window");
  } catch {
    // Window may already be closed; ignore.
  }
}

export async function readDeltaVirtualLogbookMetadata() {
  if (!isTauriRuntime()) {
    return { dateIso: null };
  }

  try {
    const result = await invokeAppCommand("read_deltava_logbook_metadata");
    return {
      dateIso: result?.dateIso ?? result?.date_iso ?? null
    };
  } catch {
    return { dateIso: null };
  }
}

export async function readDeltaVirtualLogbookProgress() {
  if (!isTauriRuntime()) {
    return { dateIso: null, visitedAirports: [], arrivalAirports: [] };
  }

  try {
    const result = await invokeAppCommand("read_deltava_logbook_progress");
    return {
      dateIso: result?.dateIso ?? result?.date_iso ?? null,
      visitedAirports: Array.isArray(result?.visitedAirports ?? result?.visited_airports)
        ? result?.visitedAirports ?? result?.visited_airports
        : [],
      arrivalAirports: Array.isArray(result?.arrivalAirports ?? result?.arrival_airports)
        ? result?.arrivalAirports ?? result?.arrival_airports
        : []
    };
  } catch {
    return { dateIso: null, visitedAirports: [], arrivalAirports: [] };
  }
}

export async function readDeltaVirtualLogbook() {
  if (!isTauriRuntime()) {
    return buildSafeLogbookResult();
  }

  try {
    const result = await invokeAppCommand("read_deltava_logbook");
    const entries = Array.isArray(result?.entries) ? result.entries : [];

    return {
      dateIso: result?.dateIso ?? result?.date_iso ?? null,
      lastSyncAt: result?.lastSyncAt ?? result?.last_sync_at ?? null,
      profileMetadata: result?.profileMetadata ?? result?.profile_metadata ?? null,
      entries,
      entryCount: Number(result?.entryCount ?? result?.entry_count ?? entries.length) || 0,
      error: ""
    };
  } catch (error) {
    return buildSafeLogbookResult(error instanceof Error ? error.message : String(error));
  }
}

export async function readDeltaVirtualAccomplishmentEligibility() {
  if (!isTauriRuntime()) {
    return { lastSyncAt: null, sourceUrl: null, rows: [] };
  }

  try {
    const result = await invokeAppCommand("read_deltava_accomplishment_eligibility");
    return {
      lastSyncAt: result?.lastSyncAt ?? result?.last_sync_at ?? null,
      sourceUrl: result?.sourceUrl ?? result?.source_url ?? null,
      rows: Array.isArray(result?.rows) ? result.rows : []
    };
  } catch {
    return { lastSyncAt: null, sourceUrl: null, rows: [] };
  }
}

export async function pruneDeltaVirtualStorage(removeDownloadedSchedule = false) {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invokeAppCommand(
      "prune_deltava_storage",
      { removeDownloadedSchedule },
      {
        metadata: {
          removeDownloadedSchedule: Boolean(removeDownloadedSchedule)
        }
      }
    );
  } catch {
    // Cleanup is best-effort; do not surface this to the user.
  }
}
