import { startTransition, useEffect, useMemo } from "react";
import accomplishmentsData from "../../data/accomplishments/accomplishments.json";
import { ACCOMPLISHMENT_REQUIREMENTS, buildAccomplishmentRows, normalizeAccomplishments } from "../accomplishments/accomplishments.model.js";
import { DEFAULT_FILTERS } from "../schedule/schedule.constants.js";
import { buildFilterBounds, normalizeFilters } from "../schedule/scheduleFilters.model.js";
import { buildDefaultDutyFilters, buildRangeDefaults } from "../../logic/dutySchedule/dutyFilters.js";
import { logAppEvent } from "../../services/logging/appLog.client.js";
import { buildTourFlightLookupKey, normalizeDvaTourId } from "./tourIds.model.js";
import { mergeTourProgressSources } from "./tourProgress.selectors.js";
import { selectAvailableTours } from "./tours.selectors.js";

const ACCOMPLISHMENTS = normalizeAccomplishments(accomplishmentsData);

// Keeps tour and accomplishment selection state synchronized with cache and logbook data.
export function useTourSelection({
  deltaVirtualToursCache = null,
  derivedTourProgress = null,
  isDevToolsEnabled = false,
  logbookAirportProgress = null,
  scheduleView = "flights",
  scheduleFlights = [],
  selectedAccomplishmentName = "",
  selectedTourPath = "",
  setDutyFilters,
  setFilterUiVersion,
  setFilters,
  setPlannerMode,
  setScheduleView,
  setSelectedAccomplishmentName,
  setSelectedFlightId,
  setSelectedTourPath,
  setSelectedTourRowId,
  tourProgress = {}
} = {}) {
  const activeFilterBounds = useMemo(
    () => buildFilterBounds(scheduleFlights),
    [scheduleFlights]
  );
  const resolvedTourProgress = useMemo(
    () => mergeTourProgressSources(tourProgress, derivedTourProgress?.tourProgress || {}),
    [derivedTourProgress, tourProgress]
  );

  const availableTours = useMemo(
    () => selectAvailableTours({ deltaVirtualToursCache, resolvedTourProgress }),
    [deltaVirtualToursCache, resolvedTourProgress]
  );

  const selectedTour = useMemo(() => {
    if (!availableTours.length) {
      return null;
    }

    return availableTours.find((tour) => tour.selectionId === selectedTourPath) || availableTours[0];
  }, [availableTours, selectedTourPath]);

  useEffect(() => {
    if (!isDevToolsEnabled || !selectedTour) {
      return;
    }

    const normalizedTourKey = selectedTour.selectionId || selectedTourPath || "";
    const visibleRows = Array.isArray(selectedTour.rows) ? selectedTour.rows : [];
    const manualRows = tourProgress?.[normalizedTourKey]?.rows || {};
    const derivedRows = derivedTourProgress?.tourProgress?.[normalizedTourKey]?.rows || {};
    const mergedRows = resolvedTourProgress?.[normalizedTourKey]?.rows || {};

    logAppEvent("tour-selection-updated", {
      selectedTourName: selectedTour.name || selectedTour.label || "",
      selectedTourNormalizedId: String(selectedTour.id || "").trim(),
      selectedTourRawPath: String(selectedTour.path || "").trim(),
      selectedTourRawSourceId: String(selectedTour.sourceId || "").trim(),
      normalizedTourKey,
      visibleRowCount: visibleRows.length,
      derivedRowsCount: Object.keys(derivedRows).length,
      manualRowsCount: Object.keys(manualRows).length,
      mergedCompletedCount: visibleRows.filter((row) => Boolean(row?.isCompleted)).length,
      mergedRowCount: Object.keys(mergedRows).length
    }).catch(() => {});
  }, [
    derivedTourProgress,
    isDevToolsEnabled,
    resolvedTourProgress,
    selectedTour,
    selectedTourPath,
    tourProgress
  ]);

  const selectedAccomplishment = useMemo(() => {
    if (!ACCOMPLISHMENTS.length) {
      return null;
    }

    return (
      ACCOMPLISHMENTS.find(
        (accomplishment) => accomplishment.name === selectedAccomplishmentName
      ) || ACCOMPLISHMENTS[0]
    );
  }, [selectedAccomplishmentName]);

  const accomplishmentOptions = useMemo(
    () =>
      ACCOMPLISHMENTS.map((accomplishment) => {
        const rows = buildAccomplishmentRows(accomplishment, logbookAirportProgress);
        const totalCount = rows.length;
        const completedCount = rows.reduce((count, row) => count + (row.isCompleted ? 1 : 0), 0);

        return {
          ...accomplishment,
          totalCount,
          completedCount,
          isCompleted: totalCount > 0 && completedCount === totalCount
        };
      }),
    [logbookAirportProgress]
  );

  const accomplishmentRows = useMemo(
    () => buildAccomplishmentRows(selectedAccomplishment, logbookAirportProgress),
    [logbookAirportProgress, selectedAccomplishment]
  );

  const tourRows = useMemo(() => selectedTour?.rows || [], [selectedTour]);
  const activeTourRows = tourRows;
  const tourFlightsByKey = useMemo(
    () =>
      new Map(
        availableTours.flatMap((tour) =>
          tour.rows.map((row) => [buildTourFlightLookupKey(row.tourPath, row.tourRowId), row])
        )
      ),
    [availableTours]
  );
  const sortedTourRows = useMemo(() => {
    const incompleteRows = [];
    const completedRows = [];

    for (const row of activeTourRows) {
      if (row.isCompleted) {
        completedRows.push(row);
      } else {
        incompleteRows.push(row);
      }
    }

    incompleteRows.sort((left, right) => (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0));
    completedRows.sort(
      (left, right) =>
        (left.completionOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.completionOrder ?? Number.MAX_SAFE_INTEGER) ||
        (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0)
    );

    return [...incompleteRows, ...completedRows];
  }, [activeTourRows]);

  useEffect(() => {
    if (!availableTours.length) {
      if (selectedTourPath) {
        setSelectedTourPath("");
      }
      return;
    }

    if (!selectedTourPath || !availableTours.some((tour) => tour.selectionId === selectedTourPath)) {
      setSelectedTourPath(availableTours[0].selectionId);
    }
  }, [availableTours, scheduleView, selectedTourPath, setSelectedTourPath]);

  useEffect(() => {
    if (!ACCOMPLISHMENTS.length) {
      if (scheduleView === "accomplishments") {
        setScheduleView("flights");
      }
      if (selectedAccomplishmentName) {
        setSelectedAccomplishmentName("");
      }
      return;
    }

    if (
      !selectedAccomplishmentName ||
      !ACCOMPLISHMENTS.some((accomplishment) => accomplishment.name === selectedAccomplishmentName)
    ) {
      setSelectedAccomplishmentName(ACCOMPLISHMENTS[0].name);
    }
  }, [scheduleView, selectedAccomplishmentName, setScheduleView, setSelectedAccomplishmentName]);

  useEffect(() => {
    if (scheduleView !== "tours") {
      return;
    }

    setSelectedTourRowId((current) =>
      selectedTour?.rows.some((row) => row.tourRowId === current)
        ? current
        : selectedTour?.rows[0]?.tourRowId || null
    );
  }, [scheduleView, selectedTour, setSelectedTourRowId]);

  function handleSelectTourPath(nextTourSelectionId) {
    const nextSelectionId = normalizeDvaTourId(nextTourSelectionId);
    const clickedTour = availableTours.find((tour) => tour.selectionId === nextSelectionId) || null;

    if (isDevToolsEnabled) {
      logAppEvent("tour-selection-changed", {
        clickedTourId: clickedTour?.selectionId || nextSelectionId,
        clickedTourName: clickedTour?.label || clickedTour?.name || "",
        previousSelectedId: selectedTourPath || "",
        nextSelectedId: nextSelectionId
      }).catch(() => {});
    }

    setSelectedTourPath(nextSelectionId);
  }

  function handleShowAccomplishmentFlights(airport, requirement) {
    const normalizedAirport = String(airport || "").trim().toUpperCase();
    if (!normalizedAirport) {
      return;
    }

    const filterKey =
      String(requirement || "").trim().toLowerCase() === ACCOMPLISHMENT_REQUIREMENTS.ARRIVAL_AIRPORTS
        ? "destination"
        : "originOrDestination";
    const nextFilters = normalizeFilters(
      {
        ...DEFAULT_FILTERS,
        ...buildRangeDefaults(activeFilterBounds),
        [filterKey]: [normalizedAirport]
      },
      activeFilterBounds
    );

    startTransition(() => {
      setScheduleView("flights");
      setPlannerMode("basic");
      setFilters(nextFilters);
      setDutyFilters(buildDefaultDutyFilters(activeFilterBounds));
      setSelectedFlightId(null);
      setFilterUiVersion((current) => current + 1);
    });
  }

  return {
    availableTours,
    selectedTour,
    selectedTourPath,
    selectedAccomplishment,
    accomplishmentOptions,
    accomplishmentRows,
    tourRows,
    sortedTourRows,
    activeTourRows,
    tourFlightsByKey,
    handleSelectTourPath,
    handleShowAccomplishmentFlights
  };
}
