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

const SIMBRIEF_FALLBACK_TYPE_MAP = {
  "A220-100": "BCS1",
  "A220-300": "BCS3",
  "A300-200": "A30B",
  "A300-600": "A306",
  A310: "A310",
  A318: "A318",
  A319: "A319",
  A320: "A320",
  A320NEO: "A20N",
  A321: "A321",
  A321NEO: "A21N",
  "A330-200": "A332",
  "A330-300": "A333",
  "A330-900": "A339",
  "A340-200": "A342",
  "A340-300": "A343",
  "A340-500": "A345",
  "A340-600": "A346",
  "A350-900": "A359",
  "A350-1000": "A35K",
  "A380-800": "A388",
  "ATR-42": "AT46",
  "ATR-72": "AT76",
  "AVRO RJ-100": "RJ1H",
  "AVRO RJ-85": "RJ85",
  "AVRO RJ-70": "RJ70",
  "B717-200": "B712",
  "B737 MAX 7": "B37M",
  "B737 MAX 8": "B38M",
  "B737 MAX 9": "B39M",
  "B737-200": "B732",
  "B737-300": "B733",
  "B737-400": "B734",
  "B737-500": "B735",
  "B737-600": "B736",
  "B737-700": "B737",
  "B737-800": "B738",
  "B737-900": "B739",
  "B737-900ER": "B739",
  "B737-BBJ1": "BBJ1",
  "B737-BBJ2": "BBJ2",
  "B747-400": "B744",
  "B747-400F": "B74F",
  "B747-8": "B748",
  "B747-8F": "B48F",
  "B757-200": "B752",
  "B757-300": "B753",
  "B767-200": "B762",
  "B767-200ER": "B762",
  "B767-300": "B763",
  "B767-300ER": "B763",
  "B767-400ER": "B764",
  "B777-200": "B772",
  "B777-200ER": "B772",
  "B777-200LR": "B77L",
  "B777-300": "B773",
  "B777-300ER": "B77W",
  "B787-8": "B788",
  "B787-9": "B789",
  "B787-10": "B78X",
  "CRJ-1000": "CRJX",
  "CRJ-200": "CRJ2",
  "CRJ-700": "CRJ7",
  "CRJ-900": "CRJ9",
  "DHC-8-Q400": "DH8D",
  "ERJ-135": "E135",
  "ERJ-145": "E145",
  "ERJ-170": "E170",
  "ERJ-175": "E175",
  "ERJ-190": "E190",
  "ERJ-195": "E195",
  "MD-11": "MD11",
  "MD-81": "MD81",
  "MD-82": "MD82",
  "MD-83": "MD83",
  "MD-87": "MD87",
  "MD-88": "MD88",
  "MD-90": "MD90"
};

function normalizeFallbackKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function deriveSimBriefFallbackTypes(equipmentTypes = []) {
  return [...new Set(
    equipmentTypes
      .map((equipmentType) => {
        const normalized = normalizeFallbackKey(equipmentType);
        if (!normalized) {
          return "";
        }

        if (SIMBRIEF_FALLBACK_TYPE_MAP[normalized]) {
          return SIMBRIEF_FALLBACK_TYPE_MAP[normalized];
        }

        return /^[A-Z0-9]{3,5}$/.test(normalized.replace(/[^A-Z0-9]/g, ""))
          ? normalized.replace(/[^A-Z0-9]/g, "")
          : "";
      })
      .filter(Boolean)
  )].sort();
}

export function normalizeSimBriefCustomAirframe(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const internalId = String(entry.internalId || "").trim();
  const matchType = String(entry.matchType || "").trim().toUpperCase();
  if (!internalId || !matchType) {
    return null;
  }

  return {
    internalId,
    matchType
  };
}

