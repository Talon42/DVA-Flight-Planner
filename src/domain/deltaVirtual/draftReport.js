import {
  getSelectedAircraftForFlight,
  toDvaEquipmentType,
  toSimBriefAircraftCode
} from "../aircraft/aircraftIdentity.js";

const SIMBRIEF_OFP_ID_PATTERN = /^\d{10}_[A-Za-z0-9]{10}$/;
const SIMBRIEF_XML_STEM_PATTERN = /^[A-Z0-9]+_XML_\d+$/;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizePositiveDraftReportId(value) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function deriveDraftNetwork(flight) {
  const network = normalizeText(flight?.draftNetwork || flight?.network);
  return network === "VATSIM" ? "VATSIM" : "Offline";
}

const DRAFT_PAYLOAD_KEYS = new Set([
  "airline",
  "flight",
  "leg",
  "airportD",
  "airportA",
  "eqType",
  "network",
  "pax",
  "alt",
  "remarks",
  "route",
  "simBriefID",
  "id"
]);

function sanitizeDraftPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => DRAFT_PAYLOAD_KEYS.has(key))
  );
}

function normalizeDraftPassengerCount(pax) {
  if (pax === null || pax === undefined || pax === "") {
    return "";
  }

  if (typeof pax === "number") {
    return Number.isInteger(pax) && pax >= 0 ? pax : "";
  }

  if (typeof pax === "string") {
    const trimmed = pax.trim();
    if (!/^\d+$/.test(trimmed)) {
      return "";
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : "";
  }

  return "";
}

function deriveDraftFlightNumber(flight) {
  const explicitFlightNumber = normalizeText(flight?.flightNumber || flight?.tourFlightNumber);
  if (explicitFlightNumber) {
    const explicitNumeric = Number.parseInt(
      explicitFlightNumber.replace(/\D+$/g, "").match(/\d+/)?.[0] || "",
      10
    );
    if (Number.isFinite(explicitNumeric) && explicitNumeric > 0) {
      return explicitNumeric;
    }
  }

  const flightCode = normalizeText(flight?.flightCode);
  if (!flightCode) {
    return null;
  }

  const stripped = flightCode.replace(/^[^\d]+/, "").replace(/\D+$/, "").trim();
  const numericMatch = stripped.match(/\d+/);
  if (!numericMatch) {
    return null;
  }

  const flightNumber = Number.parseInt(numericMatch[0], 10);
  return Number.isFinite(flightNumber) && flightNumber > 0 ? flightNumber : null;
}

// Resolves the selected aircraft through the identity table without any fuzzy matching.
export function resolveDraftAircraftCompatibility(flight, customAirframes = []) {
  const selectedAircraft = getSelectedAircraftForFlight(flight, customAirframes);
  const dva = toDvaEquipmentType(selectedAircraft);
  const simbrief = toSimBriefAircraftCode(selectedAircraft);
  const isResolved = Boolean(dva);

  return {
    selectedAircraft,
    dva,
    simbrief,
    simbriefCode: simbrief,
    simbriefName: selectedAircraft,
    customAirframe: null,
    resolvedDvaEquipmentType: dva,
    canonicalDvaEquipmentType: dva,
    resolutionSource: isResolved ? "identity" : "unsupported",
    validForDvaDraft: isResolved,
    ok: isResolved,
    reason: isResolved ? "" : "Selected aircraft is not linked to a Delta Virtual equipment type."
  };
}

// Resolves the SimBrief OFP identifier only from a stored XML file id or legacy OFP id.
export function resolveDraftSimBriefId(simbriefPlan) {
  const extractedXmlId = normalizeText(simbriefPlan?.ofpXmlId || simbriefPlan?.dvaSimBriefId).toUpperCase();
  const resolvedXmlId =
    SIMBRIEF_OFP_ID_PATTERN.test(extractedXmlId) || SIMBRIEF_XML_STEM_PATTERN.test(extractedXmlId)
      ? extractedXmlId
      : "";

  if (resolvedXmlId) {
    return {
      simBriefID: resolvedXmlId,
      simBriefIDState: "valid",
      simBriefIDSource: "ofpXmlId"
    };
  }

  return {
    simBriefID: "",
    simBriefIDState: "empty",
    simBriefIDSource: "none"
  };
}

// Builds the Delta Virtual draft report payload using the identity-table DVA equipment code.
export function buildDeltaVirtualDraftReportPayload(
  flight,
  aircraftResolution = null,
  customAirframes = []
) {
  const simbriefPlan = flight?.simbriefPlan || null;
  const id = normalizePositiveDraftReportId(flight?.draftReportId ?? flight?.dvaDraftReportId);
  const { simBriefID } = resolveDraftSimBriefId(simbriefPlan);
  const selectedAircraft =
    normalizeText(aircraftResolution?.selectedAircraft) ||
    getSelectedAircraftForFlight(flight, customAirframes);

  const payload = {
    airline: normalizeText(flight?.airline).toUpperCase(),
    flight: deriveDraftFlightNumber(flight),
    leg: 1,
    airportD: normalizeText(flight?.from).toUpperCase(),
    airportA: normalizeText(flight?.to).toUpperCase(),
    eqType: toDvaEquipmentType(selectedAircraft),
    network: deriveDraftNetwork(flight),
    pax: normalizeDraftPassengerCount(simbriefPlan?.pax),
    alt: normalizeText(simbriefPlan?.cruiseAltitude),
    remarks: "Generated from DVA Flight Planner App",
    route: normalizeText(simbriefPlan?.route),
    simBriefID
  };

  if (id !== null) {
    payload.id = id;
  }

  return sanitizeDraftPayload(payload);
}

// Validates only the draft payload fields that are actually required by the ACARS submit path.
export function validateDeltaVirtualDraftReportPayload(payload, context = {}) {
  void context;
  const sanitizedPayload = sanitizeDraftPayload(payload);
  const errors = [];

  if (!normalizeText(sanitizedPayload?.airline)) {
    errors.push("airline is missing");
  }

  if (!Number.isInteger(sanitizedPayload?.flight) || sanitizedPayload.flight <= 0) {
    errors.push("flight number is missing or invalid");
  }

  if (!normalizeText(sanitizedPayload?.airportD)) {
    errors.push("departure airport is missing");
  }

  if (!normalizeText(sanitizedPayload?.airportA)) {
    errors.push("arrival airport is missing");
  }

  if (!normalizeText(sanitizedPayload?.eqType)) {
    errors.push("Selected aircraft is not linked to a Delta Virtual equipment type.");
  }

  if (!["Offline", "VATSIM"].includes(normalizeText(sanitizedPayload?.network))) {
    errors.push("network must be Offline or VATSIM");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
