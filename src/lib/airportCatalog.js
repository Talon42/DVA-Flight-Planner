import Papa from "papaparse";
import airportsCsv from "../data/airports.csv?raw";
import regionsCountriesCsv from "../data/icao_regions_countries.csv?raw";

const CSV_OPTIONS = {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header) => header.trim()
};

let airportCatalog = null;
let airportByIcao = null;

function ensureAirportCatalogLoaded() {
  if (airportCatalog && airportByIcao) {
    return;
  }

  const airportRows = Papa.parse(airportsCsv, CSV_OPTIONS).data;
  const regionCountryRows = Papa.parse(regionsCountriesCsv, CSV_OPTIONS).data;

  const regionByCountry = new Map(
    regionCountryRows
      .map((row) => [
        String(row.country || "").trim(),
        {
          code: String(row.region_code || "").trim().toUpperCase(),
          name: String(row.region_name || "").trim()
        }
      ])
      .filter(([country, region]) => country && region.name)
  );

  airportCatalog = airportRows
    .map((row) => ({
      icao: String(row.ICAO || "").trim().toUpperCase(),
      name: String(row.Name || "").trim(),
      country: String(row.Country || "").trim(),
      regionCode: regionByCountry.get(String(row.Country || "").trim())?.code || "",
      regionName: regionByCountry.get(String(row.Country || "").trim())?.name || ""
    }))
    .filter((airport) => airport.icao && airport.name);

  airportByIcao = new Map(airportCatalog.map((airport) => [airport.icao, airport]));
}

export function getAirportByIcao(icao) {
  ensureAirportCatalogLoaded();
  return airportByIcao.get(String(icao || "").trim().toUpperCase()) || null;
}

export function buildAirportOptions(flights) {
  const optionByIcao = new Map();

  for (const flight of flights || []) {
    for (const [icao, side] of [
      [flight.from, "origin"],
      [flight.to, "destination"]
    ]) {
      const normalizedIcao = String(icao || "").trim().toUpperCase();

      if (!normalizedIcao) {
        continue;
      }

      const airport = getAirportByIcao(normalizedIcao);
      const existing = optionByIcao.get(normalizedIcao) || {
        icao: normalizedIcao,
        name: airport?.name || normalizedIcao,
        country: airport?.country || "",
        regionCode: airport?.regionCode || "",
        regionName: airport?.regionName || "",
        usedAsOrigin: false,
        usedAsDestination: false
      };

      if (side === "origin") {
        existing.usedAsOrigin = true;
      } else {
        existing.usedAsDestination = true;
      }

      optionByIcao.set(normalizedIcao, existing);
    }
  }

  return [...optionByIcao.values()].toSorted((left, right) => {
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return left.icao.localeCompare(right.icao);
  });
}
