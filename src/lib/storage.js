import {
  IMPORT_LOG_FILE,
  SAVED_SCHEDULE_FILE,
  STORAGE_DIR
} from "./constants";

const PERSISTED_SCHEDULE_VERSION = 2;
const PERSISTED_SCHEDULE_ENCODING_GZIP = "gzip-base64";
const PERSISTED_SCHEDULE_ENCODING_PLAIN = "plain-json";
const LOG_SIZE_LIMIT_BYTES = 1024 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadFsModule() {
  return import("@tauri-apps/plugin-fs");
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
    ? `${compatibleEquipment.length} equipment profiles satisfy passenger, MTOW, MLW, and range limits.`
    : "No aircraft profiles satisfy passenger, MTOW, MLW, and range limits.";
}

function toClockValue(isoValue) {
  return typeof isoValue === "string" && isoValue.length >= 16 ? isoValue.slice(11, 16) : "";
}

function measureTextBytes(text) {
  return textEncoder.encode(text || "").length;
}

function buildNextLogText(existingText, incomingText) {
  const existing = existingText || "";
  const incoming = incomingText || "";

  if (!incoming) {
    return existing;
  }

  const combined = existing ? `${existing.trimEnd()}\n\n${incoming}` : incoming;

  if (measureTextBytes(combined) < LOG_SIZE_LIMIT_BYTES) {
    return combined;
  }

  return incoming;
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
      airline: flight.airline,
      airlineName: flight.airlineName,
      from: flight.from,
      to: flight.to,
      fromAirport: flight.fromAirport,
      toAirport: flight.toAirport,
      fromTimezone: flight.fromTimezone,
      toTimezone: flight.toTimezone,
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
    compatibleEquipment,
    compatibleEquipmentLabel: buildCompactLabel(compatibleEquipment, 3),
    compatibleFamilies,
    compatibleFamiliesLabel: buildCompactLabel(compatibleFamilies, 3),
    compatibilityCount: compatibleEquipment.length,
    compatibilityStatus: compatibleEquipment.length ? "compatible" : "none",
    compatibilityReason: buildCompatibilityReason(compatibleEquipment),
    isShortlisted: shortlistSet.has(flight.flightId),
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

  if (parsed?.version === PERSISTED_SCHEDULE_VERSION) {
    const payloadText = await decompressPersistedPayload(
      parsed.payloadEncoding,
      parsed.payload
    );
    const payload = JSON.parse(payloadText);
    return hydratePersistedSchedule(payload);
  }

  return parsed;
}

async function serializeSavedSchedule(savedSchedule) {
  const persistedSchedule = createPersistedSchedule(savedSchedule);
  const payloadText = JSON.stringify(persistedSchedule);
  const { payloadEncoding, payload } = await compressPersistedPayload(payloadText);

  return JSON.stringify({
    version: PERSISTED_SCHEDULE_VERSION,
    payloadEncoding,
    payload
  });
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

    return parseSavedScheduleText(text);
  }

  const text = window.localStorage.getItem("flight-planner.saved-schedule");
  return text ? parseSavedScheduleText(text) : null;
}

export async function writeSavedSchedule(savedSchedule) {
  const serializedSchedule = await serializeSavedSchedule(savedSchedule);

  if (isTauriRuntime()) {
    const { mkdir, writeTextFile, BaseDirectory } = await loadFsModule();
    await mkdir(STORAGE_DIR, {
      baseDir: BaseDirectory.AppData,
      recursive: true
    });

    await writeTextFile(
      SAVED_SCHEDULE_FILE,
      serializedSchedule,
      { baseDir: BaseDirectory.AppData }
    );
    return;
  }

  window.localStorage.setItem("flight-planner.saved-schedule", serializedSchedule);
}

async function resolveAppDataPath(relativePath) {
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const basePath = await appDataDir();
    return await join(basePath, relativePath);
  } catch {
    return relativePath;
  }
}

async function appendLogFile(relativePath, storageKey, logText) {
  if (!logText) {
    return null;
  }

  if (isTauriRuntime()) {
    try {
      const { mkdir, exists, readTextFile, writeTextFile, BaseDirectory } =
        await loadFsModule();

      await mkdir(STORAGE_DIR, {
        baseDir: BaseDirectory.AppData,
        recursive: true
      });

      const hasFile = await exists(relativePath, {
        baseDir: BaseDirectory.AppData
      });
      const existing = hasFile
        ? await readTextFile(relativePath, {
            baseDir: BaseDirectory.AppData
          })
        : "";
      const nextText = buildNextLogText(existing, logText);

      await writeTextFile(relativePath, nextText, {
        baseDir: BaseDirectory.AppData
      });

      return resolveAppDataPath(relativePath);
    } catch (error) {
      const existing = window.localStorage.getItem(storageKey) || "";
      const nextText = buildNextLogText(existing, logText);
      window.localStorage.setItem(storageKey, nextText);
      const reason = error instanceof Error ? error.message : String(error);
      return `browser-local-storage (fs write failed: ${reason})`;
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
    const { mkdir, exists, writeTextFile, BaseDirectory } = await loadFsModule();
    await mkdir(STORAGE_DIR, {
      baseDir: BaseDirectory.AppData,
      recursive: true
    });

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

export async function pickXmlScheduleFile() {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await loadFsModule();
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "PFPX Schedule XML",
          extensions: ["xml"]
        }
      ]
    });

    if (!path || Array.isArray(path)) {
      return null;
    }

    const fileName = path.split(/[\\/]/).pop();
    const xmlText = await readTextFile(path);
    return { fileName, xmlText };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml,text/xml";
    input.style.display = "none";

    input.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        document.body.removeChild(input);
        resolve(null);
        return;
      }

      const xmlText = await file.text();
      document.body.removeChild(input);
      resolve({
        fileName: file.name,
        xmlText
      });
    });

    document.body.appendChild(input);
    input.click();
  });
}
