import { useCallback, useRef, useState } from "react";
import {
  buildDeltaVirtualDraftReportPayload,
  resolveDraftAircraftCompatibility,
  resolveDraftSimBriefId,
  validateDeltaVirtualDraftReportPayload
} from "../../domain/deltaVirtual/draftReport.js";
import { logSystemError, logSystemEvent } from "../../services/logging/appLog.client.js";
import {
  deleteDeltaVirtualDraftReport,
  submitDeltaVirtualDraftReport
} from "../../services/tauri/deltaVirtualDraftReport.client.js";
import { normalizeBoardEntry, normalizePositiveDraftReportId } from "../flightBoard/flightBoard.model.js";

function buildDraftReportUrl(reportId) {
  const normalizedReportId = normalizePositiveDraftReportId(reportId);
  return normalizedReportId !== null
    ? `https://www.deltava.org/pirep.do?id=0x${Number(normalizedReportId).toString(16)}`
    : "";
}

function getDraftFailureMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.startsWith("validation_failed:")) {
    return message.replace(/^validation_failed:\s*/, "");
  }
  return message.startsWith("session_required:")
    ? message.replace(/^session_required:\s*/, "")
    : "Unable to send draft flight report to ACARS.";
}

function getDraftDeleteFailureMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.startsWith("validation_failed:")) {
    return message.replace(/^validation_failed:\s*/, "");
  }

  return message.startsWith("session_required:")
    ? message.replace(/^session_required:\s*/, "")
    : "Unable to delete the DVA draft flight report.";
}

