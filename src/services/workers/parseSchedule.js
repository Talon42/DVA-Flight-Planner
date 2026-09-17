import { DateTime } from "luxon";
import airlinesData from "../../data/airlines.json";
import airportsData from "../../data/airports.json";

const MINIMUM_COMPLETE_SCHEDULE_ROWS = 250;
const SCHEDULE_BLOCK_ALLOWANCE_MINUTES = 50;
const SCHEDULE_BASE_GROUND_SPEED_KTS = 450;
const SCHEDULE_DIRECTIONAL_ADJUSTMENT_KTS = 30;

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCoordinate(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeScalar(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

const airlineRows = Array.isArray(airlinesData) ? airlinesData : [];
const airportRows = airportsData.airports || [];

const airlineMap = new Map(
  airlineRows.map((row) => [
    String(row.IATA || row.ICAO || "").trim().toUpperCase(),
    row.Airline
  ])
);

const airlineIcaoMap = new Map(
  airlineRows.map((row) => [
    String(row.IATA || row.ICAO || "").trim().toUpperCase(),
    String(row.ICAO || "").trim().toUpperCase()
  ])
);

const airportMap = new Map(
  airportRows.map((row) => [
    String(row.icao || "").trim().toUpperCase(),
    {
      icao: String(row.icao || "").trim().toUpperCase(),
      name: String(row.name || "").trim(),
      timezone: String(row.timezone || "").trim(),
      latitude: parseCoordinate(row.lat),
      longitude: parseCoordinate(row.lng)
    }
  ])
);

// Parses and normalizes the authenticated Delta Virtual /search.ws schedule response.
export function parseScheduleImport(fileName, scheduleText, debug = () => {}) {
  debug(`parse:start file=${fileName} chars=${scheduleText?.length || 0}`);
  const schedule = parseScheduleResponse(scheduleText);
  const entries = schedule.results;
  debug(`parse:results count=${entries.length}`);

  const importedAt = new Date().toISOString();
  const importIssues = [];
  const flights = [];

  for (const [index, entry] of entries.entries()) {
    if (index < 3 || (index + 1) % 5000 === 0) {
      debug(`parse:row-start index=${index + 1}`);
    }

    try {
      const rawFlight = readScheduleEntry(entry, schedule.sources);
      const fromAirport = airportMap.get(rawFlight.from);
      const toAirport = airportMap.get(rawFlight.to);
      const missingIcaos = [rawFlight.from, rawFlight.to].filter((icao) => !airportMap.has(icao));
      const stdZone = fromAirport?.timezone || "UTC";
      const staZone = toAirport?.timezone || "UTC";
      const stdResult = buildScheduleDateTime(rawFlight.effectiveDate, rawFlight.departureClock, stdZone);
      const sourceArrival = rawFlight.arrivalClock
        ? buildScheduleDateTime(rawFlight.effectiveDate, rawFlight.arrivalClock, staZone)
        : null;
      const stdLocal = stdResult.value;
      const stdUtc = stdLocal.toUTC();
      const distanceNm = fromAirport && toAirport
        ? calculateGreatCircleNm(
            fromAirport.latitude,
            fromAirport.longitude,
            toAirport.latitude,
            toAirport.longitude
          )
        : null;
      const effectiveSpeedKts = calculateScheduleGroundSpeedKts(fromAirport, toAirport);
      const estimatedBlockMinutes = estimateBlockMinutes(distanceNm, effectiveSpeedKts);
      const fallbackBlockMinutes = rawFlight.sourceDurationMinutes;
      const blockMinutes = Number.isFinite(estimatedBlockMinutes)
        ? estimatedBlockMinutes
        : fallbackBlockMinutes;
      const staUtc = Number.isFinite(blockMinutes)
        ? stdUtc.plus({ minutes: blockMinutes })
        : sourceArrival?.value
          ? normalizeSourceArrivalDate(stdUtc, sourceArrival.value.toUTC())
          : stdUtc;
      const staLocal = staUtc.setZone(staZone);
      const issuePrefix = `${rawFlight.airline}${rawFlight.flightNumber} ${rawFlight.from}-${rawFlight.to}`;

      if (missingIcaos.length) {
        importIssues.push({
          severity: "warning",
          kind: "missing-airport",
          flightId: buildFlightId(rawFlight),
          sourceFileName: fileName,
          missingAirportIcaos: missingIcaos,
          details: `${issuePrefix} imported with missing airport data for ${missingIcaos.join(
            ", "
          )}. Airport does not exist in database.`,
          loggedAt: importedAt
        });
      }

      if (stdResult.defaulted) {
        importIssues.push({
          severity: "warning",
          kind: "invalid-time-defaulted",
          flightId: buildFlightId(rawFlight),
          sourceFileName: fileName,
          details: `${issuePrefix} imported with invalid departure time defaulted to 00:00.`,
          loggedAt: importedAt,
          defaultedScheduleTimes: {
            std: true,
            rawStd: rawFlight.departureClock
          }
        });
      }

      const airlineName = airlineMap.get(rawFlight.airline) || `${rawFlight.airline} (not in airline map)`;
      const airlineIcao = airlineIcaoMap.get(rawFlight.airline) || "";

      flights.push({
        flightId: buildFlightId(rawFlight),
        flightCode: `${rawFlight.airline}${rawFlight.flightNumber}`,
        flightNumber: rawFlight.flightNumber,
        airline: rawFlight.airline,
        airlineName,
        airlineIcao,
        callsign: `${airlineIcao || rawFlight.airline}${rawFlight.flightNumber}`,
        leg: rawFlight.leg,
        from: rawFlight.from,
        to: rawFlight.to,
        route: `${rawFlight.from}-${rawFlight.to}`,
        fromAirport: fromAirport?.name || `${rawFlight.from} (not in database)`,
        toAirport: toAirport?.name || `${rawFlight.to} (not in database)`,
        fromTimezone: stdZone,
        toTimezone: staZone,
        missingAirportIcaos: missingIcaos,
        hasMissingAirportData: missingIcaos.length > 0,
        effectiveDate: rawFlight.effectiveDate,
        stdLocal: stdLocal.toISO(),
        staLocal: staLocal.toISO(),
        stdUtc: stdUtc.toISO(),
        staUtc: staUtc.toISO(),
        stdUtcMillis: stdUtc.toMillis(),
        staUtcMillis: staUtc.toMillis(),
        localDepartureClock: stdLocal.toFormat("HH:mm"),
        utcDepartureClock: stdUtc.toFormat("HH:mm"),
        equipmentType: rawFlight.equipmentType,
        scheduleSource: rawFlight.scheduleSource,
        historic: rawFlight.historic,
        academy: rawFlight.academy,
        sourceDurationMinutes: rawFlight.sourceDurationMinutes,
        sourceArrivalClock: rawFlight.arrivalClock,
        sourceDistanceMiles: rawFlight.sourceDistanceMiles,
        blockMinutes: Number.isFinite(blockMinutes) ? blockMinutes : null,
        distanceNm,
        selectedAircraft: "",
        simbriefPlan: null,
        isShortlisted: false,
        boardSequence: null,
        notes: ""
      });
    } catch (error) {
      throw new Error(
        `Import parser failed at schedule row ${index + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
  }

  const importLog = buildImportLog(importedAt, fileName, importIssues);

  return {
    importedAt,
    scheduleMetadata: {
      created: parseNumeric(schedule.created),
      sources: schedule.sources
    },
    flights,
    importIssues,
    importLog,
    importSummary: {
      sourceFileName: fileName,
      totalRows: entries.length,
      importedRows: flights.length,
      omittedRows: 0,
      errorLogPath: importIssues.length ? "pending-write" : null
    }
  };
}

function parseScheduleResponse(scheduleText) {
  let schedule;

  try {
    schedule = JSON.parse(String(scheduleText ?? ""));
  } catch (error) {
    throw new Error(
      `The selected schedule is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    throw new Error("The selected schedule response must be a JSON object.");
  }

  if (!schedule.sources || typeof schedule.sources !== "object" || Array.isArray(schedule.sources)) {
    throw new Error("The selected schedule response is missing its sources object.");
  }

  if (!Array.isArray(schedule.results)) {
    throw new Error("The selected schedule response is missing its results array.");
  }

  if (schedule.results.length <= MINIMUM_COMPLETE_SCHEDULE_ROWS) {
    throw new Error(
      `Delta Virtual returned only ${schedule.results.length} schedule rows; the schedule service may be truncated.`
    );
  }

  schedule.results.forEach((entry, index) => validateScheduleEntry(entry, schedule.sources, index));
  return schedule;
}

function validateScheduleEntry(entry, sources, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Schedule row ${index + 1} is not an object.`);
  }

  const requiredTextFields = ["airline", "flight", "leg", "eqType", "src"];
  for (const field of requiredTextFields) {
    if (!normalizeScalar(entry[field])) {
      throw new Error(`Schedule row ${index + 1} is missing required field ${field}.`);
    }
  }

  for (const field of ["airportD", "airportA", "timeD"]) {
    if (!entry[field] || typeof entry[field] !== "object" || Array.isArray(entry[field])) {
      throw new Error(`Schedule row ${index + 1} is missing required object ${field}.`);
    }
  }

  if (!normalizeText(entry.airportD.icao) || !normalizeText(entry.airportA.icao)) {
    throw new Error(`Schedule row ${index + 1} is missing a departure or arrival airport ICAO.`);
  }

  if (!hasScheduleClock(entry.timeD)) {
    throw new Error(`Schedule row ${index + 1} is missing a departure clock.`);
  }

  const source = sources[normalizeScalar(entry.src)];
  if (!source || typeof source !== "object" || !Number.isFinite(Number(source.effectiveDate))) {
    throw new Error(`Schedule row ${index + 1} references a source without an effective date.`);
  }
}

function readScheduleEntry(entry, sources) {
  const scheduleSource = normalizeScalar(entry.src);
  const effectiveDate = toDateToken(sources[scheduleSource].effectiveDate);
  if (!effectiveDate) {
    throw new Error(`Schedule source ${scheduleSource} has an invalid effective date.`);
  }

  return {
    airline: normalizeText(entry.airline).toUpperCase(),
    flightNumber: normalizeScalar(entry.flight),
    leg: normalizeScalar(entry.leg),
    from: normalizeText(entry.airportD.icao).toUpperCase(),
    to: normalizeText(entry.airportA.icao).toUpperCase(),
    equipmentType: normalizeText(entry.eqType),
    scheduleSource,
    historic: entry.historic ?? false,
    academy: entry.academy ?? false,
    effectiveDate,
    departureClock: readScheduleClock(entry.timeD),
    arrivalClock: readScheduleClock(entry.timeA),
    sourceDurationMinutes: parseDurationMinutes(entry.duration),
    sourceDistanceMiles: parseNumeric(entry.distance)
  };
}

function toDateToken(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) {
    return "";
  }

  const date = DateTime.fromMillis(milliseconds, { zone: "UTC" });
  return date.isValid ? date.toISODate() : "";
}

function hasScheduleClock(value) {
  return Boolean(readScheduleClock(value));
}

function readScheduleClock(value) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const text = normalizeText(value.text);
  const textMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (textMatch) {
    const hours = Number(textMatch[1]);
    const minutes = Number(textMatch[2]);
    const seconds = Number(textMatch[3] || 0);
    if (hours < 24 && minutes < 60 && seconds < 60) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
  }

  const hours = Number(value.h);
  const minutes = Number(value.m);
  const seconds = Number(value.s || 0);
  if (
    Number.isInteger(hours) && hours >= 0 && hours < 24 &&
    Number.isInteger(minutes) && minutes >= 0 && minutes < 60 &&
    Number.isInteger(seconds) && seconds >= 0 && seconds < 60
  ) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return "";
}

function buildScheduleDateTime(dateToken, clock, zone) {
  const normalizedClock = normalizeText(clock) || "00:00:00";
  const value = DateTime.fromISO(`${dateToken}T${normalizedClock}`, { zone });
  return {
    value: value.isValid ? value : DateTime.fromISO(`${dateToken}T00:00:00`, { zone: "UTC" }),
    defaulted: !value.isValid
  };
}

function parseDurationMinutes(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value / 60_000) : null;
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const clockMatch = normalized.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (clockMatch) {
    return Number(clockMatch[1]) * 60 + Number(clockMatch[2]) + Math.round(Number(clockMatch[3] || 0) / 60);
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric / 60_000) : null;
}

function normalizeSourceArrivalDate(stdUtc, sourceArrivalUtc) {
  let candidate = sourceArrivalUtc;
  while (candidate < stdUtc) {
    candidate = candidate.plus({ days: 1 });
  }
  return candidate;
}

function estimateBlockMinutes(distanceNm, effectiveSpeedKts) {
  if (!Number.isFinite(distanceNm) || distanceNm < 0) {
    return null;
  }

  if (!Number.isFinite(effectiveSpeedKts) || effectiveSpeedKts <= 0) {
    return null;
  }

  return Math.round(
    SCHEDULE_BLOCK_ALLOWANCE_MINUTES + (distanceNm / effectiveSpeedKts) * 60
  );
}

function calculateScheduleGroundSpeedKts(fromAirport, toAirport) {
  const fromLatitude = fromAirport?.latitude;
  const fromLongitude = fromAirport?.longitude;
  const toLatitude = toAirport?.latitude;
  const toLongitude = toAirport?.longitude;
  const longitudeDelta = getWrappedLongitudeDelta(fromLongitude, toLongitude);

  if (
    !Number.isFinite(fromLatitude) ||
    !Number.isFinite(fromLongitude) ||
    !Number.isFinite(toLatitude) ||
    !Number.isFinite(toLongitude) ||
    !Number.isFinite(longitudeDelta)
  ) {
    return null;
  }

  const bearingDegrees = calculateInitialBearingDegrees(
    fromLatitude,
    fromLongitude,
    toLatitude,
    longitudeDelta
  );
  if (!Number.isFinite(bearingDegrees)) {
    return null;
  }

  const eastWestFactor = Math.sin(degreesToRadians(bearingDegrees));
  return SCHEDULE_BASE_GROUND_SPEED_KTS +
    SCHEDULE_DIRECTIONAL_ADJUSTMENT_KTS * eastWestFactor;
}

function calculateInitialBearingDegrees(fromLatitude, fromLongitude, toLatitude, wrappedLongitudeDelta) {
  const lat1 = degreesToRadians(fromLatitude);
  const lat2 = degreesToRadians(toLatitude);
  const deltaLon = degreesToRadians(wrappedLongitudeDelta);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const bearingRadians = Math.atan2(y, x);
  return ((bearingRadians * 180) / Math.PI + 360) % 360;
}

function getWrappedLongitudeDelta(fromLongitude, toLongitude) {
  if (!Number.isFinite(fromLongitude) || !Number.isFinite(toLongitude)) {
    return null;
  }

  let delta = toLongitude - fromLongitude;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function calculateGreatCircleNm(fromLatitude, fromLongitude, toLatitude, toLongitude) {
  if (
    !Number.isFinite(fromLatitude) ||
    !Number.isFinite(fromLongitude) ||
    !Number.isFinite(toLatitude) ||
    !Number.isFinite(toLongitude)
  ) {
    return null;
  }

  const earthRadiusNm = 3440.065;
  const lat1 = degreesToRadians(fromLatitude);
  const lon1 = degreesToRadians(fromLongitude);
  const lat2 = degreesToRadians(toLatitude);
  const lon2 = degreesToRadians(toLongitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusNm * c);
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function buildFlightId(rawFlight) {
  return [
    rawFlight.airline,
    rawFlight.flightNumber,
    rawFlight.leg,
    rawFlight.from,
    rawFlight.to,
    rawFlight.effectiveDate,
    rawFlight.departureClock
  ].join("|");
}

function buildImportLog(importedAt, fileName, importIssues) {
  if (!importIssues.length) {
    return "";
  }

  const missingAirportIcaos = new Set();
  const lines = [`[${importedAt}] Import file: ${fileName}`];

  for (const issue of importIssues) {
    if (issue.kind === "missing-airport") {
      for (const icao of issue.missingAirportIcaos || []) {
        const normalizedIcao = normalizeText(icao).toUpperCase();
        if (normalizedIcao && !missingAirportIcaos.has(normalizedIcao)) {
          missingAirportIcaos.add(normalizedIcao);
          lines.push(`${issue.severity.toUpperCase()} | ${issue.kind} | ${normalizedIcao} missing from airport database.`);
        }
      }
      continue;
    }

    lines.push(`${issue.severity.toUpperCase()} | ${issue.kind} | ${issue.details}`);
  }

  return lines.join("\n");
}
