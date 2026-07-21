import { DateTime } from "luxon";
import { getAirlineLogo, getAirlineLogoClassName, getAirlineNameByCode } from "../airlines/airlineBranding.js";

export const LOGBOOK_EMPTY_VALUE = "\u2014";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeUpperText(value) {
  return normalizeText(value).toUpperCase();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = typeof value === "string" ? Number(value.replace(/,/g, "").trim()) : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeEpochMilliseconds(value) {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  if (numeric >= 1_000_000_000_000) {
    return Math.round(numeric);
  }

  if (numeric >= 1_000_000_000) {
    return Math.round(numeric * 1000);
  }

  return null;
}

function formatTimestamp(value) {
  const epochMilliseconds = normalizeEpochMilliseconds(value);
  if (!epochMilliseconds) {
    return LOGBOOK_EMPTY_VALUE;
  }

  return DateTime.fromMillis(epochMilliseconds).toFormat("MM/dd/yyyy HH:mm");
}

function normalizeLogbookMonth(rawMonth) {
  const numericMonth = toNumber(rawMonth);
  if (!Number.isFinite(numericMonth)) {
    return null;
  }

  if (numericMonth >= 0 && numericMonth <= 11) {
    return numericMonth + 1;
  }

  if (numericMonth === 12) {
    return 12;
  }

  return null;
}

function extractDateParts(entry) {
  const date = entry?.date;
  if (!date || typeof date !== "object") {
    return null;
  }

  const year = toNumber(date.y);
  const month = normalizeLogbookMonth(date.m);
  const day = toNumber(date.d);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
}

function formatDvaDate(entry) {
  const parts = extractDateParts(entry);
  if (!parts) {
    return LOGBOOK_EMPTY_VALUE;
  }

  return DateTime.fromObject({
    year: parts.year,
    month: parts.month,
    day: parts.day
  }).toFormat("MM/dd/yyyy");
}

function formatDvaDateCompact(entry) {
  const parts = extractDateParts(entry);
  if (!parts) {
    return LOGBOOK_EMPTY_VALUE;
  }

  return DateTime.fromObject({
    year: parts.year,
    month: parts.month,
    day: parts.day
  }).toFormat("M/d/yy");
}

function buildDateSortKey(entry) {
  const parts = extractDateParts(entry);
  if (!parts) {
    return 0;
  }

  return parts.year * 10_000 + parts.month * 100 + parts.day;
}

function parseClockDurationMinutes(value) {
  const trimmed = normalizeText(value);
  const match = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (minutes > 59 || seconds > 59) {
    return null;
  }

  return hours * 60 + minutes + Math.round(seconds / 60);
}

function parseNumericDurationMinutes(value, divisor) {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric / divisor);
}

// DVA exports overall duration in milliseconds; clock strings remain unit-explicit.
export function parseLogbookDurationMinutes(value) {
  if (typeof value === "string") {
    const clockMinutes = parseClockDurationMinutes(value);
    if (clockMinutes !== null) {
      return clockMinutes;
    }
  }

  return parseNumericDurationMinutes(value, 60_000);
}

// DVA exports block and airborne numeric values in milliseconds; clock strings are HH:MM or HH:MM:SS.
export function parseLogbookBlockTimeMinutes(value) {
  if (typeof value === "string") {
    const clockMinutes = parseClockDurationMinutes(value);
    if (clockMinutes !== null) {
      return clockMinutes;
    }
  }

  return parseNumericDurationMinutes(value, 60_000);
}

export function parseLogbookAirborneTimeMinutes(value) {
  return parseLogbookBlockTimeMinutes(value);
}

function formatMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return LOGBOOK_EMPTY_VALUE;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatAviationNumber(value, unit, options = {}) {
  if (!Number.isFinite(value)) {
    return LOGBOOK_EMPTY_VALUE;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0
  });
  return `${formatter.format(value)} ${unit}`.trim();
}

function formatSignedAviationNumber(value, unit, options = {}) {
  if (!Number.isFinite(value)) {
    return LOGBOOK_EMPTY_VALUE;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    signDisplay: "always"
  });
  return `${formatter.format(value)} ${unit}`.replace("+", "");
}

export function formatLogbookDuration(value) {
  return formatMinutes(parseLogbookDurationMinutes(value));
}

export function formatLogbookBlockTime(value) {
  return formatMinutes(parseLogbookBlockTimeMinutes(value));
}

export function formatLogbookAirborneTime(value) {
  return formatMinutes(parseLogbookAirborneTimeMinutes(value));
}

