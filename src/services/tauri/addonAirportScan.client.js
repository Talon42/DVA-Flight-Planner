import { invokeAppCommand } from "./invoke.client.js";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeAddonScanError(message, fallbackMessage) {
  if (!message) {
    return new Error(fallbackMessage);
  }

  return new Error(String(message));
}

function normalizeAddonScanPayload(payload) {
  return {
    roots: Array.isArray(payload?.roots) ? payload.roots : [],
    airports: Array.isArray(payload?.airports) ? payload.airports : [],
    lastScannedAt: payload?.lastScannedAt ?? null,
    contentHistoryFilesScanned: Number(payload?.contentHistoryFilesScanned ?? 0),
    manifestFilesScanned: Number(payload?.manifestFilesScanned ?? 0),
    manifestFallbacksUsed: Number(payload?.manifestFallbacksUsed ?? 0),
    manifestAirportEntriesFound: Number(payload?.manifestAirportEntriesFound ?? 0),
    airportEntriesFound: Number(payload?.airportEntriesFound ?? 0),
    duplicateAirportEntries: Number(payload?.duplicateAirportEntries ?? 0),
    status: payload?.status || "idle",
    lastError: payload?.lastError ?? null,
    warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
    scanDetails: Array.isArray(payload?.scanDetails) ? payload.scanDetails : []
  };
}

export function createEmptyAddonAirportScan() {
  return {
    roots: [],
    airports: [],
    lastScannedAt: null,
    contentHistoryFilesScanned: 0,
    manifestFilesScanned: 0,
    manifestFallbacksUsed: 0,
    manifestAirportEntriesFound: 0,
    airportEntriesFound: 0,
    duplicateAirportEntries: 0,
    status: "idle",
    lastError: null,
    warnings: [],
    scanDetails: []
  };
}

export async function readAddonAirportCache() {
  if (!isTauriRuntime()) {
    return createEmptyAddonAirportScan();
  }

  try {
    const payload = await invokeAppCommand("read_addon_airport_cache");
    return normalizeAddonScanPayload(payload);
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeAddonScanError(error.message, "Unable to load addon airport cache.");
    }

    throw normalizeAddonScanError(String(error), "Unable to load addon airport cache.");
  }
}

export async function saveAddonAirportRoots(roots) {
  if (!isTauriRuntime()) {
    throw new Error("Addon airport scanning is only available in the desktop app.");
  }

  try {
    const payload = await invokeAppCommand(
      "save_addon_airport_roots",
      { roots },
      {
        metadata: {
          rootCount: Array.isArray(roots) ? roots.length : 0
        }
      }
    );
    return normalizeAddonScanPayload(payload);
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeAddonScanError(error.message, "Unable to save addon folder list.");
    }

    throw normalizeAddonScanError(String(error), "Unable to save addon folder list.");
  }
}

export async function scanAddonAirports(roots) {
  if (!isTauriRuntime()) {
    throw new Error("Addon airport scanning is only available in the desktop app.");
  }

  try {
    const payload = await invokeAppCommand(
      "scan_addon_airports",
      {
        roots: Array.isArray(roots) ? roots : null
      },
      {
        metadata: {
          rootCount: Array.isArray(roots) ? roots.length : 0
        }
      }
    );
    return normalizeAddonScanPayload(payload);
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeAddonScanError(error.message, "Addon airport scan failed.");
    }

    throw normalizeAddonScanError(String(error), "Addon airport scan failed.");
  }
}

export async function pickAddonAirportFolder() {
  if (!isTauriRuntime()) {
    throw new Error("Addon airport scanning is only available in the desktop app.");
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({
    directory: true,
    multiple: false
  });

  if (!path || Array.isArray(path)) {
    return null;
  }

  return String(path);
}
