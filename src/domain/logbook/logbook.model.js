import { DateTime } from "luxon";
import { getAirlineNameByCode } from "../airlines/airlineBranding.js";

const EMPTY_VALUE = "—";

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
    return EMPTY_VALUE;
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
    return EMPTY_VALUE;
  }

  return DateTime.fromObject({
    year: parts.year,
    month: parts.month,
    day: parts.day
  }).toFormat("MM/dd/yyyy");
}

function buildDateSortKey(entry) {
  const parts = extractDateParts(entry);
  if (!parts) {
    return 0;
  }

  return parts.year * 10_000 + parts.month * 100 + parts.day;
}

function parseDurationMinutes(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d+:\d{2}(:\d{2})?$/.test(trimmed)) {
      const parts = trimmed.split(":").map((part) => Number(part));
      if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
      }

      return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
    }
  }

  const numeric = toNumber(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  if (numeric >= 100_000) {
    return Math.round(numeric / 60_000);
  }

  if (numeric >= 1_000) {
    return Math.round(numeric / 60);
  }

  return Math.round(numeric);
}

function formatMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return EMPTY_VALUE;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatAviationNumber(value, unit, options = {}) {
  if (!Number.isFinite(value)) {
    return EMPTY_VALUE;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0
  });
  return `${formatter.format(value)} ${unit}`.trim();
}

function formatSignedAviationNumber(value, unit, options = {}) {
  if (!Number.isFinite(value)) {
    return EMPTY_VALUE;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    signDisplay: "always"
  });
  return `${formatter.format(value)} ${unit}`.replace("+", "");
}

function readAirportCode(airport) {
  if (airport && typeof airport === "object") {
    return normalizeUpperText(airport.icao || airport.iata || airport.code) || "";
  }

  return normalizeUpperText(airport);
}

function readAirportDisplay(airport) {
  if (!airport || typeof airport !== "object") {
    return EMPTY_VALUE;
  }

  const icao = normalizeUpperText(airport.icao);
  const iata = normalizeUpperText(airport.iata);
  const name = normalizeText(airport.name);
  return [icao || null, iata || null, name || null].filter(Boolean).join(" / ") || EMPTY_VALUE;
}

function normalizeStatus(value) {
  const rawStatus = normalizeUpperText(value);
  if (rawStatus === "OK") {
    return "Approved";
  }

  if (rawStatus === "REJECTED") {
    return "Rejected";
  }

  if (rawStatus === "SUBMITTED" || rawStatus === "PENDING") {
    return "Pending";
  }

  return normalizeText(value) || EMPTY_VALUE;
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

  return normalizeText(entry?.flightCode) || EMPTY_VALUE;
}

function buildDetailItem(label, value, options = {}) {
  const normalizedValue = typeof value === "string" ? value.trim() : value;
  if (!options.showEmpty && (normalizedValue === EMPTY_VALUE || normalizedValue === "" || normalizedValue === null)) {
    return null;
  }

  return { label, value: normalizedValue || EMPTY_VALUE };
}

