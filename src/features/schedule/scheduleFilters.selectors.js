import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import { matchesLocalTimeWindow } from "../../domain/time/clock";
import { matchesVatsimCoverageMode } from "../../domain/vatsim/vatsimCoverage.js";

// Returns true when the search query matches any searchable flight text.
export function matchesSearch(flight, query) {
  if (!query) {
    return true;
  }

  const haystack = [
    flight.flightCode,
    flight.airlineName,
    flight.compatibleEquipmentLabel,
    flight.compatibleFamiliesLabel,
    flight.from,
    flight.to,
    flight.route,
    flight.fromAirport,
    flight.toAirport
  ]
    .join(" ")
    .toUpperCase();

  return haystack.includes(query.toUpperCase());
}

// Checks whether a flight matches the cached addon airport set for the selected mode.
export function matchesAddonAirport(flight, addonAirports, matchMode) {
  if (!addonAirports.size) {
    return false;
  }

  const originMatch = addonAirports.has(String(flight.from || "").trim().toUpperCase());
  const destinationMatch = addonAirports.has(String(flight.to || "").trim().toUpperCase());

  switch (matchMode) {
    case "origin":
      return originMatch;
    case "destination":
      return destinationMatch;
    case "both":
      return originMatch && destinationMatch;
    case "either":
    default:
      return originMatch || destinationMatch;
  }
}

// Treats geo filters as "touches this location" so a route can match by either endpoint.
function matchesEitherEndpoint(selectedValues, fromValue, toValue) {
  if (!selectedValues.length) {
    return true;
  }

  return (
    selectedValues.includes(String(fromValue || "").trim()) ||
    selectedValues.includes(String(toValue || "").trim())
  );
}

// Checks whether the flight endpoints satisfy the selected VATSIM coverage mode.
export function matchesVatsimCoverage(flight, coverageIndex, mode) {
  return matchesVatsimCoverageMode(flight, coverageIndex, mode);
}

// Applies the basic schedule filter stack without changing the legacy matching order.
export function selectFilteredScheduleFlights({
  flights,
  filters,
  addonAirports,
  vatsimCoverageIndex
}) {
  const activeFlights = Array.isArray(flights) ? flights : [];
  if (!activeFlights.length) {
    return [];
  }

  return activeFlights.filter((flight) => {
    const fromAirport = getAirportByIcao(flight.from);
    const toAirport = getAirportByIcao(flight.to);

    if (filters.airline.length && !filters.airline.includes(flight.airlineName)) {
      return false;
    }

    if (
      !matchesEitherEndpoint(
        filters.region,
        String(fromAirport?.regionCode || "").trim().toUpperCase(),
        String(toAirport?.regionCode || "").trim().toUpperCase()
      )
    ) {
      return false;
    }

    if (
      !matchesEitherEndpoint(
        filters.country,
        String(fromAirport?.country || "").trim(),
        String(toAirport?.country || "").trim()
      )
    ) {
      return false;
    }

    if (filters.origin.length && !filters.origin.includes(String(flight.from || "").trim().toUpperCase())) {
      return false;
    }

    if (
      filters.destination.length &&
      !filters.destination.includes(String(flight.to || "").trim().toUpperCase())
    ) {
      return false;
    }

    if (
      filters.originOrDestination.length &&
      !filters.originOrDestination.includes(String(flight.from || "").trim().toUpperCase()) &&
      !filters.originOrDestination.includes(String(flight.to || "").trim().toUpperCase())
    ) {
      return false;
    }

    if (filters.route && !flight.route.includes(filters.route.trim().toUpperCase())) {
      return false;
    }

    if (
      filters.equipment.length &&
      !filters.equipment.some((equipment) => (flight.compatibleEquipment || []).includes(equipment))
    ) {
      return false;
    }

    if (flight.blockMinutes < filters.flightLengthMin || flight.blockMinutes > filters.flightLengthMax) {
      return false;
    }

    if (flight.distanceNm < filters.distanceMin || flight.distanceNm > filters.distanceMax) {
      return false;
    }

    if (
      !matchesLocalTimeWindow(
        flight.localDepartureClock,
        filters.localDepartureWindow,
        "departure"
      )
    ) {
      return false;
    }

    if (
      !matchesLocalTimeWindow(
        flight.staLocal?.slice(11, 16) || "",
        filters.localArrivalWindow,
        "arrival"
      )
    ) {
      return false;
    }

    if (!matchesSearch(flight, filters.search.trim())) {
      return false;
    }

    if (filters.vatsimFilterEnabled) {
      if (!matchesVatsimCoverageMode(flight, vatsimCoverageIndex, filters.vatsimCoverageMode)) {
        return false;
      }
    }

    if (filters.addonFilterEnabled) {
      return matchesAddonAirport(flight, addonAirports, filters.addonMatchMode);
    }

    return true;
  });
}
