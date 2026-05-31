// Normalizes tour IDs so every DVA tour uses the same `dva:` prefix shape.
export function normalizeDvaTourId(tourOrId) {
  if (typeof tourOrId === "string") {
    const normalizedId = String(tourOrId || "").trim();
    if (!normalizedId) {
      return "";
    }

    return normalizedId.startsWith("dva:") ? normalizedId : `dva:${normalizedId}`;
  }

  const explicitId = String(tourOrId?.id || "").trim();
  if (explicitId.startsWith("dva:")) {
    return explicitId;
  }

  const sourceId = String(tourOrId?.sourceId || "").trim();
  if (sourceId) {
    return sourceId.startsWith("dva:") ? sourceId : `dva:${sourceId}`;
  }

  return "";
}

// Normalizes row fragments used in generated IDs to stable uppercase tokens.
export function normalizeDvaTourRowSegment(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Builds the canonical row ID shared by board entries and derived progress.
export function buildDvaTourCanonicalRowId(tourId, row) {
  const normalizedTourId = normalizeDvaTourId(tourId);

  if (!normalizedTourId) {
    return "";
  }

  const airline = normalizeDvaTourRowSegment(
    row?.airline || row?.airlineIcao || row?.airlineName || ""
  );
  const flightNumber = normalizeDvaTourRowSegment(
    row?.flightNumber || row?.tourFlightNumber || row?.flight || ""
  );
  const leg = Number.isFinite(Number(row?.leg)) ? `LEG-${Number(row.leg)}` : "";
  const departure = normalizeDvaTourRowSegment(
    row?.from || row?.departure || row?.departureIata || row?.departureName || ""
  );
  const destination = normalizeDvaTourRowSegment(
    row?.to || row?.destination || row?.destinationIata || row?.destinationName || ""
  );
  const departureTime = normalizeDvaTourRowSegment(
    row?.departureTime || row?.departureTimeLabel || row?.timeD?.text || ""
  );
  const arrivalTime = normalizeDvaTourRowSegment(
    row?.arrivalTime || row?.arrivalTimeLabel || row?.timeA?.text || ""
  );
  const equipment = normalizeDvaTourRowSegment(row?.equipment || row?.aircraft || row?.eqType || "");
  const route = normalizeDvaTourRowSegment(row?.route || "");

  const segments = [
    airline ? `airline-${airline}` : "",
    flightNumber ? `flight-${flightNumber}` : "",
    leg,
    departure ? `dep-${departure}` : "",
    destination ? `arr-${destination}` : "",
    departureTime ? `dpt-${departureTime}` : "",
    arrivalTime ? `arrt-${arrivalTime}` : "",
    equipment ? `eq-${equipment}` : "",
    route ? `route-${route}` : ""
  ].filter(Boolean);

  return segments.length ? `dva:${normalizedTourId}:${segments.join(":")}` : "";
}

// Preserves older row IDs so existing stored data can still be matched.
export function buildLegacyDvaTourRowId(tourId, rowOrId) {
  const normalizedTourId = normalizeDvaTourId(tourId);
  const rawId =
    typeof rowOrId === "string"
      ? rowOrId
      : String(
          rowOrId?.id || rowOrId?.flightId || rowOrId?.sourceId || rowOrId?.tourRowId || ""
        ).trim();

  if (!normalizedTourId || !rawId) {
    return "";
  }

  return rawId.startsWith(`dva:${normalizedTourId}:`)
    ? rawId
    : `dva:${normalizedTourId}:${rawId}`;
}

// Builds the lookup key used to resolve flights by tour path and row ID.
export function buildTourFlightLookupKey(tourPath, tourRowId) {
  const normalizedTourPath = String(tourPath || "").trim();
  const normalizedTourRowId = String(tourRowId || "").trim();

  if (!normalizedTourPath || !normalizedTourRowId) {
    return "";
  }

  return `${normalizedTourPath}::${normalizedTourRowId}`;
}

// Reuses the canonical row shape for UI row IDs in flight-board contexts.
export function buildDvaTourRowId(tourId, rowId) {
  return buildDvaTourCanonicalRowId(tourId, rowId);
}

// Builds the derived-progress row key written by the backend logbook reconciler.
export function buildDvaTourDerivedProgressRowId(tourId, row) {
  const normalizedTourId = normalizeDvaTourId(tourId);

  if (!normalizedTourId) {
    return "";
  }

  const airline = normalizeDvaTourRowSegment(
    row?.airline || row?.airlineIcao || row?.airlineName || ""
  );
  const flightNumber = normalizeDvaTourRowSegment(
    row?.flightNumber || row?.tourFlightNumber || row?.flight || ""
  );
  const leg = Number.isFinite(Number(row?.leg)) ? `leg-${Number(row.leg)}` : "";
  const departure = normalizeDvaTourRowSegment(
    row?.from || row?.departure || row?.departureIata || row?.departureName || ""
  );
  const destination = normalizeDvaTourRowSegment(
    row?.to || row?.destination || row?.destinationIata || row?.destinationName || ""
  );
  const departureTime = normalizeDvaTourRowSegment(
    row?.departureTime || row?.departureTimeLabel || row?.timeD?.text || ""
  );
  const arrivalTime = normalizeDvaTourRowSegment(
    row?.arrivalTime || row?.arrivalTimeLabel || row?.timeA?.text || ""
  );
  const equipment = normalizeDvaTourRowSegment(row?.equipment || row?.aircraft || row?.eqType || "");

  const segments = [
    airline ? `airline-${airline}` : "",
    flightNumber ? `flight-${flightNumber}` : "",
    leg,
    departure ? `dep-${departure}` : "",
    destination ? `arr-${destination}` : "",
    departureTime ? `dpt-${departureTime}` : "",
    arrivalTime ? `arrt-${arrivalTime}` : "",
    equipment ? `eq-${equipment}` : ""
  ].filter(Boolean);

  return segments.length ? `dva:${normalizedTourId}:${segments.join(":")}` : "";
}