function buildDetailGroups(entry, normalizedRow) {
  return {
    flightSummary: [
      buildDetailItem("Logbook ID", normalizedRow.rawLogbookId || EMPTY_VALUE, { showEmpty: true }),
      buildDetailItem("Airline + Flight", normalizedRow.compactFlightLabel, { showEmpty: true }),
      buildDetailItem("Airline", normalizedRow.airlineDisplayName, { showEmpty: true }),
      buildDetailItem("Leg", normalizeText(entry.leg) || EMPTY_VALUE, { showEmpty: true }),
      buildDetailItem("Status", normalizedRow.statusDisplay, { showEmpty: true }),
      buildDetailItem("Raw Status", normalizeText(entry.status) || EMPTY_VALUE),
      buildDetailItem("Submitted On", formatTimestamp(entry.submittedOn)),
      buildDetailItem("Approved / Disposed On", formatTimestamp(entry.disposedOn)),
      buildDetailItem("Simulator", normalizedRow.simulator, { showEmpty: true }),
      buildDetailItem("FDR Source", normalizeText(entry.fdrSource || entry.fdr) || EMPTY_VALUE),
      buildDetailItem("On-time Result", normalizeText(entry.onTimeResult || entry.onTime) || EMPTY_VALUE)
    ].filter(Boolean),
    aircraft: [
      buildDetailItem("Equipment", normalizedRow.equipment, { showEmpty: true }),
      buildDetailItem("Aircraft Name", normalizeText(entry?.aircraft?.name) || EMPTY_VALUE),
      buildDetailItem("Aircraft ICAO", normalizeUpperText(entry?.aircraft?.icao) || EMPTY_VALUE),
      buildDetailItem("Tail Code", normalizeUpperText(entry.tailCode || entry.tailNumber) || EMPTY_VALUE),
      buildDetailItem("AC Code", normalizeUpperText(entry.acCode || entry.aircraftCode) || EMPTY_VALUE)
    ].filter(Boolean),
    times: [
      buildDetailItem("Start Time", formatTimestamp(entry.startTime)),
      buildDetailItem("Taxi Time", formatTimestamp(entry.taxiTime)),
      buildDetailItem("Takeoff Time", formatTimestamp(entry?.takeoff?.time || entry.takeoffTime)),
      buildDetailItem("Landing Time", formatTimestamp(entry?.landing?.time || entry.landingTime)),
      buildDetailItem("End Time", formatTimestamp(entry?.end?.time || entry.endTime)),
      buildDetailItem("Duration", normalizedRow.durationDisplay, { showEmpty: true }),
      buildDetailItem("Block Time", formatMinutes(parseDurationMinutes(entry.blockTime))),
      buildDetailItem("Airborne Time", formatMinutes(parseDurationMinutes(entry.airborneTime)))
    ].filter(Boolean),
    performance: [
      buildDetailItem("Distance", normalizedRow.distanceDisplay, { showEmpty: true }),
      buildDetailItem("Total Fuel", formatAviationNumber(toNumber(entry.totalFuel), "lb")),
      buildDetailItem("Takeoff Fuel", formatAviationNumber(toNumber(entry.takeoffFuel), "lb")),
      buildDetailItem("Takeoff Weight", formatAviationNumber(toNumber(entry.takeoffWeight), "lb")),
      buildDetailItem("Takeoff Speed", formatAviationNumber(toNumber(entry.takeoffSpeed), "kt")),
      buildDetailItem("Landing Fuel", formatAviationNumber(toNumber(entry.landingFuel), "lb")),
      buildDetailItem("Landing Weight", formatAviationNumber(toNumber(entry.landingWeight), "lb")),
      buildDetailItem("Landing Speed", formatAviationNumber(toNumber(entry.landingSpeed), "kt")),
      buildDetailItem("Landing Vertical Speed", formatSignedAviationNumber(toNumber(entry?.landing?.vSpeed), "fpm")),
      buildDetailItem("Landing G-force", formatAviationNumber(toNumber(entry?.landing?.gForce), "g", { maximumFractionDigits: 3 })),
      buildDetailItem("Average Frame Rate", formatAviationNumber(toNumber(entry.avgFrameRate), "FPS", { maximumFractionDigits: 1 }))
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

    const rawLogbookId = normalizeText(entry.logbookId ?? entry.id);
    const compactFlightLabel = buildCompactFlightLabel(entry);
    const airlineCode = normalizeUpperText(entry.airline || entry.airlineCode || entry.airlineIata);
    const airlineDisplayName = getAirlineNameByCode(airlineCode) || airlineCode || EMPTY_VALUE;
    const durationMinutes = parseDurationMinutes(entry.duration) ?? parseDurationMinutes(entry.blockTime);
    const airborneMinutes = parseDurationMinutes(entry.airborneTime);
    const distanceNm = toNumber(entry.distance);
    const landingRate = toNumber(entry?.landing?.vSpeed);
    const row = {
      id: rawLogbookId || `logbook-row-${sourceIndex}`,
      rawLogbookId: rawLogbookId || null,
      sourceIndex,
      rawEntry: entry,
      dateDisplay: formatDvaDate(entry),
      dateSortKey: buildDateSortKey(entry),
      compactFlightLabel,
      airlineCode: airlineCode || EMPTY_VALUE,
      airlineDisplayName,
      origin: readAirportCode(entry.airportD) || EMPTY_VALUE,
      destination: readAirportCode(entry.airportA) || EMPTY_VALUE,
      equipment:
        normalizeText(entry.eqType || entry?.aircraft?.icao || entry?.aircraft?.name) || EMPTY_VALUE,
      durationMinutes,
      durationDisplay: formatMinutes(durationMinutes),
      airborneMinutes,
      airborneDisplay: formatMinutes(airborneMinutes),
      distanceNm,
      distanceDisplay: formatAviationNumber(distanceNm, "nm"),
      statusRaw: normalizeText(entry.status) || EMPTY_VALUE,
      statusDisplay: normalizeStatus(entry.status),
      simulator: normalizeText(entry.simulator) || EMPTY_VALUE,
      landingRate,
      landingRateDisplay: formatSignedAviationNumber(landingRate, "fpm"),
      submittedOnDisplay: formatTimestamp(entry.submittedOn),
      disposedOnDisplay: formatTimestamp(entry.disposedOn),
      searchText: [
        compactFlightLabel,
        airlineCode,
        airlineDisplayName,
        readAirportCode(entry.airportD),
        readAirportCode(entry.airportA),
        normalizeText(entry.eqType),
        normalizeStatus(entry.status)
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
    case "origin":
      return normalizeUpperText(row.origin);
    case "destination":
      return normalizeUpperText(row.destination);
    case "equipment":
      return normalizeUpperText(row.equipment);
    case "durationMinutes":
      return row.durationMinutes ?? -1;
    case "distanceNm":
      return row.distanceNm ?? -1;
    case "statusDisplay":
      return normalizeUpperText(row.statusDisplay);
    default:
      return normalizeUpperText(row[sortKey]);
  }
}
