import { useEffect, useRef, useState } from "react";
import {
  getDefaultBasicFilterSectionState,
  getDefaultPlannerControlsCollapsed,
  readViewportSize
} from "./useAppLayout.hooks.js";
import { DEFAULT_DERIVED_TOUR_PROGRESS } from "../features/tours/tours.constants.js";
import { DEFAULT_SORT } from "../features/schedule/schedule.constants.js";
import { buildFilterBounds, normalizeFilters } from "../features/schedule/scheduleFilters.model.js";
import { buildRangeDefaults, normalizeDutyFilters } from "../logic/dutySchedule/dutyFilters";
import { logAppError, logAppEvent, logSystemError, logSystemEvent } from "../services/logging/appLog.client.js";
import { installGlobalErrorLogging } from "../services/logging/globalError.client.js";
import {
  readAddonAirportCache
} from "../services/tauri/addonAirportScan.client.js";
import {
  readDeltaVirtualAccomplishmentEligibility,
  readDeltaVirtualLogbookProgress
} from "../services/tauri/deltaVirtual.client.js";
import {
  readDeltaVirtualTourProgress,
  readDeltaVirtualToursCache,
  readGettingStartedState,
  readSavedSchedule,
  readSavedUiState,
  readSimBriefSettings
} from "../services/storage/storage.js";
import { readDeltaVirtualCredentials } from "../services/tauri/deltaVirtualCredentials.client.js";
import {
  normalizeSimBriefCustomAirframe
} from "../services/tauri/simbrief.client.js";
import {
  DEFAULT_FLIGHT_BOARD_NAME,
  MAX_FLIGHT_BOARDS,
  buildBoardEntryFromFlight,
  buildFlightBoardTabId,
  createFlightBoard,
  normalizeBoardEntry,
  normalizeFlightBoardName
} from "../features/flightBoard/flightBoard.model";
import { normalizeMapOptions } from "../components/map/mapOptions.model.js";

const DEFAULT_GETTING_STARTED_STATE = {
  gettingStartedDismissed: false,
  gettingStartedFinalized: false,
  addonSetupSkipped: false
};

// Rebuilds active-board entries against a fresh flight list so restored shortlist state stays valid.
function reconcileBoardWithSchedule(currentBoard, nextFlights) {
  const flightsById = new Map((nextFlights || []).map((flight) => [flight.flightId, flight]));

  return (currentBoard || [])
    .map((entry) => {
      const normalizedEntry = normalizeBoardEntry(entry);
      if (!normalizedEntry) {
        return null;
      }

      if (normalizedEntry.isTourFlight) {
        return normalizedEntry;
      }

      const matchedFlight = normalizedEntry.linkedFlightId
        ? flightsById.get(normalizedEntry.linkedFlightId)
        : null;

      if (!matchedFlight) {
        return {
          ...normalizedEntry,
          linkedFlightId: null,
          isStale: true
        };
      }

      return buildBoardEntryFromFlight(matchedFlight, {
        boardEntryId: normalizedEntry.boardEntryId,
        selectedAircraft: normalizedEntry.selectedAircraft,
        simbriefPlan: normalizedEntry.simbriefPlan,
        draftNetwork: normalizedEntry.draftNetwork,
        draftReportId: normalizedEntry.draftReportId,
        isStale: false,
        isCompleted: normalizedEntry.isCompleted,
        completedAt: normalizedEntry.completedAt,
        completionOrder: normalizedEntry.completionOrder
      });
    })
    .filter(Boolean);
}

function deriveLegacyFlightBoard(flights = []) {
  return flights
    .filter((flight) => flight.isShortlisted)
    .slice()
    .sort(
      (left, right) =>
        (Number.isInteger(left.boardSequence) ? left.boardSequence : Number.MAX_SAFE_INTEGER) -
          (Number.isInteger(right.boardSequence) ? right.boardSequence : Number.MAX_SAFE_INTEGER) ||
        left.flightId.localeCompare(right.flightId)
    )
    .map((flight) => buildBoardEntryFromFlight(flight));
}

