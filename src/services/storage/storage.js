import {
  IMPORT_LOG_FILE,
  GETTING_STARTED_STATE_FILE,
  DEV_TOOLS_STATE_FILE,
  SAVED_SCHEDULE_FILE,
  SIMBRIEF_SETTINGS_FILE,
  UI_STATE_FILE,
  WHATS_NEW_STATE_FILE
} from "./storage.constants.js";
import {
  deriveCallsign,
  deriveFlightNumber
} from "../../domain/flights/flightIdentity.js";
import {
  getSelectedAircraftForFlight,
  normalizeAircraftCustomAirframe
} from "../../domain/aircraft/aircraftIdentity.js";

const LEGACY_PERSISTED_SCHEDULE_VERSION = 2;
const PERSISTED_SCHEDULE_VERSION = 4;
const PERSISTED_SCHEDULE_ENCODING_GZIP = "gzip-base64";
const PERSISTED_SCHEDULE_ENCODING_PLAIN = "plain-json";
const BROWSER_LOG_SIZE_LIMIT_BYTES = 1024 * 1024;
const DELTAVA_LOGBOOK_JSON_STORAGE_KEY = "flight-planner.deltava-logbook-json";
const DELTAVA_TOURS_CACHE_STORAGE_KEY = "flight-planner.deltava-tours-cache";
const DELTAVA_TOUR_PROGRESS_STORAGE_KEY = "flight-planner.deltava-tour-progress";
const GETTING_STARTED_STORAGE_KEY = "flight-planner.getting-started";
const WHATS_NEW_LAST_SEEN_RELEASE_STORAGE_KEY = "flight-planner.whats-new.last-seen-release-id";
const DELTAVA_LOGBOOK_STORAGE_DIR = "flight-planner/deltava-sync/logbook";
const DELTAVA_LOGBOOK_FALLBACK_FILE = "deltava-logbook.json";
const DELTAVA_TOURS_CACHE_FILE = "dva-tours-cache.json";
const DELTAVA_TOUR_PROGRESS_FILE = "dva-tour-progress.json";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const loggedCorruptStorageFiles = new Set();

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadFsModule() {
  return import("@tauri-apps/plugin-fs");
}

async function ensureAppDataRoot() {
  const { appDataDir } = await import("@tauri-apps/api/path");
  const { mkdir } = await loadFsModule();
  await mkdir(await appDataDir(), {
    recursive: true
  });
}

function buildCorruptStorageFileName(fileName) {
  const normalizedFileName = String(fileName || "").trim();
  const lastDotIndex = normalizedFileName.lastIndexOf(".");

  if (lastDotIndex <= 0) {
    return `${normalizedFileName}.corrupt.${Date.now()}`;
  }

  return `${normalizedFileName.slice(0, lastDotIndex)}.corrupt.${Date.now()}${normalizedFileName.slice(lastDotIndex)}`;
}

function logCorruptStorageFileOnce(storageLabel, fileName, error) {
  const warningKey = `${storageLabel}:${fileName}`;
  if (loggedCorruptStorageFiles.has(warningKey)) {
    return;
  }

  loggedCorruptStorageFiles.add(warningKey);
  console.warn(`[Storage] Ignoring malformed ${storageLabel}.`, {
    fileName,
    message: error instanceof Error ? error.message : String(error || "")
  });
}

async function quarantineCorruptStorageFile(fileName, storageLabel) {
  try {
    const { rename, BaseDirectory } = await loadFsModule();
    const corruptFileName = buildCorruptStorageFileName(fileName);

    await rename(fileName, corruptFileName, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData
    });
  } catch (error) {
    logCorruptStorageFileOnce(storageLabel, fileName, error);
  }
}

function getDefaultSimBriefSettings() {
  return {
    username: "",
    pilotId: "",
    useCurrentUtcForDispatchTime: false,
    dispatchUnits: "LBS",
    departureOffsetMinutes: 0,
    customAirframes: []
  };
}

// Normalizes the saved SimBrief departure offset to the allowed discrete values.
export function normalizeSimBriefDepartureOffsetMinutes(value) {
  const normalizedValue = Number(value);
  return normalizedValue === 30 || normalizedValue === 45 || normalizedValue === 60 || normalizedValue === 90
    ? normalizedValue
    : 0;
}

function buildCompactLabel(values, visibleCount) {
  if (!values.length) {
    return "None";
  }

  if (values.length <= visibleCount) {
    return values.join(", ");
  }

  return `${values.slice(0, visibleCount).join(", ")} +${values.length - visibleCount}`;
}

function buildCompatibilityReason(compatibleEquipment) {
  return compatibleEquipment.length
    ? `${compatibleEquipment.length} equipment profiles are within the route range.`
    : "No aircraft profiles are within the route range.";
}

function toClockValue(isoValue) {
  return typeof isoValue === "string" && isoValue.length >= 16 ? isoValue.slice(11, 16) : "";
}

function normalizeSimBriefRoutePoint(point) {
  if (!point || typeof point !== "object") {
    return null;
  }

  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    ident: String(point.ident || "").trim(),
    latitude,
    longitude
  };
}