export function formatLogbookTimestamp(value) {
  return formatTimestamp(value);
}

export function formatLogbookAviationNumber(value, unit, options = {}) {
  return formatAviationNumber(toNumber(value), unit, options);
}

export function formatLogbookSignedAviationNumber(value, unit, options = {}) {
  return formatSignedAviationNumber(toNumber(value), unit, options);
}

// Maps landing vertical speed to the four landing quality labels shown in the details card.
export function formatLandingGrade(value) {
  const numericValue = toNumber(value);
  if (!Number.isFinite(numericValue)) {
    return LOGBOOK_EMPTY_VALUE;
  }

  const absValue = Math.abs(numericValue);

  if (absValue < 100) {
    return "Too Soft";
  }

  if (absValue < 350) {
    return "Optimal";
  }

  if (absValue < 650) {
    return "Firm";
  }

  return "Damaging";
}

function readAirportCode(airport) {
  if (airport && typeof airport === "object") {
    return normalizeUpperText(airport.icao || airport.iata || airport.code) || "";
  }

  return normalizeUpperText(airport);
}

function readAirportDisplay(airport) {
  if (!airport || typeof airport !== "object") {
    return LOGBOOK_EMPTY_VALUE;
  }

  const icao = normalizeUpperText(airport.icao);
  const iata = normalizeUpperText(airport.iata);
  const name = normalizeText(airport.name);
  return [icao || null, iata || null, name || null].filter(Boolean).join(" / ") || LOGBOOK_EMPTY_VALUE;
}

const LOGBOOK_STATUS_POLICIES = Object.freeze({
  approved: Object.freeze({
    canonical: "approved",
    displayLabel: "Approved",
    showInTable: true,
    includeInStats: true,
    includeInAirportProgress: true,
    includeInTourEligibility: true,
    includeInAccomplishmentEligibility: true
  }),
  submitted: Object.freeze({
    canonical: "submitted",
    displayLabel: "Pending",
    showInTable: true,
    includeInStats: true,
    includeInAirportProgress: true,
    includeInTourEligibility: true,
    includeInAccomplishmentEligibility: true
  }),
  held: Object.freeze({
    canonical: "held",
    displayLabel: "HOLD",
    showInTable: true,
    includeInStats: true,
    includeInAirportProgress: false,
    includeInTourEligibility: false,
    includeInAccomplishmentEligibility: false
  }),
  rejected: Object.freeze({
    canonical: "rejected",
    displayLabel: "Rejected",
    showInTable: true,
    includeInStats: false,
    includeInAirportProgress: false,
    includeInTourEligibility: false,
    includeInAccomplishmentEligibility: false
  }),
  draft: Object.freeze({
    canonical: "draft",
    displayLabel: "Draft",
    showInTable: false,
    includeInStats: false,
    includeInAirportProgress: false,
    includeInTourEligibility: false,
    includeInAccomplishmentEligibility: false
  }),
  unknown: Object.freeze({
    canonical: "unknown",
    displayLabel: LOGBOOK_EMPTY_VALUE,
    showInTable: false,
    includeInStats: false,
    includeInAirportProgress: false,
    includeInTourEligibility: false,
    includeInAccomplishmentEligibility: false
  })
});

// Defines the canonical cross-runtime policy for every Delta Virtual logbook status.
export function normalizeLogbookStatus(value) {
  const normalized = normalizeUpperText(value);

  if (["OK", "ACCEPTED", "APPROVED", "COMPLETED", "COMPLETE"].includes(normalized)) {
    return LOGBOOK_STATUS_POLICIES.approved;
  }
  if (["SUBMITTED", "PENDING"].includes(normalized)) {
    return LOGBOOK_STATUS_POLICIES.submitted;
  }
  if (normalized === "HOLD") {
    return LOGBOOK_STATUS_POLICIES.held;
  }
  if (normalized === "REJECTED") {
    return LOGBOOK_STATUS_POLICIES.rejected;
  }
  if (normalized === "DRAFT") {
    return LOGBOOK_STATUS_POLICIES.draft;
  }

  return LOGBOOK_STATUS_POLICIES.unknown;
}

