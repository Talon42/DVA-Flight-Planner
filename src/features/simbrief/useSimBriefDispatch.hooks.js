import { DateTime } from "luxon";
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveCallsign, deriveFlightNumber } from "../../domain/flights/flightIdentity";
import {
  buildDvaAircraftOptionsWithCustomAirframes,
  resolveSimBriefDispatchAircraft
} from "../../domain/aircraft/aircraftIdentity.js";
import { buildTourFlightLookupKey } from "../tours/tourIds.model";
import {
  createLogRunId,
  logSystemDebug,
  logSystemError,
  logSystemEvent
} from "../../services/logging/appLog.client.js";
import {
  closeSimBriefDispatchWindow,
  fetchSimBriefAircraftTypes,
  refreshSimBriefDispatch,
  resolveSimBriefAircraftCompatibility,
  startSimBriefDispatch
} from "../../services/tauri/simbrief.client.js";
import { normalizeSimBriefDepartureOffsetMinutes } from "../../services/storage/storage.js";
import { resolveDraftSimBriefId } from "../../domain/deltaVirtual/draftReport.js";

function normalizeSimBriefAircraftTypeOption(value) {
  const code = String(value?.code || "").trim().toUpperCase();
  if (!code) {
    return null;
  }

  const name = String(value?.name || "").trim() || code;
  return { code, name };
}

function buildSimBriefAircraftTypeSummary({
  rawTypes,
  normalizedTypes,
  resolvedTypes,
  warning,
  isDevToolsEnabled
}) {
  const duplicateCodeCounts = normalizedTypes.reduce((accumulator, type) => {
    const nextCount = (accumulator.get(type.code) || 0) + 1;
    accumulator.set(type.code, nextCount);
    return accumulator;
  }, new Map());

  const duplicateCodeSample = Array.from(duplicateCodeCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([code]) => code)
    .slice(0, 8);

  const unsupportedTypes = resolvedTypes.filter((type) => !type.validForDvaDraft);
  const summary = {
    source: "live",
    rawTypes: rawTypes.length,
    normalizedTypes: normalizedTypes.length,
    returnedTypes: resolvedTypes.filter((type) => type.validForDvaDraft).length,
    unsupportedTypes: unsupportedTypes.length,
    duplicateCodeCount: Array.from(duplicateCodeCounts.values()).reduce(
      (total, count) => total + Math.max(0, count - 1),
      0
    ),
    duplicateCodeSample
  };

  if (isDevToolsEnabled) {
    summary.unsupportedCodeSample = unsupportedTypes.map((type) => type.code).slice(0, 8);
  }

  const normalizedWarning = String(warning || "").trim();
  if (normalizedWarning) {
    summary.warning = normalizedWarning;
  }

  return summary;
}

// Returns the dispatch timestamp and SimBrief departure date in UTC after applying the offset.
function deriveSimBriefDepartureDateTimeUtc(flight, useCurrentUtc = false, departureOffsetMinutes = 0) {
  const normalizedOffsetMinutes = normalizeSimBriefDepartureOffsetMinutes(departureOffsetMinutes);
  const fallbackUtc = DateTime.utc();
  const scheduleUtc = !useCurrentUtc
    ? DateTime.fromISO(String(flight?.stdUtc || "").trim(), { zone: "utc" })
    : null;

  const startingUtc =
    scheduleUtc?.isValid === true
      ? scheduleUtc.toUTC()
      : fallbackUtc;
  const departureUtc = startingUtc
    .plus({ minutes: normalizedOffsetMinutes })
    .set({ second: 0, millisecond: 0 });

  return {
    departureTimeUtc: departureUtc.toISO(),
    departureDate: departureUtc.toFormat("ddMMMyy").toUpperCase()
  };
}

function normalizeDispatchIdentifierPart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function extractDispatchLeg(value) {
  const match = String(value || "").match(/LEG[-_ ]?(\d+)/i);
  return match ? `L${match[1]}` : "";
}

