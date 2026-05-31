import {
  buildDvaAircraftOptions,
  getAircraftByDva,
  getAircraftByName,
  getAircraftBySimBrief,
  normalizeAircraftCustomAirframe
} from "../../domain/aircraft/aircraftIdentity.js";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeSimBriefError(message) {
  if (!message) {
    return new Error("SimBrief dispatch failed.");
  }

  const [kind, ...rest] = String(message).split(":");
  const normalizedMessage = rest.length ? rest.join(":").trim() : String(message);
  const error = new Error(normalizedMessage || "SimBrief dispatch failed.");
  error.kind = rest.length ? kind : "dispatch_failed";
  return error;
}

// Resolves a SimBrief aircraft code into a DVA equipment type when a compatible mapping exists.
export function resolveSimBriefAircraftCompatibility(aircraft) {
  const simbriefCode = String(
    typeof aircraft === "string"
      ? aircraft
      : aircraft?.code || aircraft?.dispatchType || aircraft?.matchType || ""
  ).trim();
  const simbriefName = String(
    typeof aircraft === "string" ? "" : aircraft?.name || aircraft?.label || ""
  ).trim();
  const identityRow =
    getAircraftBySimBrief(simbriefCode) ||
    getAircraftByName(simbriefCode) ||
    getAircraftByDva(simbriefCode) ||
    getAircraftBySimBrief(simbriefName) ||
    getAircraftByName(simbriefName) ||
    getAircraftByDva(simbriefName) ||
    null;

  if (identityRow) {
    return {
      simbriefCode: identityRow.simbrief || simbriefCode.toUpperCase(),
      simbriefName: identityRow.simbriefName || identityRow.name || simbriefName,
      resolvedDvaEquipmentType: identityRow.dva,
      resolutionSource: identityRow.simbrief ? "identity_simbrief" : "identity_dva",
      validForDvaDraft: Boolean(identityRow.dva)
    };
  }

  return {
    simbriefCode: simbriefCode.toUpperCase(),
    simbriefName,
    resolvedDvaEquipmentType: "",
    resolutionSource: "unsupported",
    validForDvaDraft: false
  };
}

export function normalizeSimBriefCustomAirframe(entry) {
  return normalizeAircraftCustomAirframe(entry);
}

export function buildSimBriefDispatchOptions() {
  return buildDvaAircraftOptions();
}

export async function startSimBriefDispatch(payload) {
  if (!isTauriRuntime()) {
    throw new Error("SimBrief dispatch is only available in the desktop app.");
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke("start_simbrief_dispatch", { payload });
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeSimBriefError(error.message);
    }

    throw normalizeSimBriefError(String(error));
  }
}

export async function refreshSimBriefDispatch(payload) {
  if (!isTauriRuntime()) {
    throw new Error("SimBrief refresh is only available in the desktop app.");
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke("refresh_simbrief_dispatch", { payload });
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeSimBriefError(error.message);
    }

    throw normalizeSimBriefError(String(error));
  }
}

export async function fetchSimBriefAircraftTypes() {
  if (!isTauriRuntime()) {
    return {
      types: [],
      source: "unavailable",
      warning: ""
    };
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke("fetch_simbrief_aircraft_types");
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeSimBriefError(error.message);
    }

    throw normalizeSimBriefError(String(error));
  }
}

export async function closeSimBriefDispatchWindow() {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("close_simbrief_dispatch_window");
  } catch {
    // Window may already be closed; ignore.
  }
}
