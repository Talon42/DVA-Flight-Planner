import { DateTime } from "luxon";
import { useCallback, useEffect, useRef, useState } from "react";
import { deriveCallsign, deriveFlightNumber } from "../../domain/flights/flightIdentity";
import {
  buildDvaAircraftOptionsWithCustomAirframes,
  resolveSimBriefDispatchAircraft
} from "../../domain/aircraft/aircraftIdentity.js";
import { buildTourFlightLookupKey } from "../tours/tourIds.model";
import { logSystemError, logSystemEvent } from "../../services/logging/appLog.client.js";
import {
  closeSimBriefDispatchWindow,
  fetchSimBriefAircraftTypes,
  refreshSimBriefDispatch,
  resolveSimBriefAircraftCompatibility,
  startSimBriefDispatch
} from "../../services/tauri/simbrief.client.js";
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

// Returns the dispatch timestamp and SimBrief departure date in UTC.
function deriveSimBriefDepartureDateTimeUtc(flight, useCurrentUtc = false) {
  const fallbackUtc = DateTime.utc().set({ second: 0, millisecond: 0 });
  const scheduleUtc = !useCurrentUtc
    ? DateTime.fromISO(String(flight?.stdUtc || "").trim(), { zone: "utc" })
    : null;

  const departureUtc =
    scheduleUtc?.isValid === true
      ? scheduleUtc.set({ second: 0, millisecond: 0 }).toUTC()
      : fallbackUtc;

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

  const handleStartSimBriefDispatch = useCallback(async () => {
    if (!selectedShortlistFlight) {
      return;
    }

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
    const hasSimBriefPlan = Boolean(
      String(existingSimBriefPlan?.staticId || existingSimBriefPlan?.static_id || "").trim()
    );
    const username = String(simBriefUsername || "").trim();
    const pilotId = String(simBriefPilotId || "").trim();
    if (!username && !pilotId) {
      const message = hasSimBriefPlan
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
      message: hasSimBriefPlan
        ? "Refreshing latest SimBrief flight plan..."
        : "Waiting for SimBrief login and flight plan generation..."
    });
    setPendingMapFlightPathViewMode?.("selected");
    setScheduleView?.("map");
    setExpandedBoardFlightId?.(flightId);
      setStatusMessage?.(
        hasSimBriefPlan ? "Refreshing SimBrief dispatch..." : "Opening SimBrief dispatch..."
      );

    try {
      let simBriefPlan = null;

      if (hasSimBriefPlan) {
        const staticId = String(
          existingSimBriefPlan?.staticId || existingSimBriefPlan?.static_id || ""
        ).trim();
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
          flightId,
          staticId,
          origin: selectedShortlistFlight.from,
          destination: selectedShortlistFlight.to
        });
        simBriefPlan = await refreshSimBriefDispatch({
          flightId,
          staticId,
          username,
          pilotId
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
          simBriefUseCurrentUtcForDispatchTime
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

        await logSystemEvent("SimBrief", "dispatch-requested", {
          flightId,
          dispatchFlightId,
          dispatchFlightIdLength: dispatchFlightId.length,
          originalBoardEntryIdLength: boardEntryId.length,
          origin: selectedShortlistFlight.from,
          destination: selectedShortlistFlight.to,
          aircraftType: dispatchResolution.dispatchType || "",
          selectedAircraft: dispatchResolution.selectedAircraft || "",
          dva: dispatchResolution.dva || "",
          simbrief: dispatchResolution.simbrief || "",
          hasUsername: Boolean(username),
          hasPilotId: Boolean(pilotId),
          departureDate,
          departureTimeUtc,
          useCurrentUtcForDispatchTime: simBriefUseCurrentUtcForDispatchTime
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
        });
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

      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message: hasSimBriefPlan
          ? "SimBrief flight plan refreshed."
          : "SimBrief flight plan loaded."
      });
      setStatusMessage?.(
        hasSimBriefPlan
          ? `SimBrief plan refreshed for ${selectedShortlistFlight.flightCode} ${selectedShortlistFlight.from}-${selectedShortlistFlight.to}.`
          : `SimBrief plan ready for ${selectedShortlistFlight.flightCode} ${selectedShortlistFlight.from}-${selectedShortlistFlight.to}.`
      );
      const pax = simBriefPlan?.pax;
      const hasPax = Number.isInteger(pax) && pax >= 0;
      const simBriefResolution = resolveDraftSimBriefId(simBriefPlan || null);
      await logSystemEvent("SimBrief", hasSimBriefPlan ? "refresh-succeeded" : "dispatch-succeeded", {
        flightId,
        dispatchFlightId,
        dispatchFlightIdLength: dispatchFlightId.length,
        originalBoardEntryIdLength: boardEntryId.length,
        aircraftType:
          (hasSimBriefPlan
            ? normalizedBoardEntry?.simbriefPlan?.aircraftType
            : "") ||
          simBriefPlan?.aircraftType ||
          "",
        cruiseAltitude: simBriefPlan?.cruiseAltitude || "",
        alternate: simBriefPlan?.alternate || "",
        ete: simBriefPlan?.ete || "",
        blockFuel: simBriefPlan?.blockFuel || "",
        hasPdfUrl: Boolean(simBriefPlan?.pdfUrl),
        hasOfpUrl: Boolean(simBriefPlan?.ofpUrl),
        hasOfpXmlId: Boolean(simBriefResolution.simBriefID),
        simBriefIDState: simBriefResolution.simBriefIDState,
        simBriefIDSource: simBriefResolution.simBriefIDSource,
        routePresent: Boolean(simBriefPlan?.route),
        routeLength: simBriefPlan?.route?.length || 0,
        routePoints: Array.isArray(simBriefPlan?.routePoints) ? simBriefPlan.routePoints.length : 0,
        hasPax,
        pax: hasPax ? pax : undefined
      });

      await submitDraftReportForBoardEntry?.(normalizedBoardEntry, {
        boardEntryId: flightId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SimBrief dispatch failed.";
      setSimBriefDispatchState({
        flightId,
        isDispatching: false,
        message
      });
      setStatusMessage?.(message);
      await logSystemError("SimBrief", "dispatch-failed", error, {
        flightId,
        dispatchFlightId,
        dispatchFlightIdLength: dispatchFlightId.length,
        originalBoardEntryIdLength: boardEntryId.length,
        origin: selectedShortlistFlight.from,
        destination: selectedShortlistFlight.to,
        aircraftType: currentBoardEntry?.simbriefPlan?.aircraftType || ""
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
    simBriefPilotId,
    simBriefUsername,
    simBriefUseCurrentUtcForDispatchTime,
    submitDraftReportForBoardEntry,
    tourFlightsByKey
  ]);

  const handleRefreshSimBriefDispatch = useCallback(() => handleStartSimBriefDispatch(), [
    handleStartSimBriefDispatch
  ]);

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
    handleRefreshSimBriefDispatch,
    handleCloseSimBriefDispatch,
    handleFetchSimBriefAircraftTypes
  };
}