// Builds a compact SimBrief dispatch seed from real flight fields instead of the board ID.
function buildSimBriefDispatchFlightId(flight, boardEntryId = "") {
  const callsign = normalizeDispatchIdentifierPart(deriveCallsign(flight));
  const airlineCode = normalizeDispatchIdentifierPart(flight?.airlineIcao || flight?.airline);
  const flightNumber = normalizeDispatchIdentifierPart(deriveFlightNumber(flight));
  const origin = normalizeDispatchIdentifierPart(flight?.from);
  const destination = normalizeDispatchIdentifierPart(flight?.to);
  const leg = extractDispatchLeg(flight?.leg || flight?.tourLeg || flight?.tourRowId || "");
  const baseCallsign = callsign || (airlineCode && flightNumber ? `${airlineCode}${flightNumber}` : "");
  const fallbackToken = normalizeDispatchIdentifierPart(boardEntryId);
  const suffix = String(flight?.isTourFlight || flight?.tourRowId ? fallbackToken.slice(-4) : "").trim();

  const segments = [baseCallsign || airlineCode || flightNumber, origin, destination, leg]
    .filter(Boolean)
    .map((segment) => normalizeDispatchIdentifierPart(segment))
    .filter(Boolean);

  let dispatchFlightId = segments.join("_");
  if (!dispatchFlightId) {
    dispatchFlightId = fallbackToken.slice(-12);
  }

  if (suffix && !dispatchFlightId.endsWith(`_${suffix}`)) {
    dispatchFlightId = `${dispatchFlightId}_${suffix}`;
  }

  return dispatchFlightId.replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

// Owns SimBrief dispatch state and the live aircraft-type loader so App.jsx can keep the
// broader board, settings, and hydration workflows separate.
export function useSimBriefDispatch({
  applySimBriefPlanToBoardEntry,
  flightBoard = [],
  isDesktopSimBriefAvailable,
  isDevToolsEnabled,
  selectedShortlistFlight,
  setExpandedBoardFlightId,
  setPendingMapFlightPathViewMode,
  setScheduleView,
  setStatusMessage,
  simBriefCustomAirframes = [],
  simBriefDispatchUnits,
  simBriefDepartureOffsetMinutes = 0,
  simBriefPilotId,
  simBriefUsername,
  simBriefUseCurrentUtcForDispatchTime = false,
  submitDraftReportForBoardEntry,
  tourFlightsByKey = new Map()
} = {}) {
  const [simBriefDispatchState, setSimBriefDispatchState] = useState({
    flightId: "",
    isDispatching: false,
    message: ""
  });
  const [simBriefAircraftTypesState, setSimBriefAircraftTypes] = useState([]);
  const [isSimBriefAircraftTypesLoading, setIsSimBriefAircraftTypesLoading] = useState(false);
  const [simBriefAircraftTypesError, setSimBriefAircraftTypesError] = useState("");
  const loadRequestIdRef = useRef(0);
  const simBriefDispatchOptions = buildDvaAircraftOptionsWithCustomAirframes(
    simBriefCustomAirframes
  );

  const handleCloseSimBriefDispatch = useCallback(() => {
    setSimBriefDispatchState({
      flightId: "",
      isDispatching: false,
      message: ""
    });
  }, []);

  const handleFetchSimBriefAircraftTypes = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setIsSimBriefAircraftTypesLoading(true);

    try {
      const result = await fetchSimBriefAircraftTypes();
      if (loadRequestIdRef.current !== requestId) {
        return result;
      }

      const rawTypes = Array.isArray(result?.types) ? result.types : [];
      const normalizedTypes = rawTypes.map(normalizeSimBriefAircraftTypeOption).filter(Boolean);
      const resolvedTypes = normalizedTypes.map((type) => ({
        ...type,
        ...resolveSimBriefAircraftCompatibility(type)
      }));
      const validTypes = resolvedTypes
        .filter((type) => type.validForDvaDraft)
        .sort((left, right) => left.code.localeCompare(right.code));

      setSimBriefAircraftTypes(validTypes);
      setSimBriefAircraftTypesError(String(result?.warning || "").trim());
      logSystemEvent(
        "SimBrief",
        "aircraft-types-loaded",
        buildSimBriefAircraftTypeSummary({
          rawTypes,
          normalizedTypes,
          resolvedTypes,
          warning: result?.warning,
          isDevToolsEnabled
        })
      ).catch(() => {});
      return result;
    } catch (error) {
      if (loadRequestIdRef.current !== requestId) {
        return null;
      }

      setSimBriefAircraftTypes([]);
      setSimBriefAircraftTypesError(
        error instanceof Error ? error.message : "Unable to load SimBrief aircraft types."
      );
      await logSystemError("SimBrief", "aircraft-types-load-failed", error);
      return null;
    } finally {
      if (loadRequestIdRef.current === requestId) {
        setIsSimBriefAircraftTypesLoading(false);
      }
    }
  }, [isDevToolsEnabled]);

  useEffect(() => {
    if (!isDesktopSimBriefAvailable) {
      loadRequestIdRef.current += 1;
      setSimBriefAircraftTypes([]);
      setSimBriefAircraftTypesError("");
      setIsSimBriefAircraftTypesLoading(false);
      return undefined;
    }

    let idleHandle = null;
    let timeoutHandle = null;

    const scheduleLoad = () => {
      void handleFetchSimBriefAircraftTypes();
    };

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(scheduleLoad, { timeout: 1500 });
    } else {
      timeoutHandle = window.setTimeout(scheduleLoad, 250);
    }

    return () => {
      loadRequestIdRef.current += 1;
      if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [handleFetchSimBriefAircraftTypes, isDesktopSimBriefAvailable]);

  const runSimBriefDispatchWorkflow = useCallback(async ({ forceNewDispatch = false } = {}) => {
    if (!selectedShortlistFlight) {
      return;
    }

    const dispatchRunId = createLogRunId("dispatch");
    const workflowStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const boardEntryId = String(selectedShortlistFlight.boardEntryId || "").trim();
    const dispatchFlight =
      flightBoard.find((entry) => entry.boardEntryId === boardEntryId) || selectedShortlistFlight;
    const dispatchFlightId = buildSimBriefDispatchFlightId(dispatchFlight, boardEntryId);

    if (selectedShortlistFlight.isStale) {
      const message = "Repair this flight board entry before dispatching.";
      setSimBriefDispatchState({
        flightId: boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage?.(message);
      return;
    }

    if (!isDesktopSimBriefAvailable) {
      const message = "SimBrief dispatch is only available in the desktop app.";
      setSimBriefDispatchState({
        flightId: boardEntryId,
        isDispatching: false,
        message
      });
      setStatusMessage?.(message);
      return;
    }

    const flightId = boardEntryId;
    const currentBoardEntry = dispatchFlight;
    const existingSimBriefPlan = currentBoardEntry?.simbriefPlan || null;
    const existingStaticId = String(
      existingSimBriefPlan?.staticId || existingSimBriefPlan?.static_id || ""
    ).trim();
    const hasSimBriefPlan = Boolean(existingStaticId);
    const username = String(simBriefUsername || "").trim();
    const pilotId = String(simBriefPilotId || "").trim();
    const departureOffsetMinutes = normalizeSimBriefDepartureOffsetMinutes(
      simBriefDepartureOffsetMinutes
    );
    const dispatchMode = forceNewDispatch ? "regenerate" : hasSimBriefPlan ? "refresh" : "generate";
    if (!username && !pilotId) {
      const message =
        dispatchMode === "refresh"
          ? "Save a SimBrief Navigraph Alias or Pilot ID before refreshing."
          : "Save a SimBrief Navigraph Alias or Pilot ID before dispatching.";
      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message
      });
      setStatusMessage?.(message);
      return;
    }

    setSimBriefDispatchState({
      flightId,
      isDispatching: true,
      message:
        dispatchMode === "refresh"
          ? "Refreshing latest SimBrief flight plan..."
          : forceNewDispatch
            ? "Regenerating latest SimBrief flight plan..."
            : "Waiting for SimBrief login and flight plan generation..."
    });
    setPendingMapFlightPathViewMode?.("selected");
    setScheduleView?.("map");
    setExpandedBoardFlightId?.(flightId);
    setStatusMessage?.(
      dispatchMode === "refresh"
        ? "Refreshing SimBrief dispatch..."
        : forceNewDispatch
          ? "Regenerating SimBrief dispatch..."
          : "Opening SimBrief dispatch..."
    );

    try {
      let simBriefPlan = null;

      if (!forceNewDispatch && hasSimBriefPlan) {
        const staticId = existingStaticId;
        if (!staticId) {
          const message = "Load a SimBrief plan before refreshing it.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage?.(message);
          return;
        }

        await logSystemEvent("SimBrief", "refresh-requested", {
          dispatchMode,
          dispatchRunId,
          flight: selectedShortlistFlight.flightCode || "",
          route: `${selectedShortlistFlight.from || ""}-${selectedShortlistFlight.to || ""}`,
          aircraft: currentBoardEntry?.simbriefPlan?.aircraftType || "",
          staticId,
          origin: selectedShortlistFlight.from,
          destination: selectedShortlistFlight.to
        });
        await logSystemDebug("SimBrief", "refresh-debug", {
          dispatchRunId,
          boardEntryId,
          dispatchFlightId,
          dispatchFlightIdLength: dispatchFlightId.length,
          originalBoardEntryIdLength: boardEntryId.length,
          previousStaticId: existingStaticId,
          hasUsername: Boolean(username),
          hasPilotId: Boolean(pilotId)
        });
        simBriefPlan = await refreshSimBriefDispatch({
          flightId,
          staticId,
          username,
          pilotId
        }, {
          debugEnabled: isDevToolsEnabled
        });
      } else {
        const dispatchResolution = resolveSimBriefDispatchAircraft(
          currentBoardEntry,
          simBriefCustomAirframes
        );

        if (!dispatchResolution.ok) {
          const message = dispatchResolution.reason || "Unable to resolve the selected aircraft.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message: dispatchResolution.reason ? "" : message
          });
          setStatusMessage?.(message);
          return;
        }

        const sourceTourFlight =
          selectedShortlistFlight.isTourFlight && selectedShortlistFlight.tourRowId
            ? tourFlightsByKey.get(
                buildTourFlightLookupKey(
                  selectedShortlistFlight.tourPath,
                  selectedShortlistFlight.tourRowId
                )
              ) || null
            : null;
        const dispatchFlight = sourceTourFlight || currentBoardEntry || selectedShortlistFlight;
        const flightNumber = deriveFlightNumber(dispatchFlight);
        const callsign = deriveCallsign(dispatchFlight);
        const { departureTimeUtc, departureDate } = deriveSimBriefDepartureDateTimeUtc(
          dispatchFlight,
          simBriefUseCurrentUtcForDispatchTime,
          departureOffsetMinutes
        );

        if (!flightNumber || !callsign || !departureTimeUtc || !departureDate) {
          const message =
            "This flight is missing a dispatchable flight number, callsign, or departure date/time.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage?.(message);
          return;
        }

        await logSystemEvent(
          "SimBrief",
          forceNewDispatch ? "regenerate-requested" : "dispatch-requested",
          {
            dispatchMode,
            dispatchRunId,
            flight: selectedShortlistFlight.flightCode || "",
            route: `${selectedShortlistFlight.from || ""}-${selectedShortlistFlight.to || ""}`,
            aircraft: dispatchResolution.dispatchType || "",
            dispatchFlightId,
            origin: selectedShortlistFlight.from,
            destination: selectedShortlistFlight.to,
            departureDate,
            departureTimeUtc,
            useCurrentUtcForDispatchTime: simBriefUseCurrentUtcForDispatchTime,
            departureOffsetMinutes
          }
        );
        await logSystemDebug("SimBrief", "dispatch-debug", {
          dispatchRunId,
          boardEntryId,
          dispatchFlightIdLength: dispatchFlightId.length,
          originalBoardEntryIdLength: boardEntryId.length,
          previousStaticId: existingStaticId,
          selectedAircraft: dispatchResolution.selectedAircraft || "",
          hasUsername: Boolean(username),
          hasPilotId: Boolean(pilotId),
          routePointCount: Array.isArray(dispatchResolution.routePoints)
            ? dispatchResolution.routePoints.length
            : 0,
          dva: dispatchResolution.dva || "",
          simbrief: dispatchResolution.simbrief || ""
        });

        simBriefPlan = await startSimBriefDispatch({
          flightId: dispatchFlightId,
          airline: selectedShortlistFlight.airline,
          flightNumber,
          callsign,
          origin: selectedShortlistFlight.from,
          destination: selectedShortlistFlight.to,
          aircraftType: dispatchResolution.dispatchType || "",
          units: simBriefDispatchUnits,
          departureTimeUtc,
          departureDate,
          username,
          pilotId
        }, {
          debugEnabled: isDevToolsEnabled
        });
      }

      const returnedStaticId = String(simBriefPlan?.staticId || simBriefPlan?.static_id || "").trim();
      if (forceNewDispatch) {
        if (!returnedStaticId) {
          const message = "SimBrief regenerated the dispatch, but no new plan ID was returned.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage?.(message);
          await logSystemError(
            "SimBrief",
            "regenerate-failed",
            new Error("SimBrief regenerated the dispatch, but no new plan ID was returned."),
            {
              dispatchMode,
              dispatchRunId,
              flight: selectedShortlistFlight.flightCode || "",
              route: `${selectedShortlistFlight.from || ""}-${selectedShortlistFlight.to || ""}`,
              aircraft: currentBoardEntry?.simbriefPlan?.aircraftType || "",
              stage: "regenerate-plan",
              durationMs: Math.max(
                0,
                Math.round(
                  (typeof performance !== "undefined" ? performance.now() : Date.now()) -
                    workflowStartedAt
                )
              )
            }
          );
          return;
        }

        if (existingStaticId && returnedStaticId === existingStaticId) {
          const message =
            "SimBrief regenerated the dispatch, but the new plan ID matched the previous one.";
          setSimBriefDispatchState({
            flightId,
            isDispatching: false,
            message
          });
          setStatusMessage?.(message);
          await logSystemError(
            "SimBrief",
            "regenerate-failed",
            new Error("SimBrief returned the same static ID during regeneration."),
            {
              dispatchMode,
              dispatchRunId,
              flight: selectedShortlistFlight.flightCode || "",
              route: `${selectedShortlistFlight.from || ""}-${selectedShortlistFlight.to || ""}`,
              aircraft: currentBoardEntry?.simbriefPlan?.aircraftType || "",
              stage: "regenerate-unchanged",
              durationMs: Math.max(
                0,
                Math.round(
                  (typeof performance !== "undefined" ? performance.now() : Date.now()) -
                    workflowStartedAt
                )
              )
            }
          );
          return;
        }
      }

      const normalizedBoardEntry = applySimBriefPlanToBoardEntry?.(flightId, simBriefPlan);
      if (!normalizedBoardEntry) {
        const message = "Unable to normalize the SimBrief dispatch result.";
        setSimBriefDispatchState({
          flightId,
          isDispatching: false,
          message
        });
        setStatusMessage?.(message);
        return;
      }

      const matchedBoardEntry =
        flightBoard.find((entry) => entry.boardEntryId === boardEntryId) || null;
      const beforeStaticId = String(
        matchedBoardEntry?.simbriefPlan?.staticId || matchedBoardEntry?.simbriefPlan?.static_id || ""
      ).trim();
      const afterStaticId = String(
        normalizedBoardEntry?.simbriefPlan?.staticId ||
          normalizedBoardEntry?.simbriefPlan?.static_id ||
          ""
      ).trim();
      await logSystemDebug("SimBrief", "dispatch-board-cache-update", {
        dispatchRunId,
        requestedBoardEntryId: boardEntryId,
        returnedStaticId,
        matchedBoardEntry: Boolean(matchedBoardEntry),
        beforeStaticId,
        afterStaticId
      });
      if (!matchedBoardEntry) {
        await logSystemError(
          "SimBrief",
          "dispatch-board-cache-missed",
          new Error("SimBrief board entry was not found for cache persistence."),
          {
            dispatchRunId,
            requestedBoardEntryId: boardEntryId,
            returnedStaticId
          }
        );
      }

      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message:
          dispatchMode === "refresh"
            ? "SimBrief flight plan refreshed."
            : forceNewDispatch
              ? "SimBrief flight plan regenerated."
              : "SimBrief flight plan loaded."
      });
      setStatusMessage?.(
        dispatchMode === "refresh"
          ? `SimBrief plan refreshed for ${selectedShortlistFlight.flightCode} ${selectedShortlistFlight.from}-${selectedShortlistFlight.to}.`
          : forceNewDispatch
            ? `SimBrief dispatch regenerated for ${selectedShortlistFlight.flightCode} ${selectedShortlistFlight.from}-${selectedShortlistFlight.to}.`
            : `SimBrief plan ready for ${selectedShortlistFlight.flightCode} ${selectedShortlistFlight.from}-${selectedShortlistFlight.to}.`
      );
      const durationMs = Math.max(
        0,
        Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - workflowStartedAt
        )
      );
      const pax = simBriefPlan?.pax;
      const hasPax = Number.isInteger(pax) && pax >= 0;
      const simBriefResolution = resolveDraftSimBriefId(simBriefPlan || null);
      const normalizedDraftReportId = Number.parseInt(
        String(normalizedBoardEntry?.draftReportId ?? normalizedBoardEntry?.dvaDraftReportId ?? ""),
        10
      );
      const hasDraftReportId = Number.isInteger(normalizedDraftReportId) && normalizedDraftReportId > 0;
      await logSystemEvent(
        "SimBrief",
        forceNewDispatch
          ? "regenerate-succeeded"
          : dispatchMode === "refresh"
            ? "refresh-succeeded"
            : "dispatch-succeeded",
        {
          dispatchMode,
          dispatchRunId,
          flight: selectedShortlistFlight.flightCode || "",
          route: `${selectedShortlistFlight.from || ""}-${selectedShortlistFlight.to || ""}`,
          dispatchFlightId,
          newStaticId: returnedStaticId,
          cruiseAltitude: simBriefPlan?.cruiseAltitude || "",
          alternate: simBriefPlan?.alternate || "",
          ete: simBriefPlan?.ete || "",
          blockFuel: simBriefPlan?.blockFuel || "",
          hasOfpXmlId: Boolean(simBriefResolution.simBriefID),
          hasPax,
          pax: hasPax ? pax : undefined,
          hasDraftReportId,
          durationMs
        }
      );
      await logSystemDebug("SimBrief", "dispatch-result-debug", {
        dispatchRunId,
        boardEntryId,
        dispatchFlightIdLength: dispatchFlightId.length,
        originalBoardEntryIdLength: boardEntryId.length,
        previousStaticId: existingStaticId,
        selectedAircraft: currentBoardEntry?.simbriefPlan?.aircraftType || "",
        hasUsername: Boolean(username),
        hasPilotId: Boolean(pilotId),
        routePointCount: Array.isArray(simBriefPlan?.routePoints) ? simBriefPlan.routePoints.length : 0,
        routeLength: simBriefPlan?.route?.length || 0,
        hasPdfUrl: Boolean(simBriefPlan?.pdfUrl),
        hasOfpUrl: Boolean(simBriefPlan?.ofpUrl),
        simBriefIDState: simBriefResolution.simBriefIDState,
        simBriefIDSource: simBriefResolution.simBriefIDSource
      });

      await submitDraftReportForBoardEntry?.(normalizedBoardEntry, {
        boardEntryId: flightId,
        clearDraftDeleteLock: forceNewDispatch
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SimBrief dispatch failed.";
      const durationMs = Math.max(
        0,
        Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - workflowStartedAt
        )
      );
      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message
      });
      setStatusMessage?.(message);
      await logSystemError("SimBrief", "dispatch-failed", error, {
        dispatchRunId,
        dispatchMode,
        flight: selectedShortlistFlight.flightCode || "",
        route: `${selectedShortlistFlight.from || ""}-${selectedShortlistFlight.to || ""}`,
        aircraft: currentBoardEntry?.simbriefPlan?.aircraftType || "",
        stage: "dispatch",
        durationMs
      });
    } finally {
      setPendingMapFlightPathViewMode?.(null);
      await closeSimBriefDispatchWindow();
    }
  }, [
    applySimBriefPlanToBoardEntry,
    flightBoard,
    isDesktopSimBriefAvailable,
    selectedShortlistFlight,
    setExpandedBoardFlightId,
    setPendingMapFlightPathViewMode,
    setScheduleView,
    setStatusMessage,
    simBriefCustomAirframes,
    simBriefDispatchUnits,
    simBriefDepartureOffsetMinutes,
    simBriefPilotId,
    simBriefUsername,
    simBriefUseCurrentUtcForDispatchTime,
    submitDraftReportForBoardEntry,
    tourFlightsByKey
  ]);

  const handleStartSimBriefDispatch = useCallback(
    () => runSimBriefDispatchWorkflow(),
    [runSimBriefDispatchWorkflow]
  );

  const handleRegenerateSimBriefDispatch = useCallback(
    () => runSimBriefDispatchWorkflow({ forceNewDispatch: true }),
    [runSimBriefDispatchWorkflow]
  );

  const handleRefreshSimBriefDispatch = useCallback(
    () => runSimBriefDispatchWorkflow(),
    [runSimBriefDispatchWorkflow]
  );

  return {
    simBriefDispatchState,
    setSimBriefDispatchState,
    simBriefAircraftTypes: simBriefAircraftTypesState,
    setSimBriefAircraftTypes,
    isSimBriefAircraftTypesLoading,
    setIsSimBriefAircraftTypesLoading,
    simBriefAircraftTypesError,
    setSimBriefAircraftTypesError,
    simBriefDispatchOptions,
    handleStartSimBriefDispatch,
    handleRegenerateSimBriefDispatch,
    handleRefreshSimBriefDispatch,
    handleCloseSimBriefDispatch,
    handleFetchSimBriefAircraftTypes
  };
}