function normalizeSimBriefPax(pax) {
  if (pax === null || pax === undefined || pax === "") {
    return null;
  }

  if (typeof pax === "number") {
    return Number.isInteger(pax) ? pax : null;
  }

  const numeric = Number(String(pax).trim());
  return Number.isInteger(numeric) ? numeric : null;
}

function getDefaultGettingStartedState() {
  return {
    gettingStartedDismissed: false,
    gettingStartedFinalized: false,
    addonSetupSkipped: false
  };
}

function getDefaultDeltaVirtualToursCache() {
  return {
    source: "dva",
    lastSyncAt: null,
    ok: false,
    totalListTours: 0,
    candidateTours: 0,
    syncedTours: 0,
    failedTourIds: [],
    message: "",
    tours: []
  };
}

function normalizeDeltaVirtualToursCache(cache) {
  const defaultCache = getDefaultDeltaVirtualToursCache();
  const tours = Array.isArray(cache?.tours) ? cache.tours : [];
  const failedTourIds = Array.isArray(cache?.failedTourIds)
    ? cache.failedTourIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  return {
    source: String(cache?.source || defaultCache.source).trim().toLowerCase() === "dva"
      ? "dva"
      : defaultCache.source,
    lastSyncAt: String(cache?.lastSyncAt || "").trim() || null,
    ok: Boolean(cache?.ok),
    totalListTours: Number.isFinite(cache?.totalListTours) ? cache.totalListTours : 0,
    candidateTours: Number.isFinite(cache?.candidateTours) ? cache.candidateTours : 0,
    syncedTours: Number.isFinite(cache?.syncedTours) ? cache.syncedTours : 0,
    failedTourIds,
    message: String(cache?.message || "").trim(),
    tours
  };
}

function getDefaultDeltaVirtualTourProgress() {
  return {
    source: "deltava-logbook",
    lastSyncAt: null,
    tourProgress: {}
  };
}

function normalizeDeltaVirtualTourProgress(progress) {
  const defaultProgress = getDefaultDeltaVirtualTourProgress();
  const rawTourProgress =
    progress?.tourProgress && typeof progress.tourProgress === "object"
      ? progress.tourProgress
      : {};
  const tourProgress = {};

  for (const [tourPath, tourEntry] of Object.entries(rawTourProgress)) {
    if (!tourEntry || typeof tourEntry !== "object") {
      continue;
    }

    const rawRows = tourEntry.rows && typeof tourEntry.rows === "object" ? tourEntry.rows : {};
    const rows = {};

    for (const [tourRowId, rowEntry] of Object.entries(rawRows)) {
      if (!rowEntry || typeof rowEntry !== "object" || !rowEntry.completed) {
        continue;
      }

      rows[String(tourRowId || "").trim()] = {
        completed: true,
        completedAt: String(rowEntry.completedAt || rowEntry.completed_at || "").trim() || null,
        completionOrder: Number.isFinite(rowEntry.completionOrder)
          ? rowEntry.completionOrder
          : Number.isFinite(rowEntry.completion_order)
            ? rowEntry.completion_order
            : null,
        source: String(rowEntry.source || defaultProgress.source).trim() || defaultProgress.source
      };
    }

    const normalizedTourPath = String(tourPath || "").trim();
    if (normalizedTourPath && Object.keys(rows).length) {
      tourProgress[normalizedTourPath] = { rows };
    }
  }

  return {
    source:
      String(progress?.source || defaultProgress.source).trim().toLowerCase() === "deltava-logbook"
        ? "deltava-logbook"
        : defaultProgress.source,
    lastSyncAt: String(progress?.lastSyncAt || progress?.last_sync_at || "").trim() || null,
    tourProgress
  };
}

function normalizeGettingStartedState(state) {
  return {
    gettingStartedDismissed: Boolean(state?.gettingStartedDismissed),
    gettingStartedFinalized: Boolean(state?.gettingStartedFinalized),
    addonSetupSkipped: Boolean(state?.addonSetupSkipped)
  };
}

function normalizeWhatsNewReleaseId(value) {
  return String(value || "").trim();
}

function isValidSimBriefXmlId(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return false;
  }

  if (/^\d{10}_[A-Z0-9]{10}$/.test(normalized)) {
    return true;
  }

  return /^[A-Z0-9]+_XML_\d+$/.test(normalized);
}

