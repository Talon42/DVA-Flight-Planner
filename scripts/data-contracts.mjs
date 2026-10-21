// Returns the airport catalog only when its required root collection is usable.
export function requireNonEmptyAirportRows(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.airports)) {
    throw new Error("Airport catalog root must contain an airports array.");
  }

  if (data.airports.length === 0) {
    throw new Error("Airport catalog must contain at least one airport.");
  }

  return data.airports;
}

function isCoordinateInRange(value, minimum, maximum) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return false;
  }

  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum;
}

// Enforces the fields required by airport lookup and map consumers.
export function hasRequiredAirportFields(airport) {
  return Boolean(
    String(airport?.icao ?? "").trim() &&
      String(airport?.name ?? "").trim() &&
      isCoordinateInRange(airport?.lat, -90, 90) &&
      isCoordinateInRange(airport?.lng, -180, 180) &&
      String(airport?.timezone ?? "").trim()
  );
}

// Separates approved violations and reports exceptions that no longer match a violation.
export function partitionAllowed(items, exceptions, getKey) {
  const exceptionMap = exceptions && typeof exceptions === "object" ? exceptions : {};
  const usedExceptionKeys = new Set();
  const result = items.reduce(
    (partition, item) => {
      const key = getKey(item);
      if (key && exceptionMap[key]) {
        usedExceptionKeys.add(key);
        partition.allowed.push({ item, key, reason: exceptionMap[key] });
      } else {
        partition.failures.push(item);
      }
      return partition;
    },
    { allowed: [], failures: [] }
  );

  return {
    ...result,
    staleExceptionKeys: Object.keys(exceptionMap).filter((key) => !usedExceptionKeys.has(key))
  };
}

export function isValidTimezone(timezone) {
  const normalizedTimezone = String(timezone ?? "").trim();
  if (!normalizedTimezone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalizedTimezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

const OFFSET_LABEL_PATTERN = /^(?:GMT|UTC)[+-]\d{1,2}(?::\d{2})?$/i;

// Audits timezone labels independently from file I/O so malformed fixtures can be tested.
export function auditAirportTimezoneCatalog(data, timezoneExceptions = {}) {
  const airports = requireNonEmptyAirportRows(data);
  const failures = [];
  const invalidTimezoneRows = [];
  const uniqueLabels = new Set();

  for (const airport of airports) {
    const icao = String(airport?.icao ?? "").trim().toUpperCase() || "(missing ICAO)";
    const timezoneLabel = String(airport?.timezoneLabel ?? "").trim();
    const timezone = String(airport?.timezone ?? "").trim();

    if (!Object.prototype.hasOwnProperty.call(airport || {}, "timezoneLabel")) {
      failures.push(`${icao}: missing timezoneLabel property`);
      continue;
    }

    if (!timezoneLabel) {
      failures.push(`${icao}: empty timezoneLabel`);
      continue;
    }

    if (OFFSET_LABEL_PATTERN.test(timezoneLabel)) {
      failures.push(`${icao}: offset timezoneLabel "${timezoneLabel}"`);
      continue;
    }

    uniqueLabels.add(timezoneLabel);
    if (!isValidTimezone(timezone)) {
      invalidTimezoneRows.push({ icao, timezone: timezone || "(empty)" });
    }
  }

  const timezoneResult = partitionAllowed(
    invalidTimezoneRows,
    timezoneExceptions,
    (airport) => airport.icao
  );
  failures.push(
    ...timezoneResult.failures.map(
      (airport) => `${airport.icao}: timezone "${airport.timezone}" is invalid or missing`
    )
  );
  failures.push(
    ...timezoneResult.staleExceptionKeys.map(
      (icao) => `${icao}: stale airportTimezoneExceptions entry has no matching violation`
    )
  );

  return {
    airports,
    failures,
    allowedTimezoneExceptions: timezoneResult.allowed.map(({ item, key, reason }) => ({
      icao: key,
      timezone: item.timezone,
      reason
    })),
    uniqueLabels
  };
}
