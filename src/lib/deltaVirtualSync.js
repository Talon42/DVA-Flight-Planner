function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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

export async function syncScheduleFromDeltaVirtual() {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual sync is only available in the desktop app.");
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke("start_deltava_sync");
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

export async function closeDeltaVirtualSyncWindow() {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("close_deltava_sync_window");
  } catch {
    // Window may already be closed; ignore.
  }
}

export async function readDeltaVirtualLogbookMetadata() {
  if (!isTauriRuntime()) {
    return { dateIso: null };
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke("read_deltava_logbook_metadata");
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
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke("read_deltava_logbook_progress");
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

export async function pruneDeltaVirtualStorage(removeDownloadedSchedule = false) {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("prune_deltava_storage", { removeDownloadedSchedule });
  } catch {
    // Cleanup is best-effort; do not surface this to the user.
  }
}