function normalizeSimBriefPlan(plan) {
  if (!plan || typeof plan !== "object") {
    return null;
  }

  const rawRoutePoints = Array.isArray(plan.routePoints)
    ? plan.routePoints
    : Array.isArray(plan.route_points)
      ? plan.route_points
      : [];
  const routePoints = rawRoutePoints
    .map(normalizeSimBriefRoutePoint)
    .filter(Boolean);
  const normalizedOfpXmlId = String(plan.ofpXmlId || plan.dvaSimBriefId || "").trim().toUpperCase();
  const normalized = {
    status: String(plan.status || "").trim(),
    generatedAtUtc: String(plan.generatedAtUtc || "").trim(),
    staticId: String(plan.staticId || "").trim(),
    ofpXmlId: isValidSimBriefXmlId(normalizedOfpXmlId) ? normalizedOfpXmlId : "",
    aircraftType: String(plan.aircraftType || "").trim(),
    callsign: String(plan.callsign || "").trim(),
    route: String(plan.route || "").trim(),
    cruiseAltitude: String(plan.cruiseAltitude || "").trim(),
    alternate: String(plan.alternate || "").trim(),
    ete: String(plan.ete || "").trim(),
    blockFuel: String(plan.blockFuel || "").trim(),
    pax: normalizeSimBriefPax(plan.pax),
    ofpUrl: String(plan.ofpUrl || "").trim(),
    pdfUrl: String(plan.pdfUrl || "").trim(),
    routePoints
  };

  const hasMeaningfulTextValue = Object.entries(normalized).some(([key, value]) => {
    if (key === "routePoints") {
      return routePoints.length > 0;
    }

    if (key === "pax") {
      return value !== null && value !== undefined && value !== "";
    }

    return Boolean(value);
  });

  return hasMeaningfulTextValue ? normalized : null;
}

function measureTextBytes(text) {
  return textEncoder.encode(text || "").length;
}

function normalizeLogEntryText(text) {
  return String(text || "").replace(/[\r\n]+$/g, "");
}

function trimLogTextToLimit(text, limitBytes) {
  const normalizedText = String(text || "");
  if (measureTextBytes(normalizedText) <= limitBytes) {
    return normalizedText;
  }

  const lines = normalizedText.split("\n");

  while (lines.length > 1 && measureTextBytes(lines.join("\n")) > limitBytes) {
    lines.shift();
  }

  let trimmed = lines.join("\n");

  if (trimmed && !trimmed.endsWith("\n")) {
    trimmed += "\n";
  }

  if (measureTextBytes(trimmed) <= limitBytes) {
    return trimmed;
  }

  // Last resort: preserve the newest bytes when a single line is too large.
  const bytes = textEncoder.encode(trimmed);
  const slicedBytes = bytes.slice(Math.max(0, bytes.length - limitBytes));
  return textDecoder.decode(slicedBytes);
}

function buildNextLogText(existingText, incomingText) {
  const existing = existingText || "";
  const incoming = normalizeLogEntryText(incomingText);

  if (!incoming) {
    return existing;
  }

  const separator = existing && !existing.endsWith("\n") ? "\n" : "";
  const combined = `${existing}${separator}${incoming}\n`;
  return trimLogTextToLimit(combined, BROWSER_LOG_SIZE_LIMIT_BYTES);
}

function normalizePersistedBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function uint8ArrayToBase64(bytes) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 32768) {
    const chunk = bytes.subarray(index, index + 32768);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUint8Array(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function compressPersistedPayload(text) {
  if (typeof CompressionStream === "undefined") {
    return {
      payloadEncoding: PERSISTED_SCHEDULE_ENCODING_PLAIN,
      payload: text
    };
  }

  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  await writer.write(textEncoder.encode(text));
  await writer.close();

  const compressed = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  return {
    payloadEncoding: PERSISTED_SCHEDULE_ENCODING_GZIP,
    payload: uint8ArrayToBase64(compressed)
  };
}

async function decompressPersistedPayload(payloadEncoding, payload) {
  if (payloadEncoding === PERSISTED_SCHEDULE_ENCODING_PLAIN) {
    return payload;
  }

  if (payloadEncoding !== PERSISTED_SCHEDULE_ENCODING_GZIP) {
    throw new Error(`Unsupported saved schedule encoding: ${payloadEncoding}`);
  }

  if (typeof DecompressionStream === "undefined") {
    throw new Error("This runtime cannot read compressed saved schedules.");
  }

  const compressedBytes = base64ToUint8Array(payload);
  const stream = new DecompressionStream("gzip");
  const writer = stream.writable.getWriter();
  await writer.write(compressedBytes);
  await writer.close();

  const decompressed = await new Response(stream.readable).arrayBuffer();
  return textDecoder.decode(decompressed);
}

function buildPersistedCompatibilityCatalog(flights = []) {
  const compatibilityCatalog = [];
  const compatibilityMap = new Map();

  const persistedFlights = flights.map((flight) => {
    const compatibleEquipment = Array.isArray(flight.compatibleEquipment)
      ? [...flight.compatibleEquipment]
      : [];
    const compatibleFamilies = Array.isArray(flight.compatibleFamilies)
      ? [...flight.compatibleFamilies]
      : [];
    const compatibilityKey = JSON.stringify([compatibleEquipment, compatibleFamilies]);
    let compatibilityRef = compatibilityMap.get(compatibilityKey);

    if (compatibilityRef === undefined) {
      compatibilityRef = compatibilityCatalog.length;
      compatibilityCatalog.push({
        compatibleEquipment,
        compatibleFamilies
      });
      compatibilityMap.set(compatibilityKey, compatibilityRef);
    }

    return {
      flightId: flight.flightId,
      flightCode: flight.flightCode,
      flightNumber: deriveFlightNumber(flight),
      airline: flight.airline,
      airlineName: flight.airlineName,
      airlineIcao: String(flight.airlineIcao || "").trim().toUpperCase(),
      callsign: deriveCallsign(flight),
      from: flight.from,
      to: flight.to,
      fromAirport: flight.fromAirport,
      toAirport: flight.toAirport,
      fromTimezone: flight.fromTimezone,
      toTimezone: flight.toTimezone,
      missingAirportIcaos: Array.isArray(flight.missingAirportIcaos) ? flight.missingAirportIcaos : [],
      hasMissingAirportData: Boolean(flight.hasMissingAirportData),
      stdLocal: flight.stdLocal,
      staLocal: flight.staLocal,
      stdUtc: flight.stdUtc,
      staUtc: flight.staUtc,
      stdUtcMillis: flight.stdUtcMillis,
      staUtcMillis: flight.staUtcMillis,
      mtow: flight.mtow,
      mlw: flight.mlw,
      maxPax: flight.maxPax,
      blockMinutes: flight.blockMinutes,
      distanceNm: flight.distanceNm,
      selectedAircraft:
        String(flight.selectedAircraft || "").trim() ||
        getSelectedAircraftForFlight(flight) ||
        String(flight.simbriefSelectedType || "").trim(),
      simbriefPlan: normalizeSimBriefPlan(flight.simbriefPlan),
      boardSequence: Number.isInteger(flight.boardSequence) ? flight.boardSequence : null,
      compatibilityRef,
      notes: flight.notes || ""
    };
  });

  return { compatibilityCatalog, persistedFlights };
}

function createPersistedSchedule(savedSchedule) {
  const { compatibilityCatalog, persistedFlights } = buildPersistedCompatibilityCatalog(
    savedSchedule?.flights || []
  );

  return {
    importedAt: savedSchedule.importedAt,
    sourceFileName: savedSchedule.sourceFileName || null,
    importSummary: savedSchedule.importSummary || null,
    shortlist: Array.isArray(savedSchedule.shortlist) ? savedSchedule.shortlist : [],
    uiState: savedSchedule.uiState || null,
    compatibilityCatalog,
    flights: persistedFlights
  };
}

function hydratePersistedFlight(flight, compatibilityEntry, shortlistSet) {
  const compatibleEquipment = Array.isArray(compatibilityEntry?.compatibleEquipment)
    ? compatibilityEntry.compatibleEquipment
    : [];
  const compatibleFamilies = Array.isArray(compatibilityEntry?.compatibleFamilies)
    ? compatibilityEntry.compatibleFamilies
    : [];

  return {
    ...flight,
    route: `${flight.from}-${flight.to}`,
    localDepartureClock: toClockValue(flight.stdLocal),
    utcDepartureClock: toClockValue(flight.stdUtc),
    flightNumber: deriveFlightNumber(flight),
    airlineIcao: String(flight.airlineIcao || "").trim().toUpperCase(),
    callsign: deriveCallsign(flight),
    compatibleEquipment,
    compatibleEquipmentLabel: buildCompactLabel(compatibleEquipment, 3),
    compatibleFamilies,
    compatibleFamiliesLabel: buildCompactLabel(compatibleFamilies, 3),
    compatibilityCount: compatibleEquipment.length,
    compatibilityStatus: compatibleEquipment.length ? "compatible" : "none",
    compatibilityReason: buildCompatibilityReason(compatibleEquipment),
    missingAirportIcaos: Array.isArray(flight.missingAirportIcaos) ? flight.missingAirportIcaos : [],
    hasMissingAirportData: Boolean(flight.hasMissingAirportData),
    selectedAircraft:
      String(flight.selectedAircraft || "").trim() ||
      getSelectedAircraftForFlight(flight) ||
      String(flight.simbriefSelectedType || "").trim(),
    simbriefSelectedType: "",
    simbriefPlan: normalizeSimBriefPlan(flight.simbriefPlan),
    isShortlisted: shortlistSet.has(flight.flightId),
    boardSequence: Number.isInteger(flight.boardSequence) ? flight.boardSequence : null,
    notes: flight.notes || ""
  };
}

function hydratePersistedSchedule(savedSchedule) {
  if (!savedSchedule?.flights?.length) {
    return {
      importedAt: savedSchedule?.importedAt || null,
      sourceFileName: savedSchedule?.sourceFileName || null,
      importSummary: savedSchedule?.importSummary || null,
      shortlist: Array.isArray(savedSchedule?.shortlist) ? savedSchedule.shortlist : [],
      uiState: savedSchedule?.uiState || null,
      flights: []
    };
  }

  const shortlist = Array.isArray(savedSchedule.shortlist) ? savedSchedule.shortlist : [];
  const shortlistSet = new Set(shortlist);
  const compatibilityCatalog = Array.isArray(savedSchedule.compatibilityCatalog)
    ? savedSchedule.compatibilityCatalog
    : [];

  return {
    importedAt: savedSchedule.importedAt,
    sourceFileName: savedSchedule.sourceFileName || null,
    importSummary: savedSchedule.importSummary || null,
    shortlist,
    uiState: savedSchedule.uiState || null,
    flights: savedSchedule.flights.map((flight) =>
      hydratePersistedFlight(flight, compatibilityCatalog[flight.compatibilityRef], shortlistSet)
    )
  };
}

async function parseSavedScheduleText(text) {
  if (!text) {
    return null;
  }

  const parsed = JSON.parse(text);

  if (
    parsed?.version === LEGACY_PERSISTED_SCHEDULE_VERSION ||
    parsed?.version === 3 ||
    parsed?.version === PERSISTED_SCHEDULE_VERSION
  ) {
    const payloadText = await decompressPersistedPayload(
      parsed.payloadEncoding,
      parsed.payload
    );
    const payload = JSON.parse(payloadText);
    return hydratePersistedSchedule(payload);
  }

  if (Array.isArray(parsed?.flights)) {
    return hydratePersistedSchedule({
      importedAt: parsed.importedAt,
      sourceFileName: parsed.sourceFileName || null,
      importSummary: parsed.importSummary || null,
      shortlist: Array.isArray(parsed.shortlist) ? parsed.shortlist : [],
      uiState: parsed.uiState || null,
      compatibilityCatalog: Array.isArray(parsed.compatibilityCatalog)
        ? parsed.compatibilityCatalog
        : parsed.flights.map((flight) => ({
            compatibleEquipment: Array.isArray(flight?.compatibleEquipment)
              ? flight.compatibleEquipment
              : [],
            compatibleFamilies: Array.isArray(flight?.compatibleFamilies)
              ? flight.compatibleFamilies
              : []
          })),
      flights: parsed.flights.map((flight, index) => ({
        ...flight,
        compatibilityRef: Number.isInteger(flight?.compatibilityRef) ? flight.compatibilityRef : index
      }))
    });
  }

  return parsed;
}

async function serializeSavedSchedule(savedSchedule) {
  const persistedSchedule = createPersistedSchedule(savedSchedule);
  return JSON.stringify(persistedSchedule);
}

export async function readSavedSchedule() {
  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(SAVED_SCHEDULE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return null;
    }

    const text = await readTextFile(SAVED_SCHEDULE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    try {
      return await parseSavedScheduleText(text);
    } catch (error) {
      await quarantineCorruptStorageFile(SAVED_SCHEDULE_FILE, "saved schedule");
      logCorruptStorageFileOnce("saved schedule", SAVED_SCHEDULE_FILE, error);
      return null;
    }
  }

  const text = window.localStorage.getItem("flight-planner.saved-schedule");
  if (!text) {
    return null;
  }

  try {
    return await parseSavedScheduleText(text);
  } catch (error) {
    logCorruptStorageFileOnce("saved schedule", "flight-planner.saved-schedule", error);
    return null;
  }
}

export async function writeSavedSchedule(savedSchedule) {
  const serializedSchedule = await serializeSavedSchedule(savedSchedule);

  if (isTauriRuntime()) {
    const { writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    await writeTextFile(
      SAVED_SCHEDULE_FILE,
      serializedSchedule,
      { baseDir: BaseDirectory.AppData }
    );
    return;
  }

  window.localStorage.setItem("flight-planner.saved-schedule", serializedSchedule);
}

export async function readSavedUiState() {
  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(UI_STATE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return null;
    }

    const text = await readTextFile(UI_STATE_FILE, {
      baseDir: BaseDirectory.AppData
    });
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      await quarantineCorruptStorageFile(UI_STATE_FILE, "ui state");
      logCorruptStorageFileOnce("ui state", UI_STATE_FILE, error);
      return null;
    }
  }

  const text = window.localStorage.getItem("flight-planner.ui-state");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    logCorruptStorageFileOnce("ui state", "flight-planner.ui-state", error);
    return null;
  }
}