// Normalizes Delta Virtual logbook ids into the PIREP id format used by the report page.
export function buildDvaPirepId(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (/^0x[0-9a-f]+$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  if (/^\d+$/.test(normalized)) {
    const numeric = Number(normalized);
    if (Number.isSafeInteger(numeric) && numeric > 0) {
      return `0x${numeric.toString(16)}`;
    }
  }

  return null;
}

function buildCompactFlightLabel(entry) {
  const airlineCode = normalizeUpperText(entry?.airline || entry?.airlineCode || entry?.airlineIata);
  const flightNumber = normalizeText(entry?.flight || entry?.flightNumber || entry?.flightNo);

  if (airlineCode && flightNumber) {
    return `${airlineCode}${flightNumber}`;
  }

  if (flightNumber) {
    return flightNumber;
  }

  return normalizeText(entry?.flightCode) || LOGBOOK_EMPTY_VALUE;
}

function buildFlightLabel(entry) {
  const airlineCode = normalizeUpperText(entry?.airline || entry?.airlineCode || entry?.airlineIata);
  const flightNumber = normalizeText(entry?.flight || entry?.flightNumber || entry?.flightNo);

  if (airlineCode && flightNumber) {
    return `${airlineCode} ${flightNumber}`;
  }

  if (flightNumber) {
    return flightNumber;
  }

  return normalizeText(entry?.flightCode) || LOGBOOK_EMPTY_VALUE;
}

function readNestedValue(preferredValue, nestedValue) {
  return preferredValue ?? nestedValue;
}

function readSimulator(entry) {
  return normalizeText(entry?.simulator || entry?.sim) || LOGBOOK_EMPTY_VALUE;
}

function readFdrSource(entry) {
  const fdrValue = entry?.fdr;
  if (fdrValue && typeof fdrValue === "object" && !Array.isArray(fdrValue)) {
    return normalizeText(entry?.fdrSource || fdrValue.source) || LOGBOOK_EMPTY_VALUE;
  }

  return normalizeText(entry?.fdrSource || fdrValue) || LOGBOOK_EMPTY_VALUE;
}

function buildDetailItem(label, value, options = {}) {
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (
    !options.showEmpty &&
    (normalizedValue === LOGBOOK_EMPTY_VALUE || normalizedValue === "" || normalizedValue === null)
  ) {
    return null;
  }

  return { label, value: normalizedValue || LOGBOOK_EMPTY_VALUE };
}

function buildDetailGroups(entry, normalizedRow) {
  return {
    flightSummary: [
      buildDetailItem("Logbook ID", normalizedRow.rawLogbookId || LOGBOOK_EMPTY_VALUE, { showEmpty: true }),
      buildDetailItem("Airline + Flight", normalizedRow.compactFlightLabel, { showEmpty: true }),
      buildDetailItem("Airline", normalizedRow.airlineDisplayName, { showEmpty: true }),
      buildDetailItem("Leg", normalizeText(entry.leg) || LOGBOOK_EMPTY_VALUE, { showEmpty: true }),
      buildDetailItem("Status", normalizedRow.statusDisplay, { showEmpty: true }),
      buildDetailItem("Raw Status", normalizeText(entry.status) || LOGBOOK_EMPTY_VALUE),
      buildDetailItem("Submitted On", formatTimestamp(entry.submittedOn)),
      buildDetailItem("Approved / Disposed On", formatTimestamp(entry.disposedOn)),
      buildDetailItem("Simulator", normalizedRow.simulator, { showEmpty: true }),
      buildDetailItem("FDR Source", readFdrSource(entry)),
      buildDetailItem("On-time Result", normalizeText(entry.onTimeResult || entry.onTime) || LOGBOOK_EMPTY_VALUE)
    ].filter(Boolean),
    aircraft: [
      buildDetailItem("Equipment", normalizedRow.equipment, { showEmpty: true }),
      buildDetailItem("Aircraft Name", normalizeText(entry?.aircraft?.name) || LOGBOOK_EMPTY_VALUE),
      buildDetailItem("Aircraft ICAO", normalizeUpperText(entry?.aircraft?.icao) || LOGBOOK_EMPTY_VALUE),
      buildDetailItem("Tail Code", normalizeUpperText(entry.tailCode || entry.tailNumber) || LOGBOOK_EMPTY_VALUE),
      buildDetailItem("AC Code", normalizeUpperText(entry.acCode || entry.aircraftCode) || LOGBOOK_EMPTY_VALUE)
    ].filter(Boolean),
    times: [
      buildDetailItem("Start Time", formatTimestamp(entry.startTime)),
      buildDetailItem("Taxi Time", formatTimestamp(entry.taxiTime)),
      buildDetailItem("Takeoff Time", formatTimestamp(readNestedValue(entry.takeoffTime, entry?.takeoff?.time))),
      buildDetailItem("Landing Time", formatTimestamp(readNestedValue(entry.landingTime, entry?.landing?.time))),
      buildDetailItem("End Time", formatTimestamp(readNestedValue(entry.endTime, entry?.end?.time))),
      buildDetailItem("Duration", normalizedRow.durationDisplay, { showEmpty: true }),
      buildDetailItem("Block Time", formatLogbookBlockTime(entry.blockTime)),
      buildDetailItem("Airborne Time", formatLogbookAirborneTime(entry.airborneTime))
    ].filter(Boolean),
    performance: [
      buildDetailItem("Distance", normalizedRow.distanceDisplay, { showEmpty: true }),
      buildDetailItem("Total Fuel", formatAviationNumber(toNumber(entry.totalFuel), "lb")),
      buildDetailItem(
        "Takeoff Fuel",
        formatAviationNumber(toNumber(readNestedValue(entry.takeoffFuel, entry?.takeoff?.fuel)), "lb")
      ),
      buildDetailItem(
        "Takeoff Weight",
        formatAviationNumber(toNumber(readNestedValue(entry.takeoffWeight, entry?.takeoff?.weight)), "lb")
      ),
      buildDetailItem(
        "Takeoff Speed",
        formatAviationNumber(toNumber(readNestedValue(entry.takeoffSpeed, entry?.takeoff?.speed)), "kt")
      ),
      buildDetailItem(
        "Landing Fuel",
        formatAviationNumber(toNumber(readNestedValue(entry.landingFuel, entry?.landing?.fuel)), "lb")
      ),
      buildDetailItem(
        "Landing Weight",
        formatAviationNumber(toNumber(readNestedValue(entry.landingWeight, entry?.landing?.weight)), "lb")
      ),
      buildDetailItem(
        "Landing Speed",
        formatAviationNumber(toNumber(readNestedValue(entry.landingSpeed, entry?.landing?.speed)), "kt")
      ),
      buildDetailItem("Landing Vertical Speed", formatSignedAviationNumber(toNumber(entry?.landing?.vSpeed), "fpm")),
      buildDetailItem(
        "Landing G-force",
        formatAviationNumber(toNumber(readNestedValue(entry?.landing?.gForce, entry?.landing?.g)), "g", {
          maximumFractionDigits: 3
        })
      ),
      buildDetailItem(
        "Average Frame Rate",
        formatAviationNumber(toNumber(entry.avgFrameRate), "FPS", { maximumFractionDigits: 1 })
      )
    ].filter(Boolean),
    airports: [
      buildDetailItem("Departure", readAirportDisplay(entry.airportD), { showEmpty: true }),
      buildDetailItem("Arrival", readAirportDisplay(entry.airportA), { showEmpty: true })
    ].filter(Boolean)
  };
}

function isUsefulLogbookEntry(entry) {
  return Boolean(
    normalizeText(entry?.logbookId ?? entry?.id) ||
      normalizeText(entry?.flight || entry?.flightNumber || entry?.flightCode) ||
      readAirportCode(entry?.airportD) ||
      readAirportCode(entry?.airportA)
  );
}

// Normalizes the cached Delta Virtual logbook into table-ready rows and details.
export function normalizeLogbookRows(entries) {
  const activeEntries = Array.isArray(entries) ? entries : [];
  const rows = [];

  activeEntries.forEach((entry, sourceIndex) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !isUsefulLogbookEntry(entry)) {
      return;
    }

    const statusPolicy = normalizeLogbookStatus(entry.status);
    // Table visibility comes from the canonical policy so draft and unknown records fail closed.
    if (!statusPolicy.showInTable) {
      return;
    }

    const rawLogbookId = normalizeText(entry.logbookId ?? entry.id);
    const dvaPirepId = buildDvaPirepId(entry.logbookId ?? entry.id);
    const dvaPirepUrl = dvaPirepId
      ? `https://www.deltava.org/pirep.do?id=${dvaPirepId}`
      : null;
    const compactFlightLabel = buildCompactFlightLabel(entry);
    const flightLabel = buildFlightLabel(entry);
    const airlineCode = normalizeUpperText(entry.airline || entry.airlineCode || entry.airlineIata);
    const airlineDisplayName = getAirlineNameByCode(airlineCode) || airlineCode || LOGBOOK_EMPTY_VALUE;
    const airlineLogoSrc = getAirlineLogo({
      airlineName: airlineDisplayName,
      airlineIata: airlineCode,
      airlineIcao: airlineCode
    });
    // Preserve the shared dark-mode contrast treatment for logo carriers that need it.
    const airlineLogoClassName = getAirlineLogoClassName({
      airlineName: airlineDisplayName,
      airlineIata: airlineCode,
      airlineIcao: airlineCode
    });
    const hasDurationValue = entry.duration !== undefined && entry.duration !== null && normalizeText(entry.duration) !== "";
    const durationMinutes = hasDurationValue
      ? parseLogbookDurationMinutes(entry.duration)
      : parseLogbookBlockTimeMinutes(entry.blockTime);
    const blockTimeMinutes = parseLogbookBlockTimeMinutes(entry.blockTime);
    const airborneMinutes = parseLogbookAirborneTimeMinutes(entry.airborneTime);
    const distanceNm = toNumber(entry.distance);
    const landingRate = toNumber(entry?.landing?.vSpeed);
    const row = {
      id: rawLogbookId || `logbook-row-${sourceIndex}`,
      rawLogbookId: rawLogbookId || null,
      dvaPirepId,
      dvaPirepUrl,
      sourceIndex,
      rawEntry: entry,
      dateDisplay: formatDvaDate(entry),
      dateDisplayCompact: formatDvaDateCompact(entry),
      dateSortKey: buildDateSortKey(entry),
      flightLabel,
      compactFlightLabel,
      airlineCode: airlineCode || LOGBOOK_EMPTY_VALUE,
      airlineDisplayName,
      airlineLogoSrc,
      airlineLogoClassName,
      departure: readAirportCode(entry.airportD) || LOGBOOK_EMPTY_VALUE,
      arrival: readAirportCode(entry.airportA) || LOGBOOK_EMPTY_VALUE,
      equipment:
        normalizeText(entry.eqType || entry?.aircraft?.icao || entry?.aircraft?.name) || LOGBOOK_EMPTY_VALUE,
      durationMinutes,
      durationDisplay: formatMinutes(durationMinutes),
      blockTimeMinutes,
      blockTimeDisplay: formatMinutes(blockTimeMinutes),
      airborneMinutes,
      airborneDisplay: formatMinutes(airborneMinutes),
      distanceNm,
      distanceDisplay: formatAviationNumber(distanceNm, "nm"),
      // The export's pax field is the authoritative passenger count for logbook records.
      passengerCount: toNumber(entry.pax),
      statusRaw: normalizeText(entry.status) || LOGBOOK_EMPTY_VALUE,
      statusCanonical: statusPolicy.canonical,
      statusDisplay: statusPolicy.displayLabel,
      showInTable: statusPolicy.showInTable,
      includeInStats: statusPolicy.includeInStats,
      includeInAirportProgress: statusPolicy.includeInAirportProgress,
      includeInTourEligibility: statusPolicy.includeInTourEligibility,
      includeInAccomplishmentEligibility: statusPolicy.includeInAccomplishmentEligibility,
      simulator: readSimulator(entry),
      landingRate,
      landingRateDisplay: formatSignedAviationNumber(landingRate, "fpm"),
      landingGradeDisplay: formatLandingGrade(landingRate),
      submittedOnDisplay: formatTimestamp(entry.submittedOn),
      disposedOnDisplay: formatTimestamp(entry.disposedOn),
      searchText: [
        compactFlightLabel,
        airlineCode,
        airlineDisplayName,
        readAirportCode(entry.airportD),
        readAirportCode(entry.airportA),
        normalizeText(entry.eqType),
        statusPolicy.displayLabel,
        normalizeText(entry.simulator || entry.sim)
      ]
        .join(" ")
        .toUpperCase(),
      totalFuelPounds: toNumber(entry.totalFuel),
      details: null
    };

    row.details = buildDetailGroups(entry, row);
    rows.push(row);
  });

  return rows;
}

// Maps visible logbook sort keys to stable row values.
export function getLogbookSortValue(row, sortKey) {
  switch (sortKey) {
    case "dateSortKey":
      return row.dateSortKey || 0;
    case "compactFlightLabel":
      return normalizeUpperText(row.compactFlightLabel);
    case "departure":
      return normalizeUpperText(row.departure);
    case "arrival":
      return normalizeUpperText(row.arrival);
    case "equipment":
      return normalizeUpperText(row.equipment);
    case "durationMinutes":
      return row.durationMinutes ?? -1;
    case "distanceNm":
      return row.distanceNm ?? -1;
    case "landingRate":
      return row.landingRate ?? -99999;
    case "statusDisplay":
      return normalizeUpperText(row.statusDisplay);
    default:
      return normalizeUpperText(row[sortKey]);
  }
}
