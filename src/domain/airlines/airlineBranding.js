import airlinesData from "../../data/airlines.json";

const airlineRows = Array.isArray(airlinesData) ? airlinesData : [];
const airlineLogoModules = import.meta.glob("../../data/images/Logos/*", {
  eager: true,
  import: "default"
});

const airlineIcaoByName = new Map();
const airlineIcaoByIata = new Map();
const airlineLogoByIcao = new Map();
const airlineNameByIata = new Map();
const airlineNameByCode = new Map();
const airlinePrimaryColorByIcao = new Map();
const FALLBACK_AIRLINE_PRIMARY_COLOR = "#C8102E";
const darkModeWhiteLogoIcaos = new Set(["AMX", "KAL", "SAS", "SBS"]);
const airlinePrimaryColorOverridesByIcao = new Map([
  ["AAL", "#0078D2"],
  ["AFR", "#002157"],
  ["AMX", "#002F6C"],
  ["ASA", "#01426A"],
  ["DAL", "#C8102E"],
  ["DAL-H", "#C8102E"],
  ["JBU", "#003876"],
  ["KAL", "#003478"],
  ["KLM", "#00A1DE"],
  ["NWA", "#D50032"],
  ["SWA", "#304CB2"],
  ["UAL", "#005DAA"],
  ["VIR", "#DA0530"]
]);
const airlineLogoOverridesByName = new Map([
  ["DELTA HISTORIC", "DAL-H"],
  ["NORTH CENTRAL AIRLINES", "NCA"],
  ["NORTHEAST AIRLINES", "NEH"],
  ["PAN AM HISTORIC", "PAN-H"],
  ["PAN AM HISTORICAL", "PAN-H"],
  ["PAN AMERICAN AIRWAYS", "PAN-H"]
]);

function resolveSafeHexColor(value, fallback = FALLBACK_AIRLINE_PRIMARY_COLOR) {
  const normalized = String(value || "").trim();
  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized.toUpperCase() : fallback;
}

for (const [path, assetUrl] of Object.entries(airlineLogoModules)) {
  const fileName = path.split("/").pop() || "";
  const icao = fileName.replace(/\.[^.]+$/, "").trim().toUpperCase();

  if (icao && typeof assetUrl === "string") {
    airlineLogoByIcao.set(icao, assetUrl);
  }
}

for (const row of airlineRows) {
  const airlineName = String(row.Airline || "").trim();
  const normalizedName = airlineName.toUpperCase();
  const iata = String(row.IATA || "").trim().toUpperCase();
  const icao = String(row.ICAO || "").trim().toUpperCase();

  if (normalizedName && icao && !airlineIcaoByName.has(normalizedName)) {
    airlineIcaoByName.set(normalizedName, icao);
  }

  if (iata && icao && !airlineIcaoByIata.has(iata)) {
    airlineIcaoByIata.set(iata, icao);
  }

  if (iata && normalizedName && !airlineNameByIata.has(iata)) {
    airlineNameByIata.set(iata, airlineName);
  }

  if (iata && normalizedName && !airlineNameByCode.has(iata)) {
    airlineNameByCode.set(iata, airlineName);
  }

  if (icao && normalizedName && !airlineNameByCode.has(icao)) {
    airlineNameByCode.set(icao, airlineName);
  }

  // Supports future airline data color fields without requiring a parallel lookup shape.
  const primaryColor = resolveSafeHexColor(
    row.primaryColor || row.PrimaryColor || row.primary_color || row["Primary Color"],
    ""
  );
  if (icao && primaryColor && !airlinePrimaryColorByIcao.has(icao)) {
    airlinePrimaryColorByIcao.set(icao, primaryColor);
  }
}

for (const [icao, primaryColor] of airlinePrimaryColorOverridesByIcao.entries()) {
  airlinePrimaryColorByIcao.set(icao, resolveSafeHexColor(primaryColor));
}

function normalizeAirlineLookupName(airlineName) {
  return String(airlineName || "")
    .trim()
    .replace(/\s+(historic|historical)$/i, "")
    .trim();
}

