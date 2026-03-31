import Papa from "papaparse";
import airportsCsv from "../data/airports.csv?raw";

const CSV_OPTIONS = {
  header: true,
  skipEmptyLines: true,
  transformHeader: (header) => header.trim()
};

const airportRows = Papa.parse(airportsCsv, CSV_OPTIONS).data;

const airportCatalog = airportRows
  .map((row) => ({
    icao: String(row.ICAO || "").trim().toUpperCase(),
    name: String(row.Name || "").trim()
  }))
  .filter((airport) => airport.icao && airport.name);

const airportByIcao = new Map(
  airportCatalog.map((airport) => [airport.icao, airport])
);

export function getAirportByIcao(icao) {
  return airportByIcao.get(String(icao || "").trim().toUpperCase()) || null;
}

export function buildAirportOptions(flights) {
  const seen = new Set();
  const options = [];

  for (const flight of flights || []) {
    for (const icao of [flight.from, flight.to]) {
      const normalizedIcao = String(icao || "").trim().toUpperCase();

      if (!normalizedIcao || seen.has(normalizedIcao)) {
        continue;
      }

      seen.add(normalizedIcao);
      const airport = getAirportByIcao(normalizedIcao);

      options.push({
        icao: normalizedIcao,
        name: airport?.name || normalizedIcao
      });
    }
  }

  return options.toSorted((left, right) => {
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return left.icao.localeCompare(right.icao);
  });
}
