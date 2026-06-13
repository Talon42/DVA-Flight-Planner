import { startTransition, useEffect, useMemo, useState } from "react";
import {
  ACCOMPLISHMENT_REQUIREMENTS,
  buildAccomplishmentRowsFromEligibility,
  selectAirportAccomplishments
} from "../accomplishments/accomplishments.model.js";
import { DEFAULT_FILTERS, DEFAULT_SORT } from "../schedule/schedule.constants.js";
import { buildFilterBounds, normalizeFilters } from "../schedule/scheduleFilters.model.js";
import { selectFilteredScheduleFlights } from "../schedule/scheduleFilters.selectors.js";
import { selectSortedScheduleFlights } from "../schedule/scheduleSort.selectors.js";
import { buildRangeDefaults } from "../../logic/dutySchedule/dutyFilters.js";
import { logAppEvent } from "../../services/logging/appLog.client.js";
import { buildTourFlightLookupKey, normalizeDvaTourId } from "./tourIds.model.js";
import { mergeTourProgressSources } from "./tourProgress.selectors.js";
import { selectAvailableTours } from "./tours.selectors.js";

// Keeps tour and accomplishment selection state synchronized with synced cache data.
export function useTourSelection({
  boardedTourRowIds = new Set(),
  deltaVirtualAccomplishmentEligibility = null,
  deltaVirtualToursCache = null,
  derivedTourProgress = null,
  isDevToolsEnabled = false,
  scheduleView = "flights",
  scheduleFlights = [],
  selectedAccomplishmentName = "",
  selectedTourPath = "",
  sort = DEFAULT_SORT,
  boardedFlightIds = new Set(),
  setSelectedAccomplishmentName,
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

  const accomplishmentOptions = useMemo(
    () => {
      const airportAccomplishments = selectAirportAccomplishments(deltaVirtualAccomplishmentEligibility);

      return airportAccomplishments.map((accomplishment) => {
        const totalCount =
          accomplishment.required ??
          accomplishment.progress ??
          accomplishment.missingIcaoCodes.length;
        const completedCount = accomplishment.achieved
          ? totalCount
          : accomplishment.progress ?? Math.max(totalCount - accomplishment.missingIcaoCodes.length, 0);

        return {
          name: accomplishment.name,
          requirement: accomplishment.unit,
          unit: accomplishment.unit,
          sourceIndex: accomplishment.sourceIndex,
          isCompleted: accomplishment.achieved,
          achievedDate: accomplishment.achievedDate,
          completedCount,
          totalCount,
          remainingCount: accomplishment.missingIcaoCodes.length,
          missingAirports: accomplishment.missing,
          missingIcaoCodes: accomplishment.missingIcaoCodes,
          airports: accomplishment.missingIcaoCodes
        };
      });
    },
    [deltaVirtualAccomplishmentEligibility]
  );

  const selectedAccomplishment = useMemo(() => {
    if (!accomplishmentOptions.length) {
      return null;
    }

    return (
      accomplishmentOptions.find(
        (accomplishment) => accomplishment.name === selectedAccomplishmentName
      ) || accomplishmentOptions[0]
    );
  }, [accomplishmentOptions, selectedAccomplishmentName]);

  const accomplishmentRows = useMemo(
    () => buildAccomplishmentRowsFromEligibility(selectedAccomplishment),
    [selectedAccomplishment]
  );
  const [accomplishmentFlightSearch, setAccomplishmentFlightSearch] = useState({
    airport: "",
    requirement: "",
    label: ""
  });
  const [accomplishmentFlightSort, setAccomplishmentFlightSort] = useState(() => sort);

  useEffect(() => {
    // Clear the embedded search when the accomplishment selection changes so the card stays
    // tied to the currently visible accomplishment list.
    setAccomplishmentFlightSearch({ airport: "", requirement: "", label: "" });
  }, [selectedAccomplishment?.name]);

  // Derives the embedded accomplishment flight list from the raw schedule data so the main
  // planner filters and tab state stay untouched.
  const accomplishmentFlightRows = useMemo(() => {
    const airport = String(accomplishmentFlightSearch.airport || "").trim().toUpperCase();
    if (!airport) {
      return [];
    }

    const normalizedRequirement = String(accomplishmentFlightSearch.requirement || "")
      .trim()
      .toLowerCase();
    const filterKey =
      normalizedRequirement === ACCOMPLISHMENT_REQUIREMENTS.ARRIVAL_AIRPORT
        ? "destination"
        : "originOrDestination";
    const availableFlights = scheduleFlights.filter(
      (flight) => !boardedFlightIds.has(String(flight?.flightId || "").trim())
    );
    const accomplishmentFilters = normalizeFilters(
      {
        ...DEFAULT_FILTERS,
        ...buildRangeDefaults(activeFilterBounds),
        [filterKey]: [airport]
      },
      activeFilterBounds
    );
    const filteredFlights = selectFilteredScheduleFlights({
      flights: availableFlights,
      filters: accomplishmentFilters,
      addonAirports: new Set(),
      vatsimCoverageIndex: null
    });

    return selectSortedScheduleFlights({
      flights: filteredFlights,
      sort: accomplishmentFlightSort,
      filters: accomplishmentFilters,
      addonAirports: new Set()
    });
  }, [
    accomplishmentFlightSearch.airport,
    accomplishmentFlightSearch.requirement,
    accomplishmentFlightSort,
    activeFilterBounds,
    boardedFlightIds,
    scheduleFlights
  ]);
  const hasAccomplishmentFlightSearch = Boolean(
    String(accomplishmentFlightSearch.airport || "").trim()
  );

  const tourRows = useMemo(() => selectedTour?.rows || [], [selectedTour]);
  const activeTourRows = useMemo(
    () =>
      tourRows.filter((row) => {
        if (!row?.tourRowId) {
          return true;
        }

        // Keep completed tour legs visible even if they are still on a board from manual or synced progress.
        if (row.isCompleted) {
          return true;
        }

        return !boardedTourRowIds.has(row.tourRowId);
      }),
    [boardedTourRowIds, tourRows]
  );
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
    // Keep incomplete legs at the top while preserving the published tour order
    // within both incomplete and completed groups.
    return [...activeTourRows].sort((left, right) => {
      if (Boolean(left?.isCompleted) !== Boolean(right?.isCompleted)) {
        return left?.isCompleted ? 1 : -1;
      }

      return (left.sourceIndex ?? 0) - (right.sourceIndex ?? 0);
    });
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
    if (!accomplishmentOptions.length) {
      if (selectedAccomplishmentName) {
        setSelectedAccomplishmentName("");
      }
      return;
    }

    if (
      !selectedAccomplishmentName ||
      !accomplishmentOptions.some((accomplishment) => accomplishment.name === selectedAccomplishmentName)
    ) {
      setSelectedAccomplishmentName(accomplishmentOptions[0].name);
    }
  }, [
    accomplishmentOptions,
    selectedAccomplishmentName,
    setSelectedAccomplishmentName
  ]);

  useEffect(() => {
    if (scheduleView !== "tours") {
      return;
    }

    setSelectedTourRowId((current) =>
      activeTourRows.some((row) => row.tourRowId === current)
        ? current
        : activeTourRows[0]?.tourRowId || null
    );
  }, [activeTourRows, scheduleView, setSelectedTourRowId]);

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

  function handleShowAccomplishmentFlights(airport, requirement, label) {
    const normalizedAirport = String(airport || "").trim().toUpperCase();
    if (!normalizedAirport) {
      return;
    }

    // Keep the search local to the accomplishment panel and leave the main schedule view alone.
    startTransition(() => {
      setAccomplishmentFlightSearch({
        airport: normalizedAirport,
        requirement: String(requirement || "").trim().toLowerCase(),
        label: String(label || "").trim()
      });
      setAccomplishmentFlightSort(sort);
    });
  }

  function handleSortAccomplishmentFlights(sortKey) {
    setAccomplishmentFlightSort((current) => {
      if (current.key === sortKey) {
        return {
          key: sortKey,
          direction: current.direction === "asc" ? "desc" : "asc"
        };
      }

      return {
        key: sortKey,
        direction: "asc"
      };
    });
  }

  return {
    availableTours,
    selectedTour,
    selectedTourPath,
    selectedAccomplishment,
    accomplishmentOptions,
    accomplishmentRows,
    accomplishmentFlightRows,
    accomplishmentFlightSearch,
    accomplishmentFlightSort,
    hasAccomplishmentFlightSearch,
    tourRows,
    sortedTourRows,
    activeTourRows,
    tourFlightsByKey,
    handleSelectTourPath,
    handleShowAccomplishmentFlights,
    handleSortAccomplishmentFlights
  };
}
