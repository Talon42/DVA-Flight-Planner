import { startTransition, useEffect, useMemo, useState } from "react";
import {
  getAircraftProfileOptions,
  supportsFlightByDutyEquipmentLimits
} from "../../domain/aircraft/aircraftCatalog.js";
import { logAppEvent } from "../../services/logging/appLog.client.js";
import { DEFAULT_FILTERS } from "../schedule/schedule.constants.js";
import { normalizeFilters } from "../schedule/scheduleFilters.model.js";
import { DEFAULT_FLIGHT_BOARD_NAME, MAX_FLIGHT_BOARDS, normalizeFlightBoardName } from "../flightBoard/flightBoard.model.js";
import { buildDutyOriginAirportOptions } from "../../logic/dutySchedule/dutyLocation";
import {
  applyDutyFilterChange,
  normalizeDutyFilters
} from "../../logic/dutySchedule/dutyFilters";
import { getDutyQualifyingAirlines } from "../../logic/dutySchedule/dutyAirlines";
import { prepareDutyScheduleBuild } from "../../logic/dutySchedule/generateDutySchedule";

// Owns the duty schedule build workflow so App.jsx can stay focused on shell orchestration.
export function useDutyScheduleBuilder({
  activeFlightBoardId = "",
  addonAirports = new Set(),
  confirmDutyBoardOverwriteInApp,
  dutyFilters = {},
  filterBounds = { maxBlockMinutes: 0, maxDistanceNm: 0 },
  flightBoards = [],
  replaceFlightBoard,
  schedule = null,
  scheduleFlights = [],
  setDutyFilters,
  setFilters,
  setPendingMapFitToRoute,
  setPendingMapFlightPathViewMode,
  setPlannerControlsCollapsed,
  setPlannerMode,
  setScheduleView,
  setSelectedFlightId,
  setStatusMessage
} = {}) {
  const [dutyBuildWarning, setDutyBuildWarning] = useState(null);

  const normalizedDutyFilters = useMemo(
    () => normalizeDutyFilters(dutyFilters, filterBounds),
    [dutyFilters, filterBounds]
  );
  const dutyEquipmentOptions = useMemo(() => getAircraftProfileOptions(), []);
  const dutyOriginAirportOptions = useMemo(
    () => buildDutyOriginAirportOptions(scheduleFlights, normalizedDutyFilters),
    [normalizedDutyFilters, scheduleFlights]
  );
  const qualifyingDutyAirlines = useMemo(
    () => getDutyQualifyingAirlines(scheduleFlights, normalizedDutyFilters),
    [normalizedDutyFilters, scheduleFlights]
  );

  useEffect(() => {
    const selectedOriginAirport = String(normalizedDutyFilters.selectedOriginAirport || "").trim();
    if (!selectedOriginAirport) {
      return;
    }

    const allowedOrigins = new Set(
      dutyOriginAirportOptions.map((option) => String(option?.icao || "").trim().toUpperCase())
    );
    if (allowedOrigins.has(selectedOriginAirport)) {
      return;
    }

    setDutyFilters?.((current) =>
      String(current.selectedOriginAirport || "").trim().toUpperCase() === selectedOriginAirport
        ? {
            ...current,
            selectedOriginAirport: "",
            resolvedAirline: ""
          }
        : current
    );
  }, [dutyOriginAirportOptions, normalizedDutyFilters.selectedOriginAirport, setDutyFilters]);

  function handleDutyFilterChange(key, value) {
    startTransition(() => {
      setPlannerMode?.("duty");
      setFilters?.(normalizeFilters(DEFAULT_FILTERS, filterBounds));
      setDutyFilters?.((current) =>
        applyDutyFilterChange(current, key, value, {
          scheduleFlights,
          filterBounds
        })
      );
    });
  }

  async function runDutyScheduleBuild({ targetBoardId = "" } = {}) {
    const buildPlan = prepareDutyScheduleBuild({
      scheduleFlights,
      dutyFilters,
      addonAirports,
      qualifyingDutyAirlines,
      hasSchedule: Boolean(schedule),
      supportsFlightByAircraftLimits: supportsFlightByDutyEquipmentLimits,
      rng: Math.random,
      filterBounds
    });

    if (buildPlan.buildWarnings.length) {
      setDutyBuildWarning(buildPlan.buildWarnings);
      return;
    }

    setDutyBuildWarning(null);
    const { effectiveDutyFilters, buildResult, shouldPersistResolvedAirline } = buildPlan;

    if (shouldPersistResolvedAirline) {
      setDutyFilters?.((current) => ({
        ...current,
        resolvedAirline: effectiveDutyFilters.resolvedAirline
      }));
    }

    if (buildResult.status === "failure") {
      setDutyBuildWarning([buildResult.message]);
      setStatusMessage?.(buildResult.message);
      await logAppEvent("duty-schedule-build-failed", {
        requestedFlights: buildResult.requestedCount,
        builtFlights: buildResult.generatedCount,
        buildMode: effectiveDutyFilters.buildMode,
        resultStatus: buildResult.status,
        reasonCodes: buildResult.reasonCodes,
        selectedAirline: String(effectiveDutyFilters.selectedAirline || "").trim(),
        resolvedAirline: String(effectiveDutyFilters.resolvedAirline || "").trim(),
        selectedOriginAirport: String(effectiveDutyFilters.selectedOriginAirport || "").trim().toUpperCase(),
        selectedEquipment: String(effectiveDutyFilters.selectedEquipment || "").trim().toUpperCase(),
        locationKind: effectiveDutyFilters.locationKind,
        selectedCountry: String(effectiveDutyFilters.selectedCountry || "").trim(),
        selectedRegion: String(effectiveDutyFilters.selectedRegion || "").trim().toUpperCase(),
        flightLengthMin: effectiveDutyFilters.flightLengthMin,
        flightLengthMax: effectiveDutyFilters.flightLengthMax,
        distanceMin: effectiveDutyFilters.distanceMin,
        distanceMax: effectiveDutyFilters.distanceMax,
        addonFilterEnabled: effectiveDutyFilters.addonFilterEnabled,
        addonMatchMode: effectiveDutyFilters.addonMatchMode,
        scheduleFlightsLength: scheduleFlights.length,
        candidateFlightsLength: buildPlan.candidateFlights.length,
        locationAirlineSelection: buildPlan.locationAirlineSelection,
        dutyFlightPoolDiagnostics: buildPlan.dutyFlightPoolDiagnostics,
        addonPriorityEnabled: effectiveDutyFilters.addonPriorityEnabled,
        uniqueDestinationsEnabled: effectiveDutyFilters.uniqueDestinationsEnabled,
        timeOrderEnabled: effectiveDutyFilters.timeOrderEnabled,
        dutyTargetMode: effectiveDutyFilters.dutyTargetMode
      });
      return;
    }

    const selectedFlights = buildResult.flights;
    const dutyBoardAirline =
      effectiveDutyFilters.resolvedAirline || effectiveDutyFilters.selectedAirline;
    const dutyBoardName = normalizeFlightBoardName(
      String(dutyBoardAirline || "").trim() || "Duty",
      DEFAULT_FLIGHT_BOARD_NAME
    );

    const updatedBoardId = replaceFlightBoard?.(
      selectedFlights.map((flight) => flight.flightId),
      dutyBoardName,
      targetBoardId ? { targetBoardId } : {}
    );
    if (!updatedBoardId) {
      setDutyBuildWarning(["Unable to update the flight board."]);
      setStatusMessage?.("Unable to update the flight board.");
      return;
    }

    setSelectedFlightId?.(selectedFlights[0]?.flightId || null);
    setPendingMapFlightPathViewMode?.("all");
    setPendingMapFitToRoute?.(true);
    setPlannerMode?.("basic");
    setScheduleView?.("map");
    setPlannerControlsCollapsed?.(true);

    const resolvedAirlineLabel =
      effectiveDutyFilters.resolvedAirline || effectiveDutyFilters.selectedAirline;

    setStatusMessage?.(buildResult.message);

    await logAppEvent("duty-schedule-built", {
      requestedFlights: buildResult.requestedCount,
      builtFlights: selectedFlights.length,
      resultStatus: buildResult.status,
      reasonCodes: buildResult.reasonCodes,
      buildMode: effectiveDutyFilters.buildMode,
      resolvedAirline: resolvedAirlineLabel,
      selectedOriginAirport: effectiveDutyFilters.selectedOriginAirport,
      locationKind: effectiveDutyFilters.locationKind,
      selectedCountry: effectiveDutyFilters.selectedCountry,
      selectedRegion: effectiveDutyFilters.selectedRegion,
      addonPriorityEnabled: effectiveDutyFilters.addonPriorityEnabled,
      uniqueDestinationsEnabled: effectiveDutyFilters.uniqueDestinationsEnabled,
      timeOrderEnabled: effectiveDutyFilters.timeOrderEnabled,
      minTurnMinutes: effectiveDutyFilters.minTurnMinutes,
      dutyTargetMode: effectiveDutyFilters.dutyTargetMode,
      locationAirlineSelection: buildPlan.locationAirlineSelection
    });

    return updatedBoardId;
  }

  async function handleBuildDutySchedule() {
    if (flightBoards.length >= MAX_FLIGHT_BOARDS) {
      const overwriteBoardId = activeFlightBoardId || flightBoards[0]?.id || "";
      if (!overwriteBoardId) {
        return;
      }

      const confirmed = await confirmDutyBoardOverwriteInApp?.();
      if (!confirmed) {
        return;
      }

      await runDutyScheduleBuild({ targetBoardId: overwriteBoardId });
      return;
    }

    await runDutyScheduleBuild();
  }

  function clearDutyBuildWarning() {
    setDutyBuildWarning(null);
  }

  return {
    dutyFilters: normalizedDutyFilters,
    dutyEquipmentOptions,
    dutyOriginAirportOptions,
    qualifyingDutyAirlines,
    dutyBuildWarning,
    clearDutyBuildWarning,
    handleDutyFilterChange,
    handleBuildDutySchedule
  };
}