export async function writeSavedUiState(uiState) {
  const serialized = JSON.stringify(uiState || {});

  if (isTauriRuntime()) {
    const { writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    await writeTextFile(UI_STATE_FILE, serialized, {
      baseDir: BaseDirectory.AppData
    });
    return;
  }

  window.localStorage.setItem("flight-planner.ui-state", serialized);
}

export async function readSavedDevToolsEnabled() {
  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(DEV_TOOLS_STATE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return null;
    }

    const text = await readTextFile(DEV_TOOLS_STATE_FILE, {
      baseDir: BaseDirectory.AppData
    });
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      return normalizePersistedBoolean(parsed?.enabled);
    } catch (error) {
      await quarantineCorruptStorageFile(DEV_TOOLS_STATE_FILE, "dev tools state");
      logCorruptStorageFileOnce("dev tools state", DEV_TOOLS_STATE_FILE, error);
      return null;
    }
  }

  const text = window.localStorage.getItem("flight-planner.dev-tools-enabled");
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }

  return null;
}

export async function writeSavedDevToolsEnabled(enabled) {
  const serialized = JSON.stringify({ enabled: Boolean(enabled) });

  if (isTauriRuntime()) {
    const { writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    await writeTextFile(DEV_TOOLS_STATE_FILE, serialized, {
      baseDir: BaseDirectory.AppData
    });
    return;
  }

  window.localStorage.setItem("flight-planner.dev-tools-enabled", enabled ? "true" : "false");
}

export async function readSimBriefSettings() {
  function normalizeCustomAirframe(entry) {
    return normalizeAircraftCustomAirframe(entry);
  }

  function normalizeSettings(parsed) {
    const dispatchUnits = String(parsed?.dispatchUnits || "").trim().toUpperCase();
    return {
      username: String(parsed?.username || "").trim(),
      pilotId: String(parsed?.pilotId || "").trim(),
      useCurrentUtcForDispatchTime: Boolean(parsed?.useCurrentUtcForDispatchTime),
      dispatchUnits: dispatchUnits === "KGS" ? "KGS" : "LBS",
      departureOffsetMinutes: normalizeSimBriefDepartureOffsetMinutes(
        parsed?.departureOffsetMinutes
      ),
      customAirframes: Array.isArray(parsed?.customAirframes)
        ? parsed.customAirframes.map(normalizeCustomAirframe).filter(Boolean)
        : []
    };
  }

  const defaultSettings = getDefaultSimBriefSettings();

  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(SIMBRIEF_SETTINGS_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return defaultSettings;
    }

    const text = await readTextFile(SIMBRIEF_SETTINGS_FILE, {
      baseDir: BaseDirectory.AppData
    });
    if (!text) {
      return defaultSettings;
    }

    try {
      return normalizeSettings(JSON.parse(text));
    } catch (error) {
      await quarantineCorruptStorageFile(SIMBRIEF_SETTINGS_FILE, "simbrief settings");
      logCorruptStorageFileOnce("simbrief settings", SIMBRIEF_SETTINGS_FILE, error);
      return defaultSettings;
    }
  }

  const text = window.localStorage.getItem("flight-planner.simbrief-settings");
  if (!text) {
    return defaultSettings;
  }

  try {
    return normalizeSettings(JSON.parse(text));
  } catch (error) {
    logCorruptStorageFileOnce("simbrief settings", "flight-planner.simbrief-settings", error);
    return defaultSettings;
  }
}

