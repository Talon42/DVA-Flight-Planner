import airportsData from "../data/airports.json";
import regionsCountriesData from "../data/icao_regions_countries.json";

let airportCatalog = null;
let airportByIcao = null;

function parseCoordinate(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumeric(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : null;
}

function ensureAirportCatalogLoaded() {
  if (airportCatalog && airportByIcao) {
    return;
  }

  const airportRows = airportsData.airports || [];
  const regionCountryRows = Array.isArray(regionsCountriesData) ? regionsCountriesData : [];

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
      icao: String(row.icao || "").trim().toUpperCase(),
      name: String(row.name || "").trim(),
      country: String(row.countryName || "").trim(),
      state: String(row.stateTerritory || "").trim(),
      timezone: String(row.timezone || "").trim(),
      latitude: parseCoordinate(row.lat),
      longitude: parseCoordinate(row.lng),
      runwayLength: parseNumeric(row.runwayLength),
      regionCode: regionByCountry.get(String(row.countryName || "").trim())?.code || "",
      regionName: regionByCountry.get(String(row.countryName || "").trim())?.name || ""
    }))
    .filter((airport) => airport.icao && airport.name);

  airportByIcao = new Map(airportCatalog.map((airport) => [airport.icao, airport]));
}

// Returns the normalized airport record for an ICAO code.
export function getAirportByIcao(icao) {
  ensureAirportCatalogLoaded();
  return airportByIcao.get(String(icao || "").trim().toUpperCase()) || null;
}

// Builds the full airport catalog used by airport pickers and filters.
export function buildAirportCatalogOptions() {
  ensureAirportCatalogLoaded();

  return [...airportCatalog]
    .map((airport) => ({
      icao: airport.icao,
      name: airport.name,
      country: airport.country,
      state: airport.state,
      timezone: airport.timezone,
      latitude: airport.latitude,
      longitude: airport.longitude,
      runwayLength: airport.runwayLength,
      regionCode: airport.regionCode,
      regionName: airport.regionName,
      usedAsOrigin: true,
      usedAsDestination: false
    }))
    .toSorted((left, right) => {
      const nameCompare = left.name.localeCompare(right.name);
      if (nameCompare !== 0) {
        return nameCompare;
      }

      return left.icao.localeCompare(right.icao);
    });
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
        state: airport?.state || "",
        timezone: airport?.timezone || "",
        latitude: airport?.latitude ?? null,
        longitude: airport?.longitude ?? null,
        runwayLength: airport?.runwayLength ?? null,
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
