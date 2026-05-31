import {
  ADDON_MATCH_MODES,
  DEFAULT_FILTERS,
  VATSIM_COVERAGE_MODES
} from "./schedule.constants.js";

// Rounds a numeric limit up to the next step so slider bounds stay friendly.
export function roundUpToStep(value, step) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.ceil(value / step) * step;
}

// Scans the schedule once to derive the max values used by filter sliders.
export function buildFilterBounds(flights) {
  if (!flights?.length) {
    return {
      maxBlockMinutes: 0,
      maxDistanceNm: 0
    };
  }

  let maxBlockMinutes = 0;
  let maxDistanceNm = 0;

  for (const flight of flights) {
    if (Number.isFinite(flight.blockMinutes) && flight.blockMinutes > maxBlockMinutes) {
      maxBlockMinutes = flight.blockMinutes;
    }

    if (Number.isFinite(flight.distanceNm) && flight.distanceNm > maxDistanceNm) {
      maxDistanceNm = flight.distanceNm;
    }
  }

  return {
    maxBlockMinutes: roundUpToStep(maxBlockMinutes, 60),
    maxDistanceNm: roundUpToStep(maxDistanceNm, 100)
  };
}

// Keeps a slider value inside the available range while preserving the legacy fallback.
export function clampRange(value, min, max, fallback) {
  if (!Number.isFinite(max) || max <= min) {
    return fallback;
  }

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return Number.NaN;
  }

  return Number(value);
}

// Normalizes persisted schedule filters without changing the stored shape.
export function normalizeFilters(savedFilters, bounds = { maxBlockMinutes: 0, maxDistanceNm: 0 }) {
  const nextFilters = {
    ...DEFAULT_FILTERS,
    ...(savedFilters || {})
  };

  const toSelectionArray = (value, { uppercase = false } = {}) => {
    const rawValues = Array.isArray(value) ? value : value ? [value] : [];
    return rawValues
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .filter((entry) => entry.toUpperCase() !== "ALL")
      .map((entry) => (uppercase ? entry.toUpperCase() : entry));
  };

  nextFilters.airline = toSelectionArray(nextFilters.airline);
  nextFilters.region = toSelectionArray(nextFilters.region, { uppercase: true });
  nextFilters.country = toSelectionArray(nextFilters.country);
  nextFilters.origin = toSelectionArray(nextFilters.origin, { uppercase: true });
  nextFilters.destination = toSelectionArray(nextFilters.destination, { uppercase: true });
  nextFilters.originOrDestination = toSelectionArray(nextFilters.originOrDestination, {
    uppercase: true
  });
  nextFilters.originAirport = String(nextFilters.originAirport || "").trim();
  nextFilters.destinationAirport = String(nextFilters.destinationAirport || "").trim();
  nextFilters.originOrDestinationAirport = String(
    nextFilters.originOrDestinationAirport || ""
  ).trim();
  nextFilters.addonFilterEnabled = Boolean(nextFilters.addonFilterEnabled);
  nextFilters.vatsimFilterEnabled = Boolean(nextFilters.vatsimFilterEnabled);
  nextFilters.vatsimCoverageMode = VATSIM_COVERAGE_MODES.includes(nextFilters.vatsimCoverageMode)
    ? nextFilters.vatsimCoverageMode
    : "either";
  nextFilters.addonPriorityEnabled = false;
  nextFilters.addonMatchMode = ADDON_MATCH_MODES.includes(nextFilters.addonMatchMode)
    ? nextFilters.addonMatchMode
    : "either";

  if (!nextFilters.origin.length && nextFilters.originAirport) {
    nextFilters.origin = [String(nextFilters.originAirport).trim().toUpperCase()].filter(Boolean);
  }

  if (!nextFilters.destination.length && nextFilters.destinationAirport) {
    nextFilters.destination = [String(nextFilters.destinationAirport).trim().toUpperCase()].filter(
      Boolean
    );
  }

  if (!nextFilters.originOrDestination.length && nextFilters.originOrDestinationAirport) {
    nextFilters.originOrDestination = [
      String(nextFilters.originOrDestinationAirport).trim().toUpperCase()
    ].filter(Boolean);
  }

  if (!Array.isArray(nextFilters.equipment)) {
    nextFilters.equipment = nextFilters.equipment ? [nextFilters.equipment] : [];
  }

  nextFilters.localDepartureWindow = Array.isArray(nextFilters.localDepartureWindow)
    ? [
        ...new Set(
          nextFilters.localDepartureWindow.filter((value) =>
            ["red-eye", "morning", "afternoon", "evening"].includes(value)
          )
        )
      ]
    : ["red-eye", "morning", "afternoon", "evening"].includes(nextFilters.localDepartureWindow)
      ? [nextFilters.localDepartureWindow]
      : [];
  nextFilters.localArrivalWindow = Array.isArray(nextFilters.localArrivalWindow)
    ? [
        ...new Set(
          nextFilters.localArrivalWindow.filter((value) =>
            ["red-eye", "morning", "afternoon", "evening"].includes(value)
          )
        )
      ]
    : ["red-eye", "morning", "afternoon", "evening"].includes(nextFilters.localArrivalWindow)
      ? [nextFilters.localArrivalWindow]
      : [];

  const defaultFlightLengthMax = bounds.maxBlockMinutes;
  const defaultDistanceMax = bounds.maxDistanceNm;

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
  nextFilters.distanceMin = clampRange(
    toOptionalNumber(nextFilters.distanceMin),
    0,
    defaultDistanceMax,
    0
  );
  nextFilters.distanceMax = clampRange(
    toOptionalNumber(nextFilters.distanceMax),
    nextFilters.distanceMin,
    defaultDistanceMax,
    defaultDistanceMax
  );

  return nextFilters;
}