export async function writeSimBriefSettings(settings) {
  const serialized = JSON.stringify({
    username: String(settings?.username || "").trim(),
    pilotId: String(settings?.pilotId || "").trim(),
    useCurrentUtcForDispatchTime: Boolean(settings?.useCurrentUtcForDispatchTime),
    dispatchUnits: String(settings?.dispatchUnits || "LBS").trim().toUpperCase() === "KGS"
      ? "KGS"
      : "LBS",
    departureOffsetMinutes: normalizeSimBriefDepartureOffsetMinutes(
      settings?.departureOffsetMinutes
    ),
    customAirframes: Array.isArray(settings?.customAirframes)
      ? settings.customAirframes
          .map(normalizeAircraftCustomAirframe)
          .filter(Boolean)
      : []
  });

  if (isTauriRuntime()) {
    const { writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    await writeTextFile(SIMBRIEF_SETTINGS_FILE, serialized, {
      baseDir: BaseDirectory.AppData
    });
    return;
  }

  window.localStorage.setItem("flight-planner.simbrief-settings", serialized);
}

export async function readGettingStartedState() {
  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(GETTING_STARTED_STATE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return getDefaultGettingStartedState();
    }

    try {
      const text = await readTextFile(GETTING_STARTED_STATE_FILE, {
        baseDir: BaseDirectory.AppData
      });
      return normalizeGettingStartedState(text ? JSON.parse(text) : null);
    } catch {
      return getDefaultGettingStartedState();
    }
  }

  const text = window.localStorage.getItem(GETTING_STARTED_STORAGE_KEY);
  if (!text) {
    return getDefaultGettingStartedState();
  }

  try {
    return normalizeGettingStartedState(JSON.parse(text));
  } catch {
    return getDefaultGettingStartedState();
  }
}

export async function readDeltaVirtualToursCache() {
  const defaultCache = getDefaultDeltaVirtualToursCache();

  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(DELTAVA_TOURS_CACHE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return defaultCache;
    }

    try {
      const text = await readTextFile(DELTAVA_TOURS_CACHE_FILE, {
        baseDir: BaseDirectory.AppData
      });
      return normalizeDeltaVirtualToursCache(text ? JSON.parse(text) : null);
    } catch {
      return defaultCache;
    }
  }

  const text = window.localStorage.getItem(DELTAVA_TOURS_CACHE_STORAGE_KEY);
  if (!text) {
    return defaultCache;
  }

  try {
    return normalizeDeltaVirtualToursCache(JSON.parse(text));
  } catch {
    return defaultCache;
  }
}

