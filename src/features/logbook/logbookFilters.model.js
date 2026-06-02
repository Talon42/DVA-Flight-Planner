const DEFAULT_DISTANCE_BOUNDS = { minDistanceNm: 0, maxDistanceNm: 0 };

export const DEFAULT_LOGBOOK_FILTERS = {
  search: "",
  airline: [],
  equipment: [],
  origin: [],
  destination: [],
  status: [],
  distanceMin: 0,
  distanceMax: null
};

export const DEFAULT_LOGBOOK_SORT = {
  key: "dateSortKey",
  direction: "desc"
};

function toSelectionArray(value) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  return rawValues
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

function clampRange(value, min, max, fallback) {
  if (!Number.isFinite(max) || max < min) {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(numeric, min), max);
}

function roundUpToStep(value, step) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.ceil(value / step) * step;
}

// Derives the active distance slider range from the normalized logbook rows.
export function buildLogbookFilterBounds(rows) {
  const activeRows = Array.isArray(rows) ? rows : [];
  const maxDistanceNm = activeRows.reduce(
    (maxValue, row) => (Number.isFinite(row.distanceNm) && row.distanceNm > maxValue ? row.distanceNm : maxValue),
    0
  );

  return {
    minDistanceNm: DEFAULT_DISTANCE_BOUNDS.minDistanceNm,
    maxDistanceNm: roundUpToStep(maxDistanceNm, 100)
  };
}

// Keeps persisted logbook filters inside the available bounds without mutating other features.
export function normalizeLogbookFilters(savedFilters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const nextFilters = {
    ...DEFAULT_LOGBOOK_FILTERS,
    ...(savedFilters || {})
  };

  const maxDistance = Number(bounds?.maxDistanceNm);
  const hasPositiveBounds = Number.isFinite(maxDistance) && maxDistance > 0;

  nextFilters.search = String(nextFilters.search || "").trim();
  nextFilters.airline = toSelectionArray(nextFilters.airline);
  nextFilters.equipment = toSelectionArray(nextFilters.equipment);
  nextFilters.origin = toSelectionArray(nextFilters.origin).map((value) => value.toUpperCase());
  nextFilters.destination = toSelectionArray(nextFilters.destination).map((value) => value.toUpperCase());
  nextFilters.status = toSelectionArray(nextFilters.status);

  nextFilters.distanceMin = hasPositiveBounds
    ? clampRange(nextFilters.distanceMin, 0, maxDistance, 0)
    : 0;

  const rawDistanceMax = Number(nextFilters.distanceMax);
  if (!Number.isFinite(rawDistanceMax)) {
    nextFilters.distanceMax = null;
  } else if (!hasPositiveBounds) {
    nextFilters.distanceMax = rawDistanceMax > 0 ? rawDistanceMax : null;
  } else if (rawDistanceMax <= 0 && nextFilters.distanceMin <= 0) {
    nextFilters.distanceMax = null;
  } else {
    nextFilters.distanceMax = clampRange(rawDistanceMax, nextFilters.distanceMin, maxDistance, null);
  }

  return nextFilters;
}

// Determines whether the user has an actual distance constraint instead of only the default slider display.
export function hasActiveLogbookDistanceConstraint(filters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const normalizedFilters = normalizeLogbookFilters(filters, bounds);

  return (
    Number.isFinite(normalizedFilters.distanceMin) && normalizedFilters.distanceMin > 0
  ) || Number.isFinite(normalizedFilters.distanceMax);
}

// Evaluates whether a single logbook row distance should pass the active distance filter state.
export function shouldIncludeLogbookDistanceRow(distanceNm, filters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const normalizedFilters = normalizeLogbookFilters(filters, bounds);
  const hasDistanceConstraint = hasActiveLogbookDistanceConstraint(normalizedFilters, bounds);

  if (Number.isFinite(distanceNm)) {
    if (distanceNm < normalizedFilters.distanceMin) {
      return false;
    }

    if (Number.isFinite(normalizedFilters.distanceMax) && distanceNm > normalizedFilters.distanceMax) {
      return false;
    }

    return true;
  }

  return !hasDistanceConstraint;
}

// Maps the persisted distance sentinel to the active min/max values used by selectors and slider UI.
export function getEffectiveLogbookDistanceRange(filters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const normalizedFilters = normalizeLogbookFilters(filters, bounds);
  const effectiveMin = Number.isFinite(normalizedFilters.distanceMin) ? normalizedFilters.distanceMin : 0;
  const effectiveMax = Number.isFinite(normalizedFilters.distanceMax)
    ? normalizedFilters.distanceMax
    : Math.max(bounds.maxDistanceNm, effectiveMin);

  return {
    min: effectiveMin,
    max: effectiveMax
  };
}

// Applies a single logbook filter change while preserving the current distance bounds.
export function applyLogbookFilterChange(currentFilters, key, value, bounds) {
  return normalizeLogbookFilters(
    {
      ...currentFilters,
      [key]: value
    },
    bounds
  );
}

// Resets the logbook filter state back to the full cached-row range.
export function resetLogbookFilters(bounds) {
  return normalizeLogbookFilters(DEFAULT_LOGBOOK_FILTERS, bounds);
}
