import {
  deriveCallsign,
  deriveFlightNumber
} from "../../domain/flights/flightIdentity";
import { getAircraftDisplayName } from "../../domain/aircraft/aircraftIdentity.js";
import { buildDvaTourCanonicalRowId } from "../tours/tourIds.model";
import { parseTourFlightCode, parseTourRoute } from "../tours/tourParsing.model";

export const MAX_FLIGHT_BOARDS = 4;
export const DEFAULT_FLIGHT_BOARD_NAME = "Board 1";

// Generates a stable-but-unique tab identifier for a newly created flight board.
export function buildFlightBoardTabId() {
  return `flight-board:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeFlightBoardName(value, fallback = DEFAULT_FLIGHT_BOARD_NAME) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || fallback;
}

export function buildBoardEntryId(seed = "") {
  return `board:${seed || "flight"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePositiveDraftReportId(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// Normalizes the draft network selector to the only two supported values.
export function normalizeDraftNetwork(value) {
  return String(value || "").trim() === "VATSIM" ? "VATSIM" : "Offline";
}

function resolveNormalizedAircraftSelection(value) {
  return getAircraftDisplayName(value) || String(value || "").trim();
}

export function createFlightBoard(name = DEFAULT_FLIGHT_BOARD_NAME, entries = []) {
  return {
    id: buildFlightBoardTabId(),
    name: normalizeFlightBoardName(name, DEFAULT_FLIGHT_BOARD_NAME),
    entries: Array.isArray(entries) ? entries : []
  };
}

export function buildBoardEntryFromFlight(flight, overrides = {}) {
  const selectedAircraft = resolveNormalizedAircraftSelection(
    overrides.selectedAircraft ?? flight?.selectedAircraft ?? flight?.simbriefSelectedType ?? ""
  );

  return {
    boardEntryId: overrides.boardEntryId || buildBoardEntryId(flight?.flightId),
    linkedFlightId: String(flight?.flightId || "").trim() || null,
    isStale: Boolean(overrides.isStale),
    isCompleted: Boolean(overrides.isCompleted ?? flight?.isCompleted),
    completedAt: overrides.completedAt ?? flight?.completedAt ?? null,
    completionOrder: Number.isFinite(overrides.completionOrder ?? flight?.completionOrder)
      ? overrides.completionOrder ?? flight?.completionOrder
      : null,
    flightId: String(flight?.flightId || "").trim(),
    flightCode: String(flight?.flightCode || "").trim(),
    flightNumber: deriveFlightNumber(flight),
    airline: String(flight?.airline || "").trim(),
    airlineName: String(flight?.airlineName || "").trim(),
    airlineIcao: String(flight?.airlineIcao || "").trim().toUpperCase(),
    callsign: deriveCallsign(flight),
    from: String(flight?.from || "").trim().toUpperCase(),
    to: String(flight?.to || "").trim().toUpperCase(),
    route: String(flight?.route || `${flight?.from || ""}-${flight?.to || ""}`).trim(),
    fromAirport: String(flight?.fromAirport || "").trim(),
    toAirport: String(flight?.toAirport || "").trim(),
    missingAirportIcaos: Array.isArray(flight?.missingAirportIcaos) ? [...flight.missingAirportIcaos] : [],
    hasMissingAirportData: Boolean(flight?.hasMissingAirportData),
    fromTimezone: String(flight?.fromTimezone || "").trim(),
    toTimezone: String(flight?.toTimezone || "").trim(),
    stdLocal: String(flight?.stdLocal || "").trim(),
    staLocal: String(flight?.staLocal || "").trim(),
    stdUtc: String(flight?.stdUtc || "").trim(),
    staUtc: String(flight?.staUtc || "").trim(),
    localDepartureClock: String(flight?.localDepartureClock || "").trim(),
    utcDepartureClock: String(flight?.utcDepartureClock || "").trim(),
    stdUtcMillis: Number(flight?.stdUtcMillis) || 0,
    staUtcMillis: Number(flight?.staUtcMillis) || 0,
    blockMinutes: Number.isFinite(flight?.blockMinutes) ? flight.blockMinutes : null,
    distanceNm: Number.isFinite(flight?.distanceNm) ? flight.distanceNm : null,
    compatibleEquipment: Array.isArray(flight?.compatibleEquipment)
      ? [...flight.compatibleEquipment]
      : [],
    selectedAircraft,
    simbriefSelectedType: "",
    draftNetwork: normalizeDraftNetwork(
      overrides.draftNetwork ?? flight?.draftNetwork ?? flight?.network
    ),
    draftReportId: normalizePositiveDraftReportId(
      overrides.draftReportId ?? flight?.draftReportId ?? flight?.dvaDraftReportId
    ),
    dvaDraftReportId: normalizePositiveDraftReportId(
      overrides.dvaDraftReportId ?? overrides.draftReportId ?? flight?.draftReportId ?? flight?.dvaDraftReportId
    ),
    simbriefPlan:
      overrides.simbriefPlan !== undefined ? overrides.simbriefPlan : flight?.simbriefPlan ?? null
  };
}

export function buildBoardEntryFromTourFlight(flight, overrides = {}) {
  const parsedRoute = parseTourRoute(flight?.route);
  const parsedFlightCode = parseTourFlightCode(flight?.flightCode || flight?.flight);
  const normalizedFlightNumber = String(
    flight?.tourFlightNumber || parsedFlightCode.flightNumber || flight?.flightNumber || ""
  ).trim();
  const normalizedAirline = String(flight?.airline || parsedFlightCode.airline || "")
    .trim()
    .toUpperCase();
  const normalizedFlightCode =
    normalizedAirline && normalizedFlightNumber
      ? `${normalizedAirline}${normalizedFlightNumber}`
      : String(flight?.flightCode || flight?.flight || "").trim();
  const normalizedAirlineName = String(
    flight?.airlineName || parsedFlightCode.airlineName || normalizedAirline
  ).trim();
  const normalizedAirlineIcao = String(
    flight?.airlineIcao || parsedFlightCode.airlineIcao || ""
  )
    .trim()
    .toUpperCase();
  const normalizedCallsign =
    normalizedFlightNumber && (normalizedAirlineIcao || normalizedAirline)
      ? `${normalizedAirlineIcao || normalizedAirline}${normalizedFlightNumber}`
      : normalizedFlightCode;
  const normalizedFrom = String(flight?.from || parsedRoute.from || "").trim().toUpperCase();
  const normalizedTo = String(flight?.to || parsedRoute.to || "").trim().toUpperCase();
  const normalizedFromAirport = String(
    flight?.fromAirport || flight?.departureName || parsedRoute.fromAirport || ""
  ).trim();
  const normalizedToAirport = String(
    flight?.toAirport || flight?.destinationName || parsedRoute.toAirport || ""
  ).trim();

  const selectedAircraft = resolveNormalizedAircraftSelection(
    overrides.selectedAircraft ?? flight?.selectedAircraft ?? flight?.simbriefSelectedType ?? ""
  );

  return {
    boardEntryId: overrides.boardEntryId || buildBoardEntryId(flight?.flightId),
    linkedFlightId: String(flight?.flightId || "").trim() || null,
    isStale: false,
    isTourFlight: true,
    tourPath: String(flight?.tourPath || "").trim(),
    tourRowId: String(flight?.tourRowId || flight?.flightId || "").trim(),
    tourLabel: String(flight?.tourLabel || flight?.tourName || "").trim(),
    tourName: String(flight?.tourName || flight?.tourLabel || "").trim(),
    tourSourceId: String(flight?.tourSourceId || "").trim(),
    isCompleted: Boolean(overrides.isCompleted ?? flight?.isCompleted),
    completedAt: overrides.completedAt ?? flight?.completedAt ?? null,
    completionOrder: Number.isFinite(overrides.completionOrder ?? flight?.completionOrder)
      ? overrides.completionOrder ?? flight?.completionOrder
      : null,
    flightId: String(flight?.flightId || "").trim(),
    flightCode: normalizedFlightCode,
    flightNumber: normalizedFlightNumber,
    tourFlightNumber: normalizedFlightNumber,
    airline: normalizedAirline,
    airlineName: normalizedAirlineName,
    airlineIcao: normalizedAirlineIcao,
    callsign: normalizedCallsign,
    from: normalizedFrom,
    to: normalizedTo,
    route: String(flight?.route || "").trim(),
    fromAirport: normalizedFromAirport,
    toAirport: normalizedToAirport,
    missingAirportIcaos: [],
    hasMissingAirportData: false,
    fromTimezone: "",
    toTimezone: "",
    stdLocal: "",
    staLocal: "",
    stdUtc: "",
    staUtc: "",
    localDepartureClock: "",
    utcDepartureClock: "",
    stdUtcMillis: 0,
    staUtcMillis: 0,
    blockMinutes: Number.isFinite(flight?.blockMinutes) ? flight.blockMinutes : null,
    blockTimeLabel: String(flight?.blockTimeLabel || "").trim(),
    departureTimeLabel: String(flight?.departureTimeLabel || "").trim(),
    distanceNm: null,
    distanceMi: Number.isFinite(flight?.distanceMi ?? flight?.distance_mi)
      ? flight?.distanceMi ?? flight?.distance_mi
      : null,
    compatibleEquipment: [],
    selectedAircraft,
    simbriefSelectedType: "",
    draftNetwork: normalizeDraftNetwork(
      overrides.draftNetwork ?? flight?.draftNetwork ?? flight?.network
    ),
    draftReportId: normalizePositiveDraftReportId(
      overrides.draftReportId ?? flight?.draftReportId ?? flight?.dvaDraftReportId
    ),
    dvaDraftReportId: normalizePositiveDraftReportId(
      overrides.dvaDraftReportId ?? overrides.draftReportId ?? flight?.draftReportId ?? flight?.dvaDraftReportId
    ),
    simbriefPlan:
      overrides.simbriefPlan !== undefined ? overrides.simbriefPlan : flight?.simbriefPlan ?? null
  };
}

export function normalizeBoardEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const hasLinkedFlightId = Object.prototype.hasOwnProperty.call(entry, "linkedFlightId");
  const normalizedLinkedFlightId = hasLinkedFlightId
    ? String(entry.linkedFlightId || "").trim() || null
    : String(entry.flightId || "").trim() || null;

  const baseEntry = {
    boardEntryId: String(entry.boardEntryId || "").trim() || buildBoardEntryId(entry.flightId),
    linkedFlightId: normalizedLinkedFlightId,
    isStale: Boolean(entry.isStale),
    isTourFlight: Boolean(entry.isTourFlight),
    tourPath: String(entry.tourPath || "").trim(),
    tourRowId: String(entry.tourRowId || normalizedLinkedFlightId || "").trim(),
    tourFlightNumber: String(entry.tourFlightNumber || "").trim(),
    isCompleted: Boolean(entry.isCompleted),
    completedAt: entry.completedAt || null,
    completionOrder: Number.isFinite(entry.completionOrder) ? entry.completionOrder : null,
    flightId: String(entry.flightId || normalizedLinkedFlightId || "").trim(),
    flightCode: String(entry.flightCode || "").trim(),
    flightNumber: deriveFlightNumber(entry),
    airline: String(entry.airline || "").trim(),
    airlineName: String(entry.airlineName || "").trim(),
    airlineIcao: String(entry.airlineIcao || "").trim().toUpperCase(),
    callsign: deriveCallsign(entry),
    from: String(entry.from || "").trim().toUpperCase(),
    to: String(entry.to || "").trim().toUpperCase(),
    route: String(entry.route || `${entry.from || ""}-${entry.to || ""}`).trim(),
    fromAirport: String(entry.fromAirport || "").trim(),
    toAirport: String(entry.toAirport || "").trim(),
    missingAirportIcaos: Array.isArray(entry.missingAirportIcaos) ? [...entry.missingAirportIcaos] : [],
    hasMissingAirportData: Boolean(entry.hasMissingAirportData),
    fromTimezone: String(entry.fromTimezone || "").trim(),
    toTimezone: String(entry.toTimezone || "").trim(),
    stdLocal: String(entry.stdLocal || "").trim(),
    staLocal: String(entry.staLocal || "").trim(),
    stdUtc: String(entry.stdUtc || "").trim(),
    staUtc: String(entry.staUtc || "").trim(),
    localDepartureClock: String(entry.localDepartureClock || "").trim(),
    utcDepartureClock: String(entry.utcDepartureClock || "").trim(),
    stdUtcMillis: Number(entry.stdUtcMillis) || 0,
    staUtcMillis: Number(entry.staUtcMillis) || 0,
    blockMinutes: Number.isFinite(entry.blockMinutes) ? entry.blockMinutes : null,
    blockTimeLabel: String(entry.blockTimeLabel || "").trim(),
    departureTimeLabel: String(entry.departureTimeLabel || "").trim(),
    distanceNm: Number.isFinite(entry.distanceNm) ? entry.distanceNm : null,
    distanceMi: Number.isFinite(entry.distanceMi) ? entry.distanceMi : null,
    compatibleEquipment: Array.isArray(entry.compatibleEquipment) ? [...entry.compatibleEquipment] : [],
    selectedAircraft: resolveNormalizedAircraftSelection(
      entry.selectedAircraft || entry.simbriefSelectedType || ""
    ),
    simbriefSelectedType: "",
    draftNetwork: normalizeDraftNetwork(entry.draftNetwork ?? entry.network),
    draftReportId: normalizePositiveDraftReportId(entry.draftReportId ?? entry.dvaDraftReportId),
    dvaDraftReportId: normalizePositiveDraftReportId(entry.dvaDraftReportId ?? entry.draftReportId),
    simbriefPlan: entry.simbriefPlan || null
  };

  if (baseEntry.isTourFlight && baseEntry.tourPath) {
    const canonicalTourRowId = buildDvaTourCanonicalRowId(baseEntry.tourPath, baseEntry);
    if (canonicalTourRowId) {
      baseEntry.tourRowId = canonicalTourRowId;
      baseEntry.flightId = canonicalTourRowId;
      baseEntry.linkedFlightId = canonicalTourRowId;
    }
  }

  return baseEntry;
}