export async function writeDeltaVirtualToursCache(cache) {
  const serialized = JSON.stringify(normalizeDeltaVirtualToursCache(cache));

  if (isTauriRuntime()) {
    const { writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    await writeTextFile(DELTAVA_TOURS_CACHE_FILE, serialized, {
      baseDir: BaseDirectory.AppData
    });
    return;
  }

  window.localStorage.setItem(DELTAVA_TOURS_CACHE_STORAGE_KEY, serialized);
}

export async function readDeltaVirtualTourProgress() {
  const defaultProgress = getDefaultDeltaVirtualTourProgress();

  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(DELTAVA_TOUR_PROGRESS_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return defaultProgress;
    }

    try {
      const text = await readTextFile(DELTAVA_TOUR_PROGRESS_FILE, {
        baseDir: BaseDirectory.AppData
      });
      return normalizeDeltaVirtualTourProgress(text ? JSON.parse(text) : null);
    } catch {
      return defaultProgress;
    }
  }

  const text = window.localStorage.getItem(DELTAVA_TOUR_PROGRESS_STORAGE_KEY);
  if (!text) {
    return defaultProgress;
  }

  try {
    return normalizeDeltaVirtualTourProgress(JSON.parse(text));
  } catch {
    return defaultProgress;
  }
}

