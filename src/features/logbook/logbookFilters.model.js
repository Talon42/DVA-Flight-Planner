const DEFAULT_DISTANCE_BOUNDS = {
  minDateSortKey: 0,
  maxDateSortKey: 0,
  maxDurationMinutes: 0,
  minDistanceNm: 0,
  maxDistanceNm: 0
};

export const DEFAULT_LOGBOOK_FILTERS = {
  dateStart: "",
  dateEnd: "",
  airline: [],
  equipment: [],
  departure: [],
  arrival: [],
  durationMin: 0,
  durationMax: null,
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

function normalizeDateString(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  return normalized;
}

function dateStringToSortKey(value) {
  const normalized = normalizeDateString(value);
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized.replaceAll("-", ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function sortKeyToDateString(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  const digits = String(Math.trunc(value)).padStart(8, "0");
  if (digits.length !== 8) {
    return "";
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// Derives the active filter bounds for date, duration, and distance from the normalized rows.
export function buildLogbookFilterBounds(rows) {
  const activeRows = Array.isArray(rows) ? rows : [];
  let minDateSortKey = Number.POSITIVE_INFINITY;
  let maxDateSortKey = 0;
  let maxDurationMinutes = 0;
  const maxDistanceNm = activeRows.reduce(
    (maxValue, row) => (Number.isFinite(row.distanceNm) && row.distanceNm > maxValue ? row.distanceNm : maxValue),
    0
  );

  for (const row of activeRows) {
    if (Number.isFinite(row.dateSortKey) && row.dateSortKey > 0) {
      minDateSortKey = Math.min(minDateSortKey, row.dateSortKey);
      maxDateSortKey = Math.max(maxDateSortKey, row.dateSortKey);
    }

    if (Number.isFinite(row.durationMinutes) && row.durationMinutes > maxDurationMinutes) {
      maxDurationMinutes = row.durationMinutes;
    }
  }

  return {
    minDateSortKey: Number.isFinite(minDateSortKey) ? minDateSortKey : 0,
    maxDateSortKey,
    minDateIso: sortKeyToDateString(Number.isFinite(minDateSortKey) ? minDateSortKey : 0),
    maxDateIso: sortKeyToDateString(maxDateSortKey),
    maxDurationMinutes: roundUpToStep(maxDurationMinutes, 60),
    minDistanceNm: DEFAULT_DISTANCE_BOUNDS.minDistanceNm,
    maxDistanceNm: roundUpToStep(maxDistanceNm, 100)
  };
}

// Keeps persisted logbook filters inside the available bounds without mutating other features.
export function normalizeLogbookFilters(savedFilters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const nextFilters = {
    ...DEFAULT_LOGBOOK_FILTERS,
    dateStart: normalizeDateString(savedFilters?.dateStart),
    dateEnd: normalizeDateString(savedFilters?.dateEnd),
    airline: toSelectionArray(savedFilters?.airline),
    equipment: toSelectionArray(savedFilters?.equipment),
    departure: toSelectionArray(savedFilters?.departure).map((value) => value.toUpperCase()),
    arrival: toSelectionArray(savedFilters?.arrival).map((value) => value.toUpperCase()),
    durationMin: savedFilters?.durationMin,
    durationMax: savedFilters?.durationMax,
    distanceMin: savedFilters?.distanceMin,
    distanceMax: savedFilters?.distanceMax
  };

  const maxDistance = Number(bounds?.maxDistanceNm);
  const maxDuration = Number(bounds?.maxDurationMinutes);
  const hasPositiveBounds = Number.isFinite(maxDistance) && maxDistance > 0;
  const hasPositiveDurationBounds = Number.isFinite(maxDuration) && maxDuration > 0;

  if (nextFilters.dateStart && nextFilters.dateEnd) {
    const startSortKey = dateStringToSortKey(nextFilters.dateStart);
    const endSortKey = dateStringToSortKey(nextFilters.dateEnd);

    if (
      Number.isFinite(startSortKey) &&
      Number.isFinite(endSortKey) &&
      endSortKey < startSortKey
    ) {
      nextFilters.dateEnd = nextFilters.dateStart;
    }
  }

  nextFilters.durationMin = hasPositiveDurationBounds
    ? clampRange(Number(nextFilters.durationMin), 0, maxDuration, 0)
    : 0;

  const rawDurationMax = Number(nextFilters.durationMax);
  if (!Number.isFinite(rawDurationMax)) {
    nextFilters.durationMax = null;
  } else if (!hasPositiveDurationBounds) {
    nextFilters.durationMax = rawDurationMax > 0 ? rawDurationMax : null;
  } else if (rawDurationMax <= 0 && nextFilters.durationMin <= 0) {
    nextFilters.durationMax = null;
  } else {
    nextFilters.durationMax = clampRange(rawDurationMax, nextFilters.durationMin, maxDuration, null);
  }

  nextFilters.distanceMin = hasPositiveBounds
    ? clampRange(Number(nextFilters.distanceMin), 0, maxDistance, 0)
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

// Maps the persisted date filters to the effective date range used by the selectors.
export function getEffectiveLogbookDateRange(filters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const normalizedFilters = normalizeLogbookFilters(filters, bounds);
  const minDateSortKey = Number(bounds?.minDateSortKey) || 0;
  const maxDateSortKey = Number(bounds?.maxDateSortKey) || 0;
  const selectedStart = dateStringToSortKey(normalizedFilters.dateStart);
  const selectedEnd = dateStringToSortKey(normalizedFilters.dateEnd);

  return {
    min: Number.isFinite(selectedStart) ? selectedStart : minDateSortKey,
    max: Number.isFinite(selectedEnd) ? selectedEnd : maxDateSortKey
  };
}

// Maps the persisted duration filters to the effective range used by the selectors.
export function getEffectiveLogbookDurationRange(filters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const normalizedFilters = normalizeLogbookFilters(filters, bounds);
  const effectiveMax = Number(bounds?.maxDurationMinutes) || 0;
  const min = Number.isFinite(normalizedFilters.durationMin) ? normalizedFilters.durationMin : 0;
  const max = Number.isFinite(normalizedFilters.durationMax)
    ? normalizedFilters.durationMax
    : Math.max(effectiveMax, min);

  return {
    min,
    max
  };
}

// Evaluates whether a single logbook row date should pass the active date filter state.
export function shouldIncludeLogbookDateRow(dateSortKey, filters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const normalizedFilters = normalizeLogbookFilters(filters, bounds);
  const effectiveRange = getEffectiveLogbookDateRange(normalizedFilters, bounds);
  const hasDateConstraint =
    effectiveRange.min !== Number(bounds?.minDateSortKey || 0) ||
    effectiveRange.max !== Number(bounds?.maxDateSortKey || 0);

  if (!Number.isFinite(dateSortKey)) {
    return !hasDateConstraint;
  }

  return dateSortKey >= effectiveRange.min && dateSortKey <= effectiveRange.max;
}

// Evaluates whether a single logbook row duration should pass the active duration filter state.
export function shouldIncludeLogbookDurationRow(
  durationMinutes,
  filters,
  bounds = DEFAULT_DISTANCE_BOUNDS
) {
  const normalizedFilters = normalizeLogbookFilters(filters, bounds);
  const effectiveRange = getEffectiveLogbookDurationRange(normalizedFilters, bounds);
  const hasDurationConstraint =
    effectiveRange.min !== 0 || effectiveRange.max !== Number(bounds?.maxDurationMinutes || 0);

  if (!Number.isFinite(durationMinutes)) {
    return !hasDurationConstraint;
  }

  return durationMinutes >= effectiveRange.min && durationMinutes <= effectiveRange.max;
}

// Evaluates whether a single logbook row distance should pass the active distance filter state.
export function shouldIncludeLogbookDistanceRow(distanceNm, filters, bounds = DEFAULT_DISTANCE_BOUNDS) {
  const normalizedFilters = normalizeLogbookFilters(filters, bounds);
  const hasDistanceConstraint =
    normalizedFilters.distanceMin > 0 || Number.isFinite(normalizedFilters.distanceMax);

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
