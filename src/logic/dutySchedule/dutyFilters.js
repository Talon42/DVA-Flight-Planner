// Duty filter normalization keeps App.jsx from owning Duty Schedule defaulting rules.
import { DEFAULT_DUTY_FILTERS } from "../../lib/constants";
import { buildDutyOriginAirportOptions } from "./dutyLocation";
import { resolveDutyAirlineForLocation } from "./dutyAirlines";

function clampRange(value, min, max, fallback) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function normalizeBlankSelection(value) {
  const trimmed = String(value || "").trim();
  return !trimmed || trimmed.toUpperCase() === "ALL" ? "" : trimmed;
}

// Builds the default range values used by the duty filter sliders.
export function buildRangeDefaults(bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  return {
    flightLengthMin: 0,
    flightLengthMax: bounds.maxBlockMinutes,
    distanceMin: 0,
    distanceMax: bounds.maxDistanceNm
  };
}

// Returns the active airline for the current duty build mode.
export function getActiveDutyAirline(dutyFilters) {
  if (dutyFilters?.buildMode === "airline") {
    return String(dutyFilters?.selectedAirline || "").trim();
  }

  return String(dutyFilters?.resolvedAirline || "").trim();
}

// Returns true when the current duty location selection has enough detail to filter flights.
export function hasActiveDutyLocationSelection(dutyFilters) {
  if (dutyFilters?.buildMode !== "location") {
    return false;
  }

  return dutyFilters.locationKind === "region"
    ? Boolean(dutyFilters.selectedRegion)
    : Boolean(dutyFilters.selectedCountry);
}

