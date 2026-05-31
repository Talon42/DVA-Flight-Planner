// Normalizes tour date values so visibility logic can compare strings, seconds,
// and milliseconds without duplicating parsing rules.
export function normalizeDvaTourEpochSeconds(value) {
  const normalizedValue = String(value ?? "").trim();
  if (
    !normalizedValue ||
    normalizedValue === "0" ||
    normalizedValue === "null" ||
    normalizedValue === "undefined"
  ) {
    return null;
  }

  const numericValue = Number(normalizedValue);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue > 10000000000 ? Math.floor(numericValue / 1000) : Math.floor(numericValue);
  }

  const parsedValue = Date.parse(normalizedValue);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Math.floor(parsedValue / 1000);
}

// Derives the visibility flags used to group and label tours in the planner UI.
export function buildDvaTourVisibilityMetadata(tour, nowSeconds = Math.floor(Date.now() / 1000)) {
  const active = Boolean(tour?.active);
  const startDate = normalizeDvaTourEpochSeconds(tour?.startDate ?? tour?.start_date ?? null);
  const endDate = normalizeDvaTourEpochSeconds(tour?.endDate ?? tour?.end_date ?? null);
  const isExpired = endDate !== null && endDate > 0 && endDate < nowSeconds;
  const isCurrent =
    active &&
    !isExpired &&
    (startDate === null || startDate <= nowSeconds) &&
    (endDate === null || endDate >= nowSeconds);
  const isUpcoming = active && !isExpired && !isCurrent && startDate !== null && startDate > nowSeconds;

  return {
    startDate,
    endDate,
    isExpired,
    isCurrent,
    isUpcoming,
    visibilityStatus: isExpired ? "expired" : isUpcoming ? "upcoming" : "current"
  };
}

// Sorts tours by visibility state first so current tours stay above upcoming and expired ones.
export function getDvaTourVisibilityRank(tour) {
  switch (String(tour?.visibilityStatus || "").trim()) {
    case "current":
      return 0;
    case "upcoming":
      return 1;
    case "expired":
      return 2;
    default:
      return 3;
  }
}

// Keeps tour ordering stable within each visibility bucket.
export function compareDvaToursForDisplay(left, right) {
  const leftRank = getDvaTourVisibilityRank(left);
  const rightRank = getDvaTourVisibilityRank(right);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  if (leftRank === 2) {
    const leftEndDate = normalizeDvaTourEpochSeconds(left?.endDate ?? left?.end_date ?? null);
    const rightEndDate = normalizeDvaTourEpochSeconds(right?.endDate ?? right?.end_date ?? null);

    if (leftEndDate !== rightEndDate) {
      if (leftEndDate === null) {
        return 1;
      }
      if (rightEndDate === null) {
        return -1;
      }

      return rightEndDate - leftEndDate;
    }
  }

  return Number(left?._tourSourceIndex ?? 0) - Number(right?._tourSourceIndex ?? 0);
}
