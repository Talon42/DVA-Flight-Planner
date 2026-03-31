import Papa from "papaparse";
import airlinesCsv from "../data/airlines.csv?raw";

const CSV_OPTIONS = {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header) => header.trim()
};

const airlineRows = Papa.parse(airlinesCsv, CSV_OPTIONS).data;
const airlineLogoModules = import.meta.glob("../data/images/Logos/*", {
  eager: true,
  import: "default"
});

const airlineIcaoByName = new Map();
const airlineIcaoByIata = new Map();
const airlineLogoByIcao = new Map();
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

  const resolvedIcao = getAirlineIcao({ airlineName, airlineIata, airlineIcao });

  return resolvedIcao ? airlineLogoByIcao.get(resolvedIcao) || "" : "";
}