// Normalizes Duty Schedule filters so the rest of the app can treat them as safe values.
export function normalizeDutyFilters(savedFilters, bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  const nextFilters = {
    ...DEFAULT_DUTY_FILTERS,
    ...(savedFilters || {})
  };

  nextFilters.buildMode = nextFilters.buildMode === "location" ? "location" : "airline";
  nextFilters.selectedAirline = normalizeBlankSelection(nextFilters.selectedAirline);
  nextFilters.locationKind = nextFilters.locationKind === "region" ? "region" : "country";
  nextFilters.selectedCountry = normalizeBlankSelection(nextFilters.selectedCountry);
  nextFilters.selectedRegion = normalizeBlankSelection(nextFilters.selectedRegion).toUpperCase();
  nextFilters.selectedOriginAirport = String(nextFilters.selectedOriginAirport || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  nextFilters.selectedEquipment = String(nextFilters.selectedEquipment || "").trim().toUpperCase();
  nextFilters.addonMatchMode = ["either", "origin", "destination", "both"].includes(
    nextFilters.addonMatchMode
  )
    ? nextFilters.addonMatchMode
    : "either";
  nextFilters.addonFilterEnabled = Boolean(nextFilters.addonFilterEnabled);
  nextFilters.addonPriorityEnabled = false;
  nextFilters.uniqueDestinationsEnabled = Boolean(nextFilters.uniqueDestinationsEnabled);
  nextFilters.timeOrderEnabled = Boolean(nextFilters.timeOrderEnabled);
  const requestedMinTurnMinutes = Number(nextFilters.minTurnMinutes);
  nextFilters.minTurnMinutes = Number.isFinite(requestedMinTurnMinutes)
    ? Math.max(0, Math.round(requestedMinTurnMinutes))
    : 60;
  nextFilters.dutyTargetMode = nextFilters.dutyTargetMode === "flexible" ? "flexible" : "strict";
  nextFilters.resolvedAirline = String(nextFilters.resolvedAirline || "").trim();

  const defaultFlightLengthMax = bounds.maxBlockMinutes;
  const defaultDistanceMax = bounds.maxDistanceNm;
  const toOptionalNumber = (value) => {
    if (value === null || value === undefined || value === "") {
      return Number.NaN;
    }
    return Number(value);
  };

  nextFilters.flightLengthMin = clampRange(
    toOptionalNumber(nextFilters.flightLengthMin),
    0,
    defaultFlightLengthMax,
    0
  );
  nextFilters.flightLengthMax = clampRange(
    toOptionalNumber(nextFilters.flightLengthMax),
    nextFilters.flightLengthMin,
    defaultFlightLengthMax,
    defaultFlightLengthMax
  );
  nextFilters.distanceMin = clampRange(toOptionalNumber(nextFilters.distanceMin), 0, defaultDistanceMax, 0);
  nextFilters.distanceMax = clampRange(
    toOptionalNumber(nextFilters.distanceMax),
    nextFilters.distanceMin,
    defaultDistanceMax,
    defaultDistanceMax
  );

  const requestedDutyLength = Number(nextFilters.dutyLength);
  nextFilters.dutyLength = Number.isFinite(requestedDutyLength)
    ? Math.min(Math.max(Math.round(requestedDutyLength), 2), 10)
    : 2;

  return nextFilters;
}

// Builds the default Duty Schedule filter set for a fresh import or reset.
export function buildDefaultDutyFilters(bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  return normalizeDutyFilters(
    {
      ...DEFAULT_DUTY_FILTERS,
      ...buildRangeDefaults(bounds)
    },
    bounds
  );
}

// Applies a single Duty Schedule filter change while preserving all duty-specific rules.
export function applyDutyFilterChange(
  currentFilters,
  key,
  value,
  { scheduleFlights = [], filterBounds = { maxBlockMinutes: 0, maxDistanceNm: 0 } } = {}
) {
  const nextFilters = {
    ...(currentFilters || {}),
    [key]: value
  };

  if (key === "buildMode") {
    nextFilters.resolvedAirline = "";
  }

  if (key === "locationKind") {
    nextFilters.resolvedAirline = "";
  }

  if (key === "selectedCountry" || key === "selectedRegion") {
    nextFilters.resolvedAirline = "";
  }

  if (key === "selectedAirline") {
    nextFilters.selectedAirline = String(value || "").trim();
  }

  if (key === "selectedOriginAirport") {
    nextFilters.selectedOriginAirport = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);
    nextFilters.resolvedAirline = "";
  }

  if (key === "selectedEquipment") {
    nextFilters.selectedEquipment = String(value || "").trim().toUpperCase();
  }

  if (key === "addonFilterEnabled") {
    nextFilters.addonFilterEnabled = Boolean(value);
    if (nextFilters.addonFilterEnabled) {
      nextFilters.addonPriorityEnabled = false;
    }
  }

  if (key === "addonPriorityEnabled") {
    nextFilters.addonPriorityEnabled = Boolean(value);
    if (nextFilters.addonPriorityEnabled) {
      nextFilters.addonFilterEnabled = false;
    }
  }

  const normalizedNextFilters = normalizeDutyFilters(nextFilters, filterBounds);
  const allowedOriginAirportIcaos = new Set(
    buildDutyOriginAirportOptions(scheduleFlights, normalizedNextFilters).map((airport) =>
      String(airport?.icao || "").trim().toUpperCase()
    )
  );

  if (
    normalizedNextFilters.selectedOriginAirport &&
    !allowedOriginAirportIcaos.has(normalizedNextFilters.selectedOriginAirport)
  ) {
    return {
      ...normalizedNextFilters,
      selectedOriginAirport: "",
      resolvedAirline: ""
    };
  }

  if (normalizedNextFilters.buildMode !== "location") {
    return normalizedNextFilters;
  }

  const hasLocationTarget =
    normalizedNextFilters.locationKind === "region"
      ? Boolean(normalizedNextFilters.selectedRegion)
      : Boolean(normalizedNextFilters.selectedCountry);

  if (!hasLocationTarget) {
    return {
      ...normalizedNextFilters,
      resolvedAirline: ""
    };
  }

  if (
    key === "buildMode" ||
    key === "locationKind" ||
    key === "selectedCountry" ||
    key === "selectedRegion"
  ) {
    const { resolvedAirline } = resolveDutyAirlineForLocation(scheduleFlights, normalizedNextFilters);

    return {
      ...normalizedNextFilters,
      resolvedAirline
    };
  }

  return normalizedNextFilters;
}

