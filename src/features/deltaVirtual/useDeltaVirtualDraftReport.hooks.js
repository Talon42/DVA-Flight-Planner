import { useCallback, useRef, useState } from "react";
import {
  buildDeltaVirtualDraftReportPayload,
  resolveDraftAircraftCompatibility,
  validateDeltaVirtualDraftReportPayload
} from "../../domain/deltaVirtual/draftReport.js";
import {
  createLogRunId,
  logSystemDebug,
  logSystemError,
  logSystemEvent
} from "../../services/logging/appLog.client.js";
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
      const draftRunId = createLogRunId("draft");
      const draftStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

      let currentBoardEntry;
      let draftAircraftResolution;
      let draftPayload;
      let draftValidation;
      let simBriefPlan;
      let hasDraftReportId;

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
              draftRunId,
              stage: "lookup"
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
        hasDraftReportId = normalizePositiveDraftReportId(draftPayload.id) !== null;
        await logSystemDebug("DVA Draft", "submit-debug-before", {
          draftRunId,
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
          draftRunId,
          flight: currentBoardEntry.flightCode || "",
          route: `${currentBoardEntry.from || ""}-${currentBoardEntry.to || ""}`,
          eqType: draftPayload.eqType || "",
          hasDraftReportId
        });

        const result = await submitDeltaVirtualDraftReport(currentBoardEntry, {
          debugEnabled: isDevToolsEnabled,
          customAirframes: simBriefCustomAirframes
        });
        await logSystemDebug("DVA Draft", "submit-debug-after", {
          draftRunId,
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
        const durationMs = Math.max(
          0,
          Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - draftStartedAt)
        );
        setDeltaDraftSubmitState({
          boardEntryId: normalizedBoardEntryId,
          isSubmitting: false,
          error: resultErrorMessage,
          result
        });

        if (result.ok) {
          const returnedId = normalizePositiveDraftReportId(result.id);
          const returnedIdPresent = returnedId !== null;
          const matchedBoardEntry =
            flightBoard.find((entry) => entry.boardEntryId === normalizedBoardEntryId) || null;
          const beforeDraftReportId = normalizePositiveDraftReportId(
            matchedBoardEntry?.draftReportId ?? matchedBoardEntry?.dvaDraftReportId
          );
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
            await logSystemDebug("DVA Draft", "submit-board-cache-update", {
              draftRunId,
              requestedBoardEntryId: normalizedBoardEntryId,
              returnedDraftReportId: returnedId,
              matchedBoardEntry: Boolean(matchedBoardEntry),
              beforeDraftReportId,
              afterDraftReportId: returnedId,
              afterDvaDraftReportId: returnedId,
              draftDeleteRequiresRegenerate: clearDraftDeleteLock
                ? false
                : Boolean(matchedBoardEntry?.draftDeleteRequiresRegenerate)
            });
            if (!matchedBoardEntry) {
              await logSystemError(
                "DVA Draft",
                "submit-board-cache-missed",
                new Error("Draft board entry was not found for cache persistence."),
                {
                  draftRunId,
                  requestedBoardEntryId: normalizedBoardEntryId,
                  returnedDraftReportId: returnedId
                }
              );
            }
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
          await logSystemEvent("DVA Draft", "submit-succeeded", {
            draftRunId,
            flight: currentBoardEntry.flightCode || "",
            route: `${currentBoardEntry.from || ""}-${currentBoardEntry.to || ""}`,
            eqType: draftPayload.eqType || "",
            hasDraftReportId,
            draftReportId: returnedIdPresent ? returnedId : null,
            status: result.status,
            contentType: result.contentType || "",
            durationMs
          });
          await logSystemDebug("DVA Draft", "submit-result-debug", {
            draftRunId,
            boardEntryId: normalizedBoardEntryId,
            returnedIdPresent,
            resultId: result?.id ?? null,
            resultDraftReportId: result?.draftReportId ?? null,
            resultError: result?.error ?? "",
            resultMessage: result?.message ?? ""
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
          draftRunId,
          flight: currentBoardEntry.flightCode || "",
          route: `${currentBoardEntry.from || ""}-${currentBoardEntry.to || ""}`,
          eqType: draftPayload.eqType || "",
          status: result.status,
          contentType: result.contentType || "",
          returnedIdPresent: Boolean(result.id),
          message: result.error || failureMessage,
          stage: "submit",
          durationMs
        });
        return result;
      } catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        const durationMs = Math.max(
          0,
          Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - draftStartedAt)
        );
        await logSystemDebug("DVA Draft", "submit-debug-after-threw", {
          draftRunId,
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
          draftRunId,
          flight: currentBoardEntry?.flightCode || "",
          route: `${currentBoardEntry?.from || ""}-${currentBoardEntry?.to || ""}`,
          eqType: draftPayload?.eqType || "",
          status: 0,
          contentType: "",
          returnedIdPresent: false,
          message: statusMessage,
          stage: "submit",
          durationMs
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

      const draftRunId = createLogRunId("draft");
      const draftStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
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
          draftRunId,
          stage: "lookup"
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
          draftRunId,
          flight: currentBoardEntry.flightCode || "",
          route: `${currentBoardEntry.from || ""}-${currentBoardEntry.to || ""}`,
          draftReportId: draftReportId,
          stage: "validation"
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
      await logSystemEvent("DVA Draft", "delete-requested", {
        draftRunId,
        flight: currentBoardEntry.flightCode || "",
        route: `${currentBoardEntry.from || ""}-${currentBoardEntry.to || ""}`,
        draftReportId
      });

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
            draftRunId,
            flight: currentBoardEntry.flightCode || "",
            route: `${currentBoardEntry.from || ""}-${currentBoardEntry.to || ""}`,
            draftReportId,
            status: result.status,
            contentType: result.contentType || "",
            durationMs: Math.max(
              0,
              Math.round(
                (typeof performance !== "undefined" ? performance.now() : Date.now()) -
                  draftStartedAt
              )
            )
          });
          return result;
        }

        setStatusMessage?.(resultErrorMessage);
        await logSystemError("DVA Draft", "delete-failed", new Error(result.error || resultErrorMessage), {
          draftRunId,
          flight: currentBoardEntry.flightCode || "",
          route: `${currentBoardEntry.from || ""}-${currentBoardEntry.to || ""}`,
          draftReportId,
          status: result.status,
          contentType: result.contentType || "",
          message: result.error || resultErrorMessage,
          stage: "delete",
          durationMs: Math.max(
            0,
            Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - draftStartedAt)
          )
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
          draftRunId,
          flight: currentBoardEntry.flightCode || "",
          route: `${currentBoardEntry.from || ""}-${currentBoardEntry.to || ""}`,
          draftReportId,
          status: 0,
          contentType: "",
          message: statusMessage,
          stage: "delete",
          durationMs: Math.max(
            0,
            Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - draftStartedAt)
          )
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
