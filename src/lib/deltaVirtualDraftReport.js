import equipmentTypeData from "../data/equipment_type.json";
import { resolveSimBriefFallbackEquipmentTypeCandidates } from "./simbrief";

const DRAFT_COMMAND_NAME = "submit_deltava_draft_flight_report";
const SIMBRIEF_OFP_ID_PATTERN = /^\d{10}_[A-Za-z0-9]{10}$/;
const SIMBRIEF_XML_STEM_PATTERN = /^[A-Z0-9]+_XML_\d+$/;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeDraftSubmitError(message) {
  if (!message) {
    return new Error("Draft flight report submission failed.");
  }

  const [kind, ...rest] = String(message).split(":");
  const normalizedMessage = rest.length ? rest.join(":").trim() : String(message);
  const error = new Error(normalizedMessage || "Draft flight report submission failed.");
  error.kind = rest.length ? kind : "submit_failed";
  return error;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEquipmentTypeKey(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function unwrapEquipmentTypeRows(source) {
  if (Array.isArray(source)) {
    return source;
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  for (const key of ["equipmentTypes", "equipment_type", "rows", "data", "items", "values"]) {
    if (Array.isArray(source[key])) {
      return source[key];
    }
  }

  return [source];
}

function normalizeEquipmentTypeValue(row) {
  if (Array.isArray(row)) {
    const parts = row.map(normalizeText).filter(Boolean);
    if (!parts.length) {
      return "";
    }

    const firstPart = normalizeText(row[0]);
    return firstPart ? parts.join("A") : `A${parts.join("A")}`;
  }

  if (row && typeof row === "object") {
    for (const key of ["eq_type", "eqType", "equipment_type", "equipmentType", "code", "value"]) {
      const normalized = normalizeText(row[key]);
      if (normalized) {
        return normalized;
      }
    }
  }

  return normalizeText(row);
}

const equipmentTypes = unwrapEquipmentTypeRows(equipmentTypeData)
  .map((row) => normalizeEquipmentTypeValue(row))
  .filter(Boolean);

const equipmentTypeEntries = equipmentTypes.map((equipmentType, index) => ({
  equipmentType,
  index,
  key: normalizeEquipmentTypeKey(equipmentType)
}));

const equipmentTypeByKey = new Map(
  equipmentTypeEntries.map(({ key, equipmentType }) => [key, equipmentType])
);

function normalizeSimBriefAircraftLabel(value) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Snaps detailed SimBrief variants like A319-100 to the nearest equipment label.
function resolveClosestEquipmentTypeFromSimBriefAircraft(selectedType) {
  const normalizedSelectedType = normalizeSimBriefAircraftLabel(selectedType);
  if (!normalizedSelectedType) {
    return "";
  }

  const exactEquipmentType = equipmentTypeByKey.get(normalizedSelectedType);
  if (exactEquipmentType) {
    return exactEquipmentType;
  }

  const prefixMatches = equipmentTypeEntries
    .filter(({ key }) => key && normalizedSelectedType.startsWith(key))
    .sort((left, right) => right.key.length - left.key.length || left.index - right.index);

  if (prefixMatches.length) {
    return prefixMatches[0].equipmentType;
  }

  const containedMatches = equipmentTypeEntries
    .filter(({ key }) => key && key.startsWith(normalizedSelectedType))
    .sort((left, right) => left.key.length - right.key.length || left.index - right.index);

  return containedMatches[0]?.equipmentType || "";
}

function resolveEquipmentTypeFromSimBrief(selectedType) {
  const normalizedSelectedType = normalizeEquipmentTypeKey(selectedType);
  if (!normalizedSelectedType) {
    return "";
  }

  const exactEquipmentType = equipmentTypeByKey.get(normalizedSelectedType);
  if (exactEquipmentType) {
    return exactEquipmentType;
  }

  const candidateMatches = resolveSimBriefFallbackEquipmentTypeCandidates(selectedType)
    .map((candidate) => equipmentTypeByKey.get(normalizeEquipmentTypeKey(candidate)))
    .filter(Boolean);

  if (candidateMatches.length) {
    return candidateMatches[0];
  }

  return resolveClosestEquipmentTypeFromSimBriefAircraft(selectedType);
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

function isValidSimBriefAircraftCode(value) {
  const normalized = normalizeText(value).toUpperCase();
  return Boolean(normalized) && !/[\/\s]/.test(normalized);
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

function deriveDraftEquipmentType(flight) {
  const selectedType = normalizeText(flight?.simbriefSelectedType).toUpperCase();
  if (!isValidSimBriefAircraftCode(selectedType)) {
    return "";
  }

  const resolvedType = resolveEquipmentTypeFromSimBrief(selectedType);
  if (resolvedType) {
    return resolvedType;
  }

  return selectedType;
}

function normalizePositiveDraftReportId(value) {
  const parsed = Number.parseInt(normalizeText(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

function extractDraftResponseMessage(responseText) {
  const text = normalizeText(responseText);
  if (!text) {
    return "";
  }

  const messageMatch = text.match(/<p><b>Message<\/b>\s*([^<]+)<\/p>/i);
  if (messageMatch?.[1]) {
    return normalizeText(messageMatch[1]);
  }

  const invalidIdMatch = text.match(/Invalid Flight Report ID - \d+/i);
  if (invalidIdMatch?.[0]) {
    return normalizeText(invalidIdMatch[0]);
  }

  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDraftSubmitResult(result) {
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      status: 0,
      contentType: "",
      responseText: "",
      id: null,
      error: "Draft flight report submission failed."
    };
  }

  const status = Number(result.status);
  const rawId = result.id;
  const responseText = normalizeText(result.responseText);
  const parsedId = Number(rawId);
  const id =
    rawId === null || rawId === undefined || normalizeText(rawId) === ""
      ? null
      : Number.isFinite(parsedId) && parsedId > 0
        ? parsedId
        : null;

  return {
    ok: Boolean(result.ok),
    status: Number.isFinite(status) ? status : 0,
    contentType: normalizeText(result.contentType),
    responseText,
    id,
    error:
      extractDraftResponseMessage(responseText) ||
      (result.error ? normalizeText(result.error) : null)
  };
}

export function buildDeltaVirtualDraftReportPayload(flight) {
  const simbriefPlan = flight?.simbriefPlan || null;
  const id = normalizePositiveDraftReportId(flight?.draftReportId ?? flight?.dvaDraftReportId);
  const { simBriefID } = resolveDraftSimBriefId(simbriefPlan);

  const payload = {
    airline: normalizeText(flight?.airline).toUpperCase(),
    flight: deriveDraftFlightNumber(flight),
    leg: 1,
    airportD: normalizeText(flight?.from).toUpperCase(),
    airportA: normalizeText(flight?.to).toUpperCase(),
    eqType: deriveDraftEquipmentType(flight),
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

export function validateDeltaVirtualDraftReportPayload(payload) {
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
    errors.push("equipment type is missing");
  }

  if (!["Offline", "VATSIM"].includes(normalizeText(sanitizedPayload?.network))) {
    errors.push("network must be Offline or VATSIM");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export async function submitDeltaVirtualDraftReport(flight, options = {}) {
  const debugEnabled = Boolean(options?.debugEnabled);
  const payload = sanitizeDraftPayload(buildDeltaVirtualDraftReportPayload(flight));
  const validation = validateDeltaVirtualDraftReportPayload(payload);

  if (!validation.valid) {
    return normalizeDraftSubmitResult({
      ok: false,
      status: 0,
      responseText: "",
      id: null,
      error: `validation_failed: ${validation.errors.join("; ")}`
    });
  }

  if (!isTauriRuntime()) {
    return normalizeDraftSubmitResult({
      ok: false,
      status: 0,
      responseText: "",
      id: null,
      error: "Draft flight report submission is only available in the desktop app."
    });
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke(DRAFT_COMMAND_NAME, { payload, debugEnabled });
    return normalizeDraftSubmitResult(result);
  } catch (error) {
    if (error instanceof Error) {
      return normalizeDraftSubmitResult({
        ok: false,
        status: 0,
        contentType: "",
        responseText: "",
        id: null,
        error: normalizeDraftSubmitError(error.message).message
      });
    }

    return normalizeDraftSubmitResult({
      ok: false,
      status: 0,
      contentType: "",
      responseText: "",
      id: null,
      error: normalizeDraftSubmitError(String(error)).message
    });
  }
}
