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
    entries: [],
    entryCount: 0,
    error: String(error || "").trim()
  };
}

export async function syncScheduleFromDeltaVirtual() {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual sync is only available in the desktop app.");
  }

  try {
    const result = await invokeAppCommand("start_deltava_sync");
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

export async function syncDeltaVirtualTours() {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual tour sync is only available in the desktop app.");
  }

  try {
    const result = await invokeAppCommand("sync_delta_virtual_tours");
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
      entries,
      entryCount: Number(result?.entryCount ?? result?.entry_count ?? entries.length) || 0,
      error: ""
    };
  } catch (error) {
    return buildSafeLogbookResult(error instanceof Error ? error.message : String(error));
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