function resolveAirlineLogoIcao({ airlineName, airlineIata, airlineIcao }) {
  const normalizedName = String(airlineName || "").trim().toUpperCase();
  if (normalizedName && airlineIcaoByName.has(normalizedName)) {
    return airlineIcaoByName.get(normalizedName) || "";
  }

  const normalizedBaseName = normalizeAirlineLookupName(airlineName).toUpperCase();
  if (normalizedBaseName && airlineIcaoByName.has(normalizedBaseName)) {
    return airlineIcaoByName.get(normalizedBaseName) || "";
  }

  const normalizedIata = String(airlineIata || "").trim().toUpperCase();
  if (normalizedIata && airlineIcaoByIata.has(normalizedIata)) {
    return airlineIcaoByIata.get(normalizedIata) || "";
  }

  const explicitIcao = String(airlineIcao || "").trim().toUpperCase();
  if (explicitIcao && airlineLogoByIcao.has(explicitIcao)) {
    return explicitIcao;
  }

  if (/^[A-Z]{3}$/.test(normalizedBaseName) && airlineLogoByIcao.has(normalizedBaseName)) {
    return normalizedBaseName;
  }

  return "";
}

export function getAirlineIcao({ airlineName, airlineIata, airlineIcao }) {
  const explicitIcao = String(airlineIcao || "").trim().toUpperCase();
  if (explicitIcao) {
    return explicitIcao;
  }

  const normalizedName = String(airlineName || "").trim().toUpperCase();
  if (normalizedName && airlineIcaoByName.has(normalizedName)) {
    return airlineIcaoByName.get(normalizedName) || "";
  }

  const normalizedBaseName = normalizeAirlineLookupName(airlineName).toUpperCase();
  if (/^[A-Z]{3}$/.test(normalizedBaseName)) {
    return normalizedBaseName;
  }
  if (normalizedBaseName && airlineIcaoByName.has(normalizedBaseName)) {
    return airlineIcaoByName.get(normalizedBaseName) || "";
  }

  const normalizedIata = String(airlineIata || "").trim().toUpperCase();
  if (normalizedIata && airlineIcaoByIata.has(normalizedIata)) {
    return airlineIcaoByIata.get(normalizedIata) || "";
  }

  return "";
}

export function getAirlineLogo({ airlineName, airlineIata, airlineIcao }) {
  const normalizedName = String(airlineName || "").trim().toUpperCase();

  const overrideLogoKey = airlineLogoOverridesByName.get(normalizedName);

  if (overrideLogoKey) {
    return airlineLogoByIcao.get(overrideLogoKey) || "";
  }

  const normalizedBaseName = normalizeAirlineLookupName(airlineName).toUpperCase();
  const overrideBaseLogoKey = airlineLogoOverridesByName.get(normalizedBaseName);

  if (overrideBaseLogoKey) {
    return airlineLogoByIcao.get(overrideBaseLogoKey) || "";
  }

  const resolvedIcao = resolveAirlineLogoIcao({ airlineName, airlineIata, airlineIcao });

  return resolvedIcao ? airlineLogoByIcao.get(resolvedIcao) || "" : "";
}

// Returns targeted logo styling overrides for carriers that need better contrast in dark mode.
export function getAirlineLogoClassName({ airlineName, airlineIata, airlineIcao }) {
  const resolvedIcao = resolveAirlineLogoIcao({ airlineName, airlineIata, airlineIcao });
  return darkModeWhiteLogoIcaos.has(resolvedIcao) ? "dark:brightness-0 dark:invert" : "";
}

// Resolves a validated brand color for decorative airline identity treatments.
export function getAirlinePrimaryColor({ airlineName, airlineIata, airlineIcao }) {
  const resolvedIcao = resolveAirlineLogoIcao({ airlineName, airlineIata, airlineIcao });
  return resolveSafeHexColor(airlinePrimaryColorByIcao.get(resolvedIcao), FALLBACK_AIRLINE_PRIMARY_COLOR);
}

export function getAirlineNameByIata(airlineIata) {
  const normalizedIata = String(airlineIata || "").trim().toUpperCase();
  return normalizedIata ? airlineNameByIata.get(normalizedIata) || "" : "";
}

// Resolves airline names from either IATA or ICAO codes for logbook rows.
export function getAirlineNameByCode(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  return normalizedCode ? airlineNameByCode.get(normalizedCode) || normalizedCode : "";
}
