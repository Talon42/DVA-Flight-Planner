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
const airlineLogoOverridesByName = new Map([
  ["DELTA HISTORIC", "DAL-H"],
  ["NORTH CENTRAL AIRLINES", "NCA"],
  ["NORTHEAST AIRLINES", "NEH"],
  ["PAN AM HISTORIC", "PAN-H"],
  ["PAN AM HISTORICAL", "PAN-H"],
  ["PAN AMERICAN AIRWAYS", "PAN-H"]
]);

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

export function getAirlineNameByIata(airlineIata) {
  const normalizedIata = String(airlineIata || "").trim().toUpperCase();
  return normalizedIata ? airlineNameByIata.get(normalizedIata) || "" : "";
}

export function getAirlineNameByCode(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  return normalizedCode ? airlineNameByCode.get(normalizedCode) || normalizedCode : "";
}