function normalizePersistedFlightBoards(uiState, flights) {
  const persistedBoards = Array.isArray(uiState?.flightBoards) ? uiState.flightBoards : [];
  const normalizedBoards = persistedBoards
    .map((board, index) => {
      const boardId = String(board?.id || "").trim() || buildFlightBoardTabId();
      const boardName = normalizeFlightBoardName(board?.name, `Board ${index + 1}`);
      const boardEntries = reconcileBoardWithSchedule(board?.entries || [], flights);
      return {
        id: boardId,
        name: boardName,
        entries: boardEntries
      };
    })
    .slice(0, MAX_FLIGHT_BOARDS);

  if (!normalizedBoards.length) {
    const fallbackEntries = Array.isArray(uiState?.flightBoard)
      ? reconcileBoardWithSchedule(uiState.flightBoard, flights)
      : deriveLegacyFlightBoard(flights);
    normalizedBoards.push(createFlightBoard(DEFAULT_FLIGHT_BOARD_NAME, fallbackEntries));
  }

  const activeFlightBoardId = String(uiState?.activeFlightBoardId || "").trim();
  const activeBoardExists = normalizedBoards.some((board) => board.id === activeFlightBoardId);

  return {
    boards: normalizedBoards,
    activeBoardId: activeBoardExists ? activeFlightBoardId : normalizedBoards[0].id
  };
}

function buildAddonScanSummary(addonScan) {
  return {
    airportsCached: addonScan?.airports?.length || 0,
    contentHistoryFilesScanned: addonScan?.contentHistoryFilesScanned || 0,
    manifestFilesScanned: addonScan?.manifestFilesScanned || 0,
    manifestFallbacksUsed: addonScan?.manifestFallbacksUsed || 0,
    duplicateAirportEntries: addonScan?.duplicateAirportEntries || 0,
    status: addonScan?.status || "idle",
    warningCount: Array.isArray(addonScan?.warnings) ? addonScan.warnings.length : 0
  };
}