// Owns the Delta Virtual draft-report submission state so App.jsx can keep the flight-board
// and SimBrief workflows separate.
export function useDeltaVirtualDraftReport({
  flightBoard = [],
  isDevToolsEnabled,
  simBriefCustomAirframes = [],
  setStatusMessage,
  updateActiveFlightBoardEntries
} = {}) {
  const [deltaDraftSubmitState, setDeltaDraftSubmitState] = useState({
    boardEntryId: "",
    isSubmitting: false,
    error: "",
    result: null
  });
  const [deltaDraftDeleteState, setDeltaDraftDeleteState] = useState({
    boardEntryId: "",
    isDeleting: false,
    error: "",
    result: null
  });
  const [deltaDraftReportUrlState, setDeltaDraftReportUrlState] = useState({
    boardEntryId: "",
    url: ""
  });
  const isDraftSubmittingRef = useRef(false);

  const handleClearDeltaVirtualDraftReportState = useCallback(() => {
    setDeltaDraftSubmitState({
      boardEntryId: "",
      isSubmitting: false,
      error: "",
      result: null
    });
    setDeltaDraftDeleteState({
      boardEntryId: "",
      isDeleting: false,
      error: "",
      result: null
    });
    setDeltaDraftReportUrlState({
      boardEntryId: "",
      url: ""
    });
  }, []);

  const handleCloseDeltaVirtualDraftReport = useCallback(() => {
    setDeltaDraftReportUrlState({
      boardEntryId: "",
      url: ""
    });
  }, []);

  const handleOpenDeltaVirtualDraftReport = useCallback((boardEntryId, url = "") => {
    const normalizedBoardEntryId = String(boardEntryId || "").trim();
    setDeltaDraftReportUrlState({
      boardEntryId: normalizedBoardEntryId,
      url: String(url || "").trim()
    });
  }, []);

  const handleSubmitDeltaVirtualDraftReport = useCallback(
    async (boardEntryOrId, { boardEntryId, clearDraftDeleteLock = false } = {}) => {
      const normalizedBoardEntryId = String(
        boardEntryId ||
          (typeof boardEntryOrId === "string" ? boardEntryOrId : boardEntryOrId?.boardEntryId || "")
      ).trim();
      const requestedBoardEntry =
        typeof boardEntryOrId === "string" ? null : boardEntryOrId || null;
      if (!normalizedBoardEntryId || isDraftSubmittingRef.current) {
        return;
      }

      // Use the ref as the correctness guard so rapid clicks cannot race React state updates.
      isDraftSubmittingRef.current = true;

      let currentBoardEntry;
      let draftAircraftResolution;
      let draftPayload;
      let draftValidation;
      let simBriefPlan;
      let simBriefResolution;
      let hasDraftReportId;
      let draftLogData;

      try {
        currentBoardEntry =
          normalizeBoardEntry(requestedBoardEntry) ||
          flightBoard.find((entry) => entry.boardEntryId === normalizedBoardEntryId) ||
          null;
        if (!currentBoardEntry) {
          const message = "Unable to send draft flight report to ACARS.";
          setDeltaDraftSubmitState({
            boardEntryId: normalizedBoardEntryId,
            isSubmitting: false,
            error: "Draft flight board entry was not found.",
            result: null
          });
          setStatusMessage?.(message);
          await logSystemError(
            "DVA Draft",
            "submit-failed",
            new Error("Draft flight board entry was not found."),
            {
              boardEntryId: normalizedBoardEntryId
            }
          );
          return;
        }

        draftAircraftResolution = resolveDraftAircraftCompatibility(
          currentBoardEntry,
          simBriefCustomAirframes
        );
        draftPayload = buildDeltaVirtualDraftReportPayload(
          currentBoardEntry,
          draftAircraftResolution,
          simBriefCustomAirframes
        );
        draftValidation = validateDeltaVirtualDraftReportPayload(draftPayload, {
          selectedSimBriefAircraft: draftAircraftResolution
        });
        simBriefPlan = currentBoardEntry?.simbriefPlan || null;
        simBriefResolution = resolveDraftSimBriefId(currentBoardEntry?.simbriefPlan || null);
        hasDraftReportId = normalizePositiveDraftReportId(draftPayload.id) !== null;
        draftLogData = {
          boardEntryId: normalizedBoardEntryId,
          flight: currentBoardEntry.flightCode,
          airportD: currentBoardEntry.from,
          airportA: currentBoardEntry.to,
          simbriefCode: draftAircraftResolution.simbriefCode,
          simbriefName: draftAircraftResolution.simbriefName,
          resolvedDvaEquipmentType: draftAircraftResolution.resolvedDvaEquipmentType,
          resolutionSource: draftAircraftResolution.resolutionSource,
          validForDvaDraft: draftAircraftResolution.validForDvaDraft,
          eqType: draftPayload.eqType,
          hasDraftReportId,
          hasOfpXmlId: Boolean(simBriefResolution.simBriefID),
          simBriefIDState: simBriefResolution.simBriefIDState,
          simBriefIDSource: simBriefResolution.simBriefIDSource
        };
        await logSystemEvent("DVA Draft", "submit-diagnostics-before", {
          boardEntryId: normalizedBoardEntryId,
          flightId: currentBoardEntry.flightId || "",
          flightCode: currentBoardEntry.flightCode || "",
          callsign: currentBoardEntry.callsign || "",
          airline: currentBoardEntry.airline || "",
          flightNumber: currentBoardEntry.flightNumber || "",
          origin: currentBoardEntry.from || "",
          destination: currentBoardEntry.to || "",
          eqType: draftPayload.eqType || "",
          simBriefID: draftPayload.simBriefID || "",
          validationErrors: draftValidation.errors || [],
          simBriefPlanKeys: Object.keys(simBriefPlan || {}),
          hasStaticId: Boolean(simBriefPlan?.staticId),
          hasStatic_id: Boolean(simBriefPlan?.static_id),
          hasOfpXmlId: Boolean(simBriefPlan?.ofpXmlId),
          hasOfp_xml_id: Boolean(simBriefPlan?.ofp_xml_id),
          hasDvaSimBriefId: Boolean(simBriefPlan?.dvaSimBriefId),
          hasSimBriefID: Boolean(simBriefPlan?.simBriefID),
          hasSimBriefId: Boolean(simBriefPlan?.simBriefId),
          hasSimbriefId: Boolean(simBriefPlan?.simbriefId),
          hasXml: Boolean(simBriefPlan?.xml),
          hasXmlData: Boolean(simBriefPlan?.xmlData)
        });

        setDeltaDraftSubmitState({
          boardEntryId: normalizedBoardEntryId,
          isSubmitting: true,
          error: "",
          result: null
        });
        setDeltaDraftReportUrlState({
          boardEntryId: normalizedBoardEntryId,
          url: ""
        });
        setStatusMessage?.(
          hasDraftReportId ? "Updating Draft Flight Report..." : "Generating Draft Flight Report..."
        );
        await logSystemEvent("DVA Draft", "submit-requested", {
          ...draftLogData
        });

        const result = await submitDeltaVirtualDraftReport(currentBoardEntry, {
          debugEnabled: isDevToolsEnabled,
          customAirframes: simBriefCustomAirframes
        });
        await logSystemEvent("DVA Draft", "submit-diagnostics-after", {
          boardEntryId: normalizedBoardEntryId,
          resultKeys: Object.keys(result || {}),
          resultOk: Boolean(result?.ok),
          resultSuccess: Boolean(result?.success),
          resultId: result?.id ?? null,
          resultDraftReportId: result?.draftReportId ?? null,
          resultError: result?.error ?? "",
          resultMessage: result?.message ?? "",
          resultStatus: result?.status ?? null,
          resultContentType: result?.contentType ?? ""
        });
        const resultErrorMessage = result.ok ? "" : getDraftFailureMessage(result.error);
        setDeltaDraftSubmitState({
          boardEntryId: normalizedBoardEntryId,
          isSubmitting: false,
          error: resultErrorMessage,
          result
        });

        if (result.ok) {
          const returnedId = normalizePositiveDraftReportId(result.id);
          const returnedIdPresent = returnedId !== null;
          if (returnedIdPresent) {
            const draftReportUrl = buildDraftReportUrl(returnedId);
            setDeltaDraftReportUrlState({
              boardEntryId: normalizedBoardEntryId,
              url: draftReportUrl
            });
            updateActiveFlightBoardEntries?.((currentEntries) =>
              currentEntries.map((entry) =>
                entry.boardEntryId === normalizedBoardEntryId
                  ? {
                      ...entry,
                      draftReportId: returnedId,
                      dvaDraftReportId: returnedId,
                      draftDeleteRequiresRegenerate: clearDraftDeleteLock
                        ? false
                        : Boolean(entry.draftDeleteRequiresRegenerate)
                    }
                  : entry
              )
            );
          } else {
            setDeltaDraftReportUrlState({
              boardEntryId: normalizedBoardEntryId,
              url: ""
            });
          }

          const successMessage = hasDraftReportId
            ? "Draft Flight Report Updated."
            : "Draft Flight Report Created.";
          setStatusMessage?.(successMessage);
          await logSystemEvent("DVA Draft", hasDraftReportId ? "draft-id-reused" : "draft-id-stored", {
            ...draftLogData,
            returnedIdPresent,
            status: result.status,
            contentType: result.contentType || ""
          });
          await logSystemEvent("DVA Draft", "submit-succeeded", {
            ...draftLogData,
            status: result.status,
            contentType: result.contentType || "",
            returnedIdPresent
          });
          return result;
        }

        const failureMessage = getDraftFailureMessage(result.error);
        setDeltaDraftReportUrlState({
          boardEntryId: normalizedBoardEntryId,
          url: ""
        });
        setStatusMessage?.(failureMessage);
        await logSystemError("DVA Draft", "submit-failed", new Error(result.error || failureMessage), {
          ...draftLogData,
          status: result.status,
          contentType: result.contentType || "",
          returnedIdPresent: Boolean(result.id),
          message: result.error || failureMessage
        });
        return result;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        await logSystemError("DVA Draft", "submit-diagnostics-after-threw", normalizedError, {
          boardEntryId: normalizedBoardEntryId,
          flightId: currentBoardEntry?.flightId || "",
          origin: currentBoardEntry?.from || "",
          destination: currentBoardEntry?.to || "",
          eqType: draftPayload?.eqType || "",
          simBriefID: draftPayload?.simBriefID || "",
          validationErrors: draftValidation?.errors || [],
          simBriefPlanKeys: Object.keys(simBriefPlan || {})
        });
        const statusMessage = getDraftFailureMessage(normalizedError);
        setDeltaDraftSubmitState({
          boardEntryId: normalizedBoardEntryId,
          isSubmitting: false,
          error: statusMessage,
          result: null
        });
        setDeltaDraftReportUrlState({
          boardEntryId: normalizedBoardEntryId,
          url: ""
        });
        setStatusMessage?.(statusMessage);
        await logSystemError("DVA Draft", "submit-failed", normalizedError, {
          ...draftLogData,
          status: 0,
          contentType: "",
          returnedIdPresent: false,
          message: statusMessage
        });
        return null;
      } finally {
        isDraftSubmittingRef.current = false;
        setDeltaDraftSubmitState((current) =>
          current.boardEntryId === normalizedBoardEntryId
            ? { ...current, isSubmitting: false }
            : current
        );
      }
    },
    [ 
      flightBoard,
      isDevToolsEnabled,
      setStatusMessage,
      simBriefCustomAirframes,
      updateActiveFlightBoardEntries
    ]
  );

  const handleDeleteDeltaVirtualDraftReport = useCallback(
    async (boardEntryOrId, { boardEntryId } = {}) => {
      const normalizedBoardEntryId = String(
        boardEntryId ||
          (typeof boardEntryOrId === "string" ? boardEntryOrId : boardEntryOrId?.boardEntryId || "")
      ).trim();
      const requestedBoardEntry =
        typeof boardEntryOrId === "string" ? null : boardEntryOrId || null;
      if (!normalizedBoardEntryId) {
        return null;
      }

      const currentBoardEntry =
        normalizeBoardEntry(requestedBoardEntry) ||
        flightBoard.find((entry) => entry.boardEntryId === normalizedBoardEntryId) ||
        null;
      if (!currentBoardEntry) {
        const message = "Draft flight board entry was not found.";
        setDeltaDraftDeleteState({
          boardEntryId: normalizedBoardEntryId,
          isDeleting: false,
          error: message,
          result: null
        });
        setStatusMessage?.(message);
        await logSystemError("DVA Draft", "delete-failed", new Error(message), {
          boardEntryId: normalizedBoardEntryId
        });
        return null;
      }

      const draftReportId = normalizePositiveDraftReportId(
        currentBoardEntry.draftReportId ?? currentBoardEntry.dvaDraftReportId
      );
      if (draftReportId === null) {
        const message = "No DVA draft report ID is available for this flight.";
        setDeltaDraftDeleteState({
          boardEntryId: normalizedBoardEntryId,
          isDeleting: false,
          error: message,
          result: null
        });
        setStatusMessage?.(message);
        await logSystemError("DVA Draft", "delete-failed", new Error(message), {
          boardEntryId: normalizedBoardEntryId
        });
        return null;
      }

      setDeltaDraftDeleteState({
        boardEntryId: normalizedBoardEntryId,
        isDeleting: true,
        error: "",
        result: null
      });
      setStatusMessage?.("Deleting DVA Draft...");

      try {
        const result = await deleteDeltaVirtualDraftReport(draftReportId, {
          debugEnabled: isDevToolsEnabled
        });
        const resultErrorMessage = result.ok ? "" : getDraftDeleteFailureMessage(result.error);

        setDeltaDraftDeleteState({
          boardEntryId: normalizedBoardEntryId,
          isDeleting: false,
          error: resultErrorMessage,
          result
        });

        if (result.ok) {
          updateActiveFlightBoardEntries?.((currentEntries) =>
            currentEntries.map((entry) =>
              entry.boardEntryId === normalizedBoardEntryId
                ? {
                    ...entry,
                    draftReportId: null,
                    dvaDraftReportId: null,
                    draftDeleteRequiresRegenerate: true
                  }
                : entry
            )
          );
          setDeltaDraftReportUrlState({
            boardEntryId: normalizedBoardEntryId,
            url: ""
          });
          setStatusMessage?.("DVA Draft Deleted.");
          await logSystemEvent("DVA Draft", "delete-succeeded", {
            boardEntryId: normalizedBoardEntryId,
            draftReportId,
            status: result.status,
            contentType: result.contentType || ""
          });
          return result;
        }

        setStatusMessage?.(resultErrorMessage);
        await logSystemError("DVA Draft", "delete-failed", new Error(result.error || resultErrorMessage), {
          boardEntryId: normalizedBoardEntryId,
          draftReportId,
          status: result.status,
          contentType: result.contentType || "",
          message: result.error || resultErrorMessage
        });
        return result;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        const statusMessage = getDraftDeleteFailureMessage(normalizedError);
        setDeltaDraftDeleteState({
          boardEntryId: normalizedBoardEntryId,
          isDeleting: false,
          error: statusMessage,
          result: null
        });
        setStatusMessage?.(statusMessage);
        await logSystemError("DVA Draft", "delete-failed", normalizedError, {
          boardEntryId: normalizedBoardEntryId,
          draftReportId,
          status: 0,
          contentType: "",
          message: statusMessage
        });
        return null;
      } finally {
        setDeltaDraftDeleteState((current) =>
          current.boardEntryId === normalizedBoardEntryId
            ? { ...current, isDeleting: false }
            : current
        );
      }
    },
    [flightBoard, isDevToolsEnabled, setStatusMessage, updateActiveFlightBoardEntries]
  );

  return {
    deltaDraftSubmitState,
    setDeltaDraftSubmitState,
    deltaDraftDeleteState,
    setDeltaDraftDeleteState,
    deltaDraftReportUrlState,
    setDeltaDraftReportUrlState,
    handleSubmitDeltaVirtualDraftReport,
    handleDeleteDeltaVirtualDraftReport,
    handleOpenDeltaVirtualDraftReport,
    handleCloseDeltaVirtualDraftReport,
    handleClearDeltaVirtualDraftReportState
  };
}