function inferManufacturer(aircraftName) {
  const normalized = String(aircraftName || "").trim().toUpperCase();
  if (!normalized) {
    return "Other";
  }

  const prefixes = [
    ["AIRBUS", "Airbus"],
    ["ANTONOV", "Antonov"],
    ["ATR", "ATR"],
    ["AVRO", "Avro"],
    ["BAE", "BAE"],
    ["BEECHCRAFT", "Beechcraft"],
    ["BOEING", "Boeing"],
    ["BOMBARDIER", "Bombardier"],
    ["CANADAIR", "Canadair"],
    ["CESSNA", "Cessna"],
    ["CHALLENGER", "Bombardier"],
    ["CIRRUS", "Cirrus"],
    ["DAHER", "Daher"],
    ["DIAMOND", "Diamond"],
    ["DOUGLAS", "Douglas"],
    ["EMBRAER", "Embraer"],
    ["ERJ-", "Embraer"],
    ["FALCON", "Dassault"],
    ["FOKKER", "Fokker"],
    ["GULFSTREAM", "Gulfstream"],
    ["HAWKER", "Hawker"],
    ["HONDAJET", "Honda"],
    ["KING AIR", "Beechcraft"],
    ["LEARJET", "Learjet"],
    ["LOCKHEED", "Lockheed"],
    ["MCDONNELL DOUGLAS", "McDonnell Douglas"],
    ["NAMC", "NAMC"],
    ["PILATUS", "Pilatus"],
    ["PIPER", "Piper"],
    ["SAAB", "Saab"],
    ["SHORT", "Short"],
    ["SOCATA", "Socata"],
    ["TECNAM", "Tecnam"],
    ["TUPOLEV", "Tupolev"],
    ["VICKERS", "Vickers"],
    ["YAK", "Yakovlev"],
    ["YAKOVLEV", "Yakovlev"]
  ];

  for (const [prefix, manufacturer] of prefixes) {
    if (normalized.startsWith(prefix)) {
      return manufacturer;
    }
  }

  if (normalized.startsWith("A3") || normalized.startsWith("A2") || normalized.startsWith("A35")) {
    return "Airbus";
  }
  if (normalized.startsWith("B7") || normalized.startsWith("B38") || normalized.startsWith("B39")) {
    return "Boeing";
  }
  if (normalized.startsWith("CRJ")) {
    return "Bombardier";
  }
  if (normalized.startsWith("E1")) {
    return "Embraer";
  }
  if (normalized.startsWith("MD-") || normalized.startsWith("MD ")) {
    return "McDonnell Douglas";
  }

  return "Other";
}

export function groupSimBriefAircraftTypesByManufacturer(types) {
  const groups = new Map();

  for (const type of Array.isArray(types) ? types : []) {
    const manufacturer = inferManufacturer(type?.name);
    const existing = groups.get(manufacturer) || [];
    existing.push(type);
    groups.set(manufacturer, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([manufacturer, items]) => ({
      manufacturer,
      items: [...items].sort((left, right) => left.name.localeCompare(right.name))
    }));
}

export function buildSimBriefDispatchOptions(aircraftTypes = [], customAirframes = []) {
  const baseTypeByCode = new Map(
    (Array.isArray(aircraftTypes) ? aircraftTypes : []).map((type) => [type.code, type])
  );
  const customCountsByMatchType = new Map();

  for (const entry of Array.isArray(customAirframes) ? customAirframes : []) {
    customCountsByMatchType.set(
      entry.matchType,
      (customCountsByMatchType.get(entry.matchType) || 0) + 1
    );
  }

  const customIndexByMatchType = new Map();
  const customOptions = (Array.isArray(customAirframes) ? customAirframes : []).map((entry) => {
    const nextIndex = (customIndexByMatchType.get(entry.matchType) || 0) + 1;
    customIndexByMatchType.set(entry.matchType, nextIndex);

    const matchedType = baseTypeByCode.get(entry.matchType);
    const baseName = matchedType?.name || entry.matchType;
    const totalForType = customCountsByMatchType.get(entry.matchType) || 0;
    const suffix =
      totalForType > 1 ? ` (Custom #${nextIndex})` : " (Custom Airframe)";

    return {
      code: entry.internalId,
      name: `${baseName}${suffix}`,
      dispatchType: entry.internalId,
      matchType: entry.matchType,
      kind: "custom"
    };
  });

  const standardOptions = (Array.isArray(aircraftTypes) ? aircraftTypes : []).map((type) => ({
    code: type.code,
    name: type.name,
    dispatchType: type.code,
    matchType: type.code,
    kind: "standard"
  }));

  return [...standardOptions, ...customOptions].sort((left, right) =>
    left.name.localeCompare(right.name) || left.code.localeCompare(right.code)
  );
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