export async function writeDeltaVirtualTourProgress(progress) {
  const serialized = JSON.stringify(normalizeDeltaVirtualTourProgress(progress));

  if (isTauriRuntime()) {
    const { writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    await writeTextFile(DELTAVA_TOUR_PROGRESS_FILE, serialized, {
      baseDir: BaseDirectory.AppData
    });
    return;
  }

  window.localStorage.setItem(DELTAVA_TOUR_PROGRESS_STORAGE_KEY, serialized);
}

export async function writeGettingStartedState(state) {
  const serialized = JSON.stringify(normalizeGettingStartedState(state));

  if (isTauriRuntime()) {
    const { writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    await writeTextFile(GETTING_STARTED_STATE_FILE, serialized, {
      baseDir: BaseDirectory.AppData
    });
    return;
  }

  window.localStorage.setItem(GETTING_STARTED_STORAGE_KEY, serialized);
}

export async function readLastSeenWhatsNewReleaseId() {
  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(WHATS_NEW_STATE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return "";
    }

    try {
      const text = await readTextFile(WHATS_NEW_STATE_FILE, {
        baseDir: BaseDirectory.AppData
      });
      return normalizeWhatsNewReleaseId(text);
    } catch {
      return "";
    }
  }

  return normalizeWhatsNewReleaseId(
    window.localStorage.getItem(WHATS_NEW_LAST_SEEN_RELEASE_STORAGE_KEY)
  );
}

export async function saveLastSeenWhatsNewReleaseId(version) {
  const normalizedVersion = normalizeWhatsNewReleaseId(version);

  if (isTauriRuntime()) {
    const { writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    await writeTextFile(WHATS_NEW_STATE_FILE, normalizedVersion, {
      baseDir: BaseDirectory.AppData
    });
    return;
  }

  window.localStorage.setItem(WHATS_NEW_LAST_SEEN_RELEASE_STORAGE_KEY, normalizedVersion);
}

async function resolveAppDataPath(relativePath) {
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const basePath = await appDataDir();
  return await join(basePath, relativePath);
}

async function appendLogFile(relativePath, storageKey, logText) {
  if (!logText) {
    return null;
  }

  if (isTauriRuntime()) {
    if (relativePath !== IMPORT_LOG_FILE) {
      return null;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const normalized = normalizeLogEntryText(logText);
      if (!normalized) {
        return null;
      }

      await invoke("append_app_log_text", { text: normalized });
      return resolveAppDataPath(relativePath);
    } catch {
      // Tauri runtime must never fall back to browser storage for logs.
      return null;
    }
  }

  const existing = window.localStorage.getItem(storageKey) || "";
  const nextText = buildNextLogText(existing, logText);
  window.localStorage.setItem(storageKey, nextText);
  return "browser-local-storage";
}

async function ensureLogFile(relativePath, storageKey) {
  const header = `[${new Date().toISOString()}] [App] log-file-created`;

  if (isTauriRuntime()) {
    const { exists, writeTextFile, BaseDirectory } = await loadFsModule();
    await ensureAppDataRoot();
    const hasFile = await exists(relativePath, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      await writeTextFile(relativePath, `${header}\n`, {
        baseDir: BaseDirectory.AppData
      });
    }

    return resolveAppDataPath(relativePath);
  }

  const existing = window.localStorage.getItem(storageKey);
  if (!existing) {
    window.localStorage.setItem(storageKey, `${header}\n`);
  }
  return "browser-local-storage";
}

async function openLogFile(relativePath, storageKey) {
  if (isTauriRuntime()) {
    const { openPath, revealItemInDir } = await import("@tauri-apps/plugin-opener");
    const fullPath = await ensureLogFile(relativePath, storageKey);
    try {
      await openPath(fullPath);
      return;
    } catch (error) {
      try {
        await revealItemInDir(fullPath);
      } catch {
        // no-op: we'll throw the original open error below
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to open log file: ${fullPath} (${reason})`);
    }
  }

  await ensureLogFile(relativePath, storageKey);
  const text = window.localStorage.getItem(storageKey);
  if (text) {
    window.alert(text);
  }
}

export async function appendImportLog(logText) {
  return appendLogFile(IMPORT_LOG_FILE, "flight-planner.import-log", logText);
}

export async function openImportLog() {
  return openLogFile(IMPORT_LOG_FILE, "flight-planner.import-log");
}

export async function confirmOverwriteSchedule() {
  if (isTauriRuntime()) {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    return confirm(
      "Importing a new schedule will replace the current saved schedule and shortlist. Continue?",
      {
        title: "Replace Saved Schedule",
        kind: "warning",
        okLabel: "Replace"
      }
    );
  }

  return window.confirm(
    "Importing a new schedule will replace the current saved schedule and shortlist. Continue?"
  );
}

export async function confirmDeleteUserData() {
  const message =
    "Delete all saved user data for this app? This removes saved schedules, SimBrief settings, addon folder roots, logs, stored Delta Virtual login settings, and Delta Virtual tour progress.";

  if (isTauriRuntime()) {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    return confirm(message, {
      title: "Delete User Info",
      kind: "warning",
      okLabel: "Delete"
    });
  }

  return window.confirm(message);
}

export async function deleteStoredUserData() {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_user_data");
  }

  for (const key of [
    "flight-planner.saved-schedule",
    "flight-planner.ui-state",
    "flight-planner.simbrief-settings",
    "flight-planner.deltava-auth",
    GETTING_STARTED_STORAGE_KEY,
    "flight-planner.import-log",
    DELTAVA_LOGBOOK_JSON_STORAGE_KEY,
    DELTAVA_TOUR_PROGRESS_STORAGE_KEY,
    WHATS_NEW_LAST_SEEN_RELEASE_STORAGE_KEY,
    "flight-planner.theme",
    "flight-planner.dev-tools-enabled",
    "flight-planner.dev-window-width"
  ]) {
    window.localStorage.removeItem(key);
  }
}

async function pickTextFile({ accept, filterName, extensions }) {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await loadFsModule();
    const path = await open({
      multiple: false,
      filters: [
        {
          name: filterName,
          extensions
        }
      ]
    });

    if (!path || Array.isArray(path)) {
      return null;
    }

    const fileName = path.split(/[\\/]/).pop();
    const text = await readTextFile(path);
    return { fileName, text };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";

    input.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        document.body.removeChild(input);
        resolve(null);
        return;
      }

      const text = await file.text();
      document.body.removeChild(input);
      resolve({
        fileName: file.name,
        text
      });
    });

    document.body.appendChild(input);
    input.click();
  });
}

export async function pickXmlScheduleFile() {
  const selectedFile = await pickTextFile({
    accept: ".xml,text/xml",
    filterName: "Schedule XML",
    extensions: ["xml"]
  });

  if (!selectedFile) {
    return null;
  }

  return {
    fileName: selectedFile.fileName,
    xmlText: selectedFile.text
  };
}

export async function pickJsonLogbookFile() {
  const selectedFile = await pickTextFile({
    accept: ".json,application/json",
    filterName: "Logbook JSON",
    extensions: ["json"]
  });

  if (!selectedFile) {
    return null;
  }

  return {
    fileName: selectedFile.fileName,
    jsonText: selectedFile.text
  };
}

function sanitizeLogbookFilename(fileName) {
  const rawName = String(fileName || "").split(/[\\/]/).pop()?.trim() || DELTAVA_LOGBOOK_FALLBACK_FILE;
  const sanitized = rawName
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");
  const normalized = sanitized || DELTAVA_LOGBOOK_FALLBACK_FILE;

  return normalized.toLowerCase().endsWith(".json") ? normalized : `${normalized}.json`;
}

export async function storeDeltaVirtualLogbookJson(fileName, jsonText) {
  const trimmed = String(jsonText || "").trim();
  if (!trimmed) {
    throw new Error("Logbook JSON was empty.");
  }

  try {
    JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Logbook JSON was invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  const normalizedFileName = sanitizeLogbookFilename(fileName);

  if (isTauriRuntime()) {
    const { mkdir, writeTextFile, BaseDirectory } = await loadFsModule();
    await mkdir(DELTAVA_LOGBOOK_STORAGE_DIR, {
      baseDir: BaseDirectory.AppLocalData,
      recursive: true
    });

    await writeTextFile(`${DELTAVA_LOGBOOK_STORAGE_DIR}/${normalizedFileName}`, trimmed, {
      baseDir: BaseDirectory.AppLocalData
    });
    return;
  }

  window.localStorage.setItem(
    DELTAVA_LOGBOOK_JSON_STORAGE_KEY,
    JSON.stringify({
      fileName: normalizedFileName,
      jsonText: trimmed
    })
  );
}
