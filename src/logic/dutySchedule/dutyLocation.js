// Duty location helpers keep airport, country, and region matching out of App.jsx.
import { buildAirportCatalogOptions, buildAirportOptions, getAirportByIcao } from "../../lib/airportCatalog";

function normalizeIcao(value) {
  return String(value || "").trim().toUpperCase();
}

// Reads duty location data from the flight first, then falls back to the airport catalog.
function readDutyLocationField(flight, side) {
  const airport = getAirportByIcao(flight?.[side]);
  const prefix = side === "to" ? "to" : "from";

  return {
    regionCode: String(flight?.[`${prefix}RegionCode`] || airport?.regionCode || "")
      .trim()
      .toUpperCase(),
    country: String(flight?.[`${prefix}Country`] || airport?.country || "").trim()
  };
}

// Builds the region and country option lists used by Duty Schedule location filters.
export function buildGeoOptions(airportOptions) {
  const regionMap = new Map();
  const countrySet = new Set();

  for (const airport of airportOptions || []) {
    const icao = String(airport?.icao || "").trim().toUpperCase();
    if (!icao) {
      continue;
    }

    const regionCode = String(airport?.regionCode || "").trim().toUpperCase();
    const regionName = String(airport?.regionName || "").trim();
    const country = String(airport?.country || "").trim();

    if (regionCode && regionName && !regionMap.has(regionCode)) {
      regionMap.set(regionCode, {
        code: regionCode,
        name: regionName
      });
    }

    if (country) {
      countrySet.add(country);
    }
  }

  return {
    regions: [...regionMap.values()].toSorted((left, right) => left.name.localeCompare(right.name)),
    countries: [...countrySet].toSorted((left, right) => left.localeCompare(right))
  };
}

// Checks whether a flight touches the selected duty location by origin or destination.
export function flightTouchesDutyLocation(flight, dutyFilters) {
  if (!flight || !dutyFilters) {
    return false;
  }

  if (dutyFilters.locationKind === "region") {
    const target = String(dutyFilters.selectedRegion || "").trim().toUpperCase();
    if (!target) {
      return false;
    }

    const fromLocation = readDutyLocationField(flight, "from");
    const toLocation = readDutyLocationField(flight, "to");
    return fromLocation.regionCode === target || toLocation.regionCode === target;
  }

  const target = String(dutyFilters.selectedCountry || "").trim();
  if (!target) {
    return false;
  }

  const fromLocation = readDutyLocationField(flight, "from");
  const toLocation = readDutyLocationField(flight, "to");
  return fromLocation.country === target || toLocation.country === target;
}

// Builds the origin airport options that remain valid for the current duty selection.
export function buildDutyOriginAirportOptions(flights, dutyFilters) {
  const selectedAirline = String(
    dutyFilters?.buildMode === "airline" ? dutyFilters?.selectedAirline : ""
  ).trim();
  const hasLocationSelection =
    dutyFilters?.buildMode === "location" &&
    (dutyFilters?.locationKind === "region"
      ? Boolean(dutyFilters?.selectedRegion)
      : Boolean(dutyFilters?.selectedCountry));

  if (!selectedAirline && !hasLocationSelection) {
    return buildAirportCatalogOptions();
  }

  const filteredFlights = (flights || []).filter((flight) => {
    if (selectedAirline && String(flight?.airlineName || "").trim() !== selectedAirline) {
      return false;
    }

    if (hasLocationSelection && !flightTouchesDutyLocation(flight, dutyFilters)) {
      return false;
    }

    return true;
  });

  return buildAirportOptions(filteredFlights);
}