// Owns the first startup hydration pass that restores saved schedules and UI state.
export function useAppBootstrap({
  setActiveFlightBoardId,
  setBasicAddonFiltersOpen,
  setBasicAdvancedFiltersOpen,
  setAddonScan,
  setDutyFilters,
  setDvaFirstName,
  setDvaFirstNameDraft,
  setDvaHasPassword,
  setDvaLastName,
  setDvaLastNameDraft,
  setIsDvaPasswordEditing,
  setDerivedTourProgress,
  setDeltaVirtualToursCache,
  setDeltaVirtualAccomplishmentEligibility,
  setFilters,
  setFlightBoards,
  setGettingStartedState,
  setHasLoadedGettingStartedState,
  setPlannerControlsCollapsed,
  setPlannerMode,
  setSchedule,
  setScheduleTableTimeDisplayMode,
  setScheduleView,
  setSelectedAccomplishmentName,
  setSelectedFlightId,
  setSelectedTourPath,
  setSelectedTourRowId,
  setSort,
  setStatusMessage,
  setLogbookAirportProgress,
  setMapOptions,
  setSavedSimBriefDispatchUnits,
  setSimBriefCustomAirframes,
  setSimBriefCustomAirframesDraft,
  setSimBriefDispatchUnits,
  setSimBriefPilotId,
  setSimBriefPilotIdDraft,
  setSimBriefUsername,
  setSimBriefUsernameDraft,
  setSimBriefUseCurrentUtcForDispatchTime,
  setTourProgress,
  activeFlightBoardId,
  deferredDutyFilters,
  deferredFilters,
  dutyFilters,
  filters,
  flightBoards,
  schedule
} = {}) {
  const [isHydrating, setIsHydrating] = useState(true);
  const [shouldAwaitRestoredScheduleStartup, setShouldAwaitRestoredScheduleStartup] =
    useState(false);
  const [scheduleUiHydrated, setScheduleUiHydrated] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const bootstrapStartedAtRef = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );

  useEffect(() => {
    installGlobalErrorLogging();
  }, []);

  const hasRestoredScheduleStartupSettled =
    Boolean(schedule?.flights?.length) &&
    deferredFilters === filters &&
    deferredDutyFilters === dutyFilters &&
    Boolean(
      activeFlightBoardId &&
        Array.isArray(flightBoards) &&
        flightBoards.some((board) => board.id === activeFlightBoardId)
    );
  const isStartupReady = !isHydrating;

  useEffect(() => {
    let cancelled = false;

    async function hydrateSavedScheduleAndUiState() {
      const [scheduleResult, uiStateResult] = await Promise.allSettled([
        readSavedSchedule(),
        readSavedUiState()
      ]);

      if (cancelled) {
        return;
      }

      if (scheduleResult.status !== "fulfilled" || !scheduleResult.value?.flights?.length) {
        if (scheduleResult.status === "rejected") {
          setStatusMessage(scheduleResult.reason?.message || "Unable to load saved schedule.");
          await logAppError("hydrate-failed", scheduleResult.reason, {
            durationMs: Math.max(
              0,
              Math.round(
                (typeof performance !== "undefined" ? performance.now() : Date.now()) -
                  bootstrapStartedAtRef.current
              )
            )
          });
        } else {
          await logAppEvent("hydrate-empty", {
            durationMs: Math.max(
              0,
              Math.round(
                (typeof performance !== "undefined" ? performance.now() : Date.now()) -
                  bootstrapStartedAtRef.current
              )
            )
          });
        }
        setScheduleUiHydrated(true);
        return;
      }

      const savedSchedule = scheduleResult.value;
      const savedBounds = buildFilterBounds(savedSchedule.flights);
      const savedUiState =
        uiStateResult.status === "fulfilled" && uiStateResult.value
          ? uiStateResult.value
          : savedSchedule.uiState || {};
      const defaultBasicFilterSections = getDefaultBasicFilterSectionState(readViewportSize());
      setShouldAwaitRestoredScheduleStartup(true);
      setSchedule({
        importedAt: savedSchedule.importedAt,
        flights: savedSchedule.flights,
        importSummary: savedSchedule.importSummary
      });
      const nextFlightBoardState = normalizePersistedFlightBoards(
        savedUiState,
        savedSchedule.flights
      );
      setFlightBoards(nextFlightBoardState.boards);
      setActiveFlightBoardId(nextFlightBoardState.activeBoardId);
      setFilters(
        normalizeFilters(
          {
            ...savedUiState.filters,
            ...buildRangeDefaults(savedBounds)
          },
          savedBounds
        )
      );
      setDutyFilters(
        normalizeDutyFilters(
          {
            ...savedUiState.dutyFilters,
            ...buildRangeDefaults(savedBounds)
          },
          savedBounds
        )
      );
      setPlannerMode(savedUiState.plannerMode === "duty" ? "duty" : "basic");
      setScheduleTableTimeDisplayMode(
        savedUiState.scheduleTableTimeDisplayMode === "utc" ? "utc" : "local"
      );
      setSort(savedUiState.sort || DEFAULT_SORT);
      setScheduleView("flights");
      setSelectedTourPath(String(savedUiState.selectedTourPath || "").trim());
      setSelectedAccomplishmentName(String(savedUiState.selectedAccomplishmentName || "").trim());
      setSelectedTourRowId(null);
      setMapOptions?.(normalizeMapOptions(savedUiState.mapOptions));
      setTourProgress(
        savedUiState.tourProgress && typeof savedUiState.tourProgress === "object"
          ? savedUiState.tourProgress
          : {}
      );
      setPlannerControlsCollapsed(
        typeof savedUiState.plannerControlsCollapsed === "boolean"
          ? savedUiState.plannerControlsCollapsed
          : getDefaultPlannerControlsCollapsed()
      );
      setBasicAdvancedFiltersOpen(defaultBasicFilterSections.basicAdvancedFiltersOpen);
      setBasicAddonFiltersOpen(defaultBasicFilterSections.basicAddonFiltersOpen);
      setSelectedFlightId(
        savedUiState.selectedFlightId ||
          savedSchedule.flights[0]?.flightId ||
          null
      );
      await logAppEvent("hydrate-succeeded", {
        flights: savedSchedule.flights.length,
        source: savedSchedule.importSummary?.sourceFileName || "unknown",
        durationMs: Math.max(
          0,
          Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) -
              bootstrapStartedAtRef.current
          )
        )
      });
      setScheduleUiHydrated(true);
    }

    void hydrateSavedScheduleAndUiState().catch(async (error) => {
      if (!cancelled) {
        setStatusMessage(error.message || "Unable to initialize the app.");
        setScheduleUiHydrated(true);
      }
      await logAppError("hydrate-unhandled-failed", error, {
        durationMs: Math.max(
          0,
          Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) -
              bootstrapStartedAtRef.current
          )
        )
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    setActiveFlightBoardId,
    setBasicAddonFiltersOpen,
    setBasicAdvancedFiltersOpen,
    setDutyFilters,
    setFilters,
    setFlightBoards,
    setPlannerControlsCollapsed,
    setPlannerMode,
    setSchedule,
    setScheduleTableTimeDisplayMode,
    setScheduleView,
    setSelectedAccomplishmentName,
    setSelectedFlightId,
    setSelectedTourPath,
    setSelectedTourRowId,
    setSort,
    setStatusMessage,
    setMapOptions,
    setTourProgress
  ]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSavedSettings() {
      const [dvaCredentialsResult, simBriefResult] = await Promise.allSettled([
        readDeltaVirtualCredentials(),
        readSimBriefSettings()
      ]);

      if (cancelled) {
        return;
      }

      if (dvaCredentialsResult.status === "fulfilled") {
        const firstName = String(dvaCredentialsResult.value?.firstName || "").trim();
        const lastName = String(dvaCredentialsResult.value?.lastName || "").trim();
        const hasPassword = Boolean(dvaCredentialsResult.value?.hasPassword);
        setDvaFirstName?.(firstName);
        setDvaFirstNameDraft?.(firstName);
        setDvaLastName?.(lastName);
        setDvaLastNameDraft?.(lastName);
        setDvaHasPassword?.(hasPassword);
        setIsDvaPasswordEditing?.(false);
        await logAppEvent("deltava-auth-loaded", {
          configured: Boolean(firstName || lastName || hasPassword)
        });
      } else {
        await logAppError("deltava-auth-hydrate-failed", dvaCredentialsResult.reason);
      }

      if (simBriefResult.status === "fulfilled") {
        const username = String(simBriefResult.value?.username || "").trim();
        const pilotId = String(simBriefResult.value?.pilotId || "").trim();
        const useCurrentUtcForDispatchTime = Boolean(
          simBriefResult.value?.useCurrentUtcForDispatchTime
        );
        const dispatchUnits =
          String(simBriefResult.value?.dispatchUnits || "").trim().toUpperCase() === "KGS"
            ? "KGS"
            : "LBS";
        const customAirframes = Array.isArray(simBriefResult.value?.customAirframes)
          ? simBriefResult.value.customAirframes.map(normalizeSimBriefCustomAirframe).filter(Boolean)
          : [];
        setSimBriefUsername?.(username);
        setSimBriefUsernameDraft?.(username);
        setSimBriefPilotId?.(pilotId);
        setSimBriefPilotIdDraft?.(pilotId);
        setSimBriefUseCurrentUtcForDispatchTime?.(useCurrentUtcForDispatchTime);
        setSimBriefDispatchUnits?.(dispatchUnits);
        setSavedSimBriefDispatchUnits?.(dispatchUnits);
        setSimBriefCustomAirframes?.(customAirframes);
        setSimBriefCustomAirframesDraft?.(customAirframes);
        await logAppEvent("SimBrief", "settings-loaded", {
          hasUsername: Boolean(username),
          hasPilotId: Boolean(pilotId),
          useCurrentUtcForDispatchTime,
          dispatchUnits,
          customAirframeCount: customAirframes.length
        });
      } else {
        await logAppError("SimBrief", "settings-hydrate-failed", simBriefResult.reason);
      }
    }

    void hydrateSavedSettings()
      .catch(async (error) => {
        if (!cancelled) {
          setStatusMessage?.(error.message || "Unable to initialize the app.");
        }
        await logAppError("bootstrap-settings-hydrate-failed", error);
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    setDvaFirstName,
    setDvaFirstNameDraft,
    setDvaHasPassword,
    setDvaLastName,
    setDvaLastNameDraft,
    setIsDvaPasswordEditing,
    setSavedSimBriefDispatchUnits,
    setSimBriefCustomAirframes,
    setSimBriefCustomAirframesDraft,
    setSimBriefDispatchUnits,
    setSimBriefPilotId,
    setSimBriefPilotIdDraft,
    setSimBriefUsername,
    setSimBriefUsernameDraft,
    setSimBriefUseCurrentUtcForDispatchTime,
    setStatusMessage
  ]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateCacheAndProgressState() {
      const [
        addonCacheResult,
        gettingStartedResult,
        accomplishmentEligibilityResult,
        logbookProgressResult,
        tourProgressResult,
        toursCacheResult
      ] = await Promise.allSettled([
        readAddonAirportCache(),
        readGettingStartedState(),
        readDeltaVirtualAccomplishmentEligibility(),
        readDeltaVirtualLogbookProgress(),
        readDeltaVirtualTourProgress(),
        readDeltaVirtualToursCache()
      ]);

      try {
        if (cancelled) {
          return;
        }

        if (addonCacheResult.status === "fulfilled") {
          setAddonScan(addonCacheResult.value);
          await logSystemEvent("AddonScan", "cache-loaded", {
            ...buildAddonScanSummary(addonCacheResult.value),
            durationMs: Math.max(
              0,
              Math.round(
                (typeof performance !== "undefined" ? performance.now() : Date.now()) -
                  bootstrapStartedAtRef.current
              )
            )
          });
        } else {
          setStatusMessage(addonCacheResult.reason?.message || "Unable to load addon airport cache.");
          await logSystemError("AddonScan", "cache-load-failed", addonCacheResult.reason, {
            durationMs: Math.max(
              0,
              Math.round(
                (typeof performance !== "undefined" ? performance.now() : Date.now()) -
                  bootstrapStartedAtRef.current
              )
            )
          });
        }

        if (accomplishmentEligibilityResult.status === "fulfilled") {
          setDeltaVirtualAccomplishmentEligibility(
            accomplishmentEligibilityResult.value || { lastSyncAt: null, sourceUrl: null, rows: [] }
          );
        }

        if (logbookProgressResult.status === "fulfilled") {
          setLogbookAirportProgress(
            logbookProgressResult.value || {
              dateIso: null,
              visitedAirports: [],
              arrivalAirports: []
            }
          );
        }

        if (tourProgressResult.status === "fulfilled") {
          setDerivedTourProgress(
            tourProgressResult.value || DEFAULT_DERIVED_TOUR_PROGRESS
          );
        } else {
          setDerivedTourProgress(DEFAULT_DERIVED_TOUR_PROGRESS);
        }

        if (gettingStartedResult.status === "fulfilled") {
          setGettingStartedState({
            gettingStartedDismissed: Boolean(gettingStartedResult.value?.gettingStartedDismissed),
            gettingStartedFinalized: Boolean(gettingStartedResult.value?.gettingStartedFinalized),
            addonSetupSkipped: Boolean(gettingStartedResult.value?.addonSetupSkipped)
          });
        } else {
          setGettingStartedState(DEFAULT_GETTING_STARTED_STATE);
        }
        setHasLoadedGettingStartedState(true);

        if (toursCacheResult.status === "fulfilled") {
          setDeltaVirtualToursCache(toursCacheResult.value);
        } else {
          setDeltaVirtualToursCache(null);
          await logAppError("deltava-tours-cache-hydrate-failed", toursCacheResult.reason);
        }

        if (addonCacheResult.status === "fulfilled") {
          setStatusMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error.message || "Unable to initialize the app.");
        }
        await logAppError("hydrate-unhandled-failed", error);
        return;
      }
    }

    void hydrateCacheAndProgressState().finally(() => {
      if (!cancelled) {
        setCacheHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    setAddonScan,
    setDeltaVirtualToursCache,
    setDeltaVirtualAccomplishmentEligibility,
    setDerivedTourProgress,
    setGettingStartedState,
    setHasLoadedGettingStartedState,
    setLogbookAirportProgress,
    setStatusMessage
  ]);

  useEffect(() => {
    if (scheduleUiHydrated && settingsHydrated && cacheHydrated) {
      setIsHydrating(false);
    }
  }, [cacheHydrated, scheduleUiHydrated, settingsHydrated]);

  useEffect(() => {
    if (!shouldAwaitRestoredScheduleStartup || !hasRestoredScheduleStartupSettled) {
      return;
    }

    setShouldAwaitRestoredScheduleStartup(false);
  }, [hasRestoredScheduleStartupSettled, shouldAwaitRestoredScheduleStartup]);

  useEffect(() => {
    if (!shouldAwaitRestoredScheduleStartup) {
      return undefined;
    }

    const timeoutHandle = window.setTimeout(() => {
      setShouldAwaitRestoredScheduleStartup(false);
    }, 1500);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  }, [shouldAwaitRestoredScheduleStartup]);

  return {
    hasRestoredScheduleStartupSettled,
    isHydrating,
    isStartupReady,
    shouldAwaitRestoredScheduleStartup
  };
}
