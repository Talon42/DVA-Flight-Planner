import airportsData from "../../data/airports.json";
import regionsCountriesData from "../../data/icao_regions_countries.json";

let airportCatalog = null;
let airportByIcao = null;
let airportByIata = null;

function parseCoordinate(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumeric(value) {
  const normalized = String(value ?? "").replace(/[^0-9-]/g, "");
  return normalized ? Number(normalized) : null;
}

function normalizeRunwayList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return [];
    }

    if (/[;,|]/.test(normalized)) {
      return normalized
        .split(/[;,|]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [normalized];
  }

  return [];
}

function ensureAirportCatalogLoaded() {
  if (airportCatalog && airportByIcao && airportByIata) {
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
      iata: String(row.iata || "").trim().toUpperCase(),
      name: String(row.name || "").trim(),
      actualName: String(row.actualName || "").trim(),
      country: String(row.countryName || "").trim(),
      state: String(row.stateTerritory || "").trim(),
      altitude: parseNumeric(row.alt ?? row.altitude ?? row.elevation),
      timezone: String(row.timezone || "").trim(),
      timezoneLabel: String(row.timezoneLabel || "").trim(),
      latitude: parseCoordinate(row.lat),
      longitude: parseCoordinate(row.lng),
      takeoffRunways: normalizeRunwayList(row.takeoffRunways ?? row.takeoff_runways),
      landingRunways: normalizeRunwayList(row.landingRunways ?? row.landing_runways),
      runwayLength: parseNumeric(row.runwayLength),
      regionCode: regionByCountry.get(String(row.countryName || "").trim())?.code || "",
      regionName: regionByCountry.get(String(row.countryName || "").trim())?.name || ""
    }))
    .filter((airport) => airport.icao && airport.name);

  airportByIcao = new Map(airportCatalog.map((airport) => [airport.icao, airport]));
  airportByIata = new Map(
    airportCatalog
      .filter((airport) => airport.iata)
      .map((airport) => [airport.iata, airport])
  );
}

// Returns the normalized airport record for an ICAO code.
export function getAirportByIcao(icao) {
  ensureAirportCatalogLoaded();
  return airportByIcao.get(String(icao || "").trim().toUpperCase()) || null;
}

// Returns the normalized airport record for an IATA code.
export function getAirportByIata(iata) {
  ensureAirportCatalogLoaded();
  return airportByIata.get(String(iata || "").trim().toUpperCase()) || null;
}

// Resolves either an ICAO or IATA airport code to the canonical ICAO value.
export function resolveAirportCodeToIcao(value) {
  ensureAirportCatalogLoaded();

  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  if (!normalized) {
    return "";
  }

  return airportByIcao.get(normalized)?.icao || airportByIata.get(normalized)?.icao || "";
}

// Builds the full airport catalog used by airport pickers and filters.
export function buildAirportCatalogOptions() {
  ensureAirportCatalogLoaded();

  return [...airportCatalog]
    .map((airport) => ({
      icao: airport.icao,
      iata: airport.iata,
      name: airport.name,
      actualName: airport.actualName,
      country: airport.country,
      state: airport.state,
      altitude: airport.altitude,
      timezone: airport.timezone,
      timezoneLabel: airport.timezoneLabel,
      latitude: airport.latitude,
      longitude: airport.longitude,
      takeoffRunways: airport.takeoffRunways,
      landingRunways: airport.landingRunways,
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
        actualName: airport?.actualName || "",
        iata: airport?.iata || "",
        country: airport?.country || "",
        state: airport?.state || "",
        altitude: airport?.altitude ?? null,
        timezone: airport?.timezone || "",
        timezoneLabel: airport?.timezoneLabel || "",
        latitude: airport?.latitude ?? null,
        longitude: airport?.longitude ?? null,
        takeoffRunways: airport?.takeoffRunways || [],
        landingRunways: airport?.landingRunways || [],
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
