import { invokeAppCommand } from "./invoke.client.js";

import {
  buildDeltaVirtualDraftReportPayload,
  resolveDraftAircraftCompatibility,
  validateDeltaVirtualDraftReportPayload
} from "../../domain/deltaVirtual/draftReport.js";

const DRAFT_COMMAND_NAME = "submit_deltava_draft_flight_report";
const DELETE_DRAFT_COMMAND_NAME = "delete_deltava_draft_flight_report";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeDraftSubmitError(message) {
  return normalizeDraftOperationError(
    message,
    "Draft flight report submission failed.",
    "submit_failed"
  );
}

function normalizeDraftOperationError(message, fallbackMessage, fallbackKind = "submit_failed") {
  if (!message) {
    return new Error(fallbackMessage);
  }

  const [kind, ...rest] = String(message).split(":");
  const normalizedMessage = rest.length ? rest.join(":").trim() : String(message);
  const error = new Error(normalizedMessage || fallbackMessage);
  error.kind = rest.length ? kind : fallbackKind;
  return error;
}

function normalizeText(value) {
  return String(value || "").trim();
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

// Submits the resolved draft report payload through the Tauri command.
export async function submitDeltaVirtualDraftReport(flight, options = {}) {
  const debugEnabled = Boolean(options?.debugEnabled);
  const customAirframes = Array.isArray(options?.customAirframes) ? options.customAirframes : [];
  const aircraftResolution = resolveDraftAircraftCompatibility(flight, customAirframes);
  const payload = buildDeltaVirtualDraftReportPayload(flight, aircraftResolution, customAirframes);
  const validation = validateDeltaVirtualDraftReportPayload(payload, {
    selectedSimBriefAircraft: aircraftResolution
  });

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
    const result = await invokeAppCommand(
      DRAFT_COMMAND_NAME,
      { payload, debugEnabled },
      {
        metadata: {
          debugEnabled
        }
      }
    );
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

function normalizeDraftDeleteError(message) {
  return normalizeDraftOperationError(message, "DVA draft deletion failed.", "delete_failed");
}

function normalizeDraftDeleteResult(result) {
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      status: 0,
      contentType: "",
      responseText: "",
      id: null,
      error: "DVA draft deletion failed."
    };
  }

  const normalizedResult = normalizeDraftSubmitResult(result);
  return {
    ...normalizedResult,
    error: normalizedResult.error || (normalizedResult.ok ? null : "DVA draft deletion failed.")
  };
}

// Deletes an existing Delta Virtual draft report through the Tauri command.
export async function deleteDeltaVirtualDraftReport(draftReportId, options = {}) {
  const debugEnabled = Boolean(options?.debugEnabled);
  const normalizedDraftReportId = Number.parseInt(String(draftReportId || "").trim(), 10);

  if (!Number.isInteger(normalizedDraftReportId) || normalizedDraftReportId <= 0) {
    return normalizeDraftDeleteResult({
      ok: false,
      status: 0,
      responseText: "",
      id: null,
      error: "validation_failed: Draft report ID is missing or invalid."
    });
  }

  if (!isTauriRuntime()) {
    return normalizeDraftDeleteResult({
      ok: false,
      status: 0,
      responseText: "",
      id: null,
      error: "DVA draft deletion is only available in the desktop app."
    });
  }

  try {
    const result = await invokeAppCommand(
      DELETE_DRAFT_COMMAND_NAME,
      { draftReportId: normalizedDraftReportId, debugEnabled },
      {
        metadata: {
          debugEnabled,
          draftReportId: normalizedDraftReportId
        }
      }
    );
    return normalizeDraftDeleteResult(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error || "DVA draft deletion failed.");
    return normalizeDraftDeleteResult({
      ok: false,
      status: 0,
      contentType: "",
      responseText: "",
      id: null,
      error: normalizeDraftDeleteError(errorMessage).message
    });
  }
}
