import {
  startTransition,
  useDeferredValue,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState
} from "react";
import AppShell from "./AppShell.jsx";
import {
  DEV_TOOLS_STORAGE_KEY,
  DEV_WINDOW_WIDTH_STORAGE_KEY,
  THEME_STORAGE_KEY,
  isTauriRuntime,
  isWindowsRuntime,
  readSavedTheme
} from "./appRuntime.js";
import {
  useAppLayout
} from "./useAppLayout.hooks.js";
import { useAppBootstrap } from "./useAppBootstrap.hooks.js";
import { useAppUiStatePersistence } from "./useAppUiStatePersistence.hooks.js";
import { useExternalFlightActions } from "./useExternalFlightActions.hooks.js";
import { useAddonAirports } from "../features/addons/useAddonAirports.hooks.js";
import { useAppModals } from "./useAppModals.hooks.js";
import { useAppConfirmations } from "./useAppConfirmations.hooks.js";
import { useAppUpdates } from "./useAppUpdates.hooks.js";
import { useDeltaVirtualDraftReport } from "../features/deltaVirtual/useDeltaVirtualDraftReport.hooks.js";
import { useSyncOrchestration } from "./useSyncOrchestration.hooks.js";
import { useWhatsNew } from "../features/whatsNew/useWhatsNew.hooks.js";
import { useSimBriefDispatch } from "../features/simbrief/useSimBriefDispatch.hooks.js";
import { useScheduleImport } from "../features/schedule/useScheduleImport.hooks.js";
import { useAppDevTools } from "./useAppDevTools.hooks.js";
import { useAppSettings } from "./useAppSettings.hooks.js";
import { useAppSettingsPersistence } from "./useAppSettingsPersistence.hooks.js";
import { useUserDataLifecycle } from "./useUserDataLifecycle.hooks.js";
import AppSettingsContent from "./AppSettingsContent.jsx";
import AppRightColumn from "./AppRightColumn.jsx";
import { useFlightBoards } from "../features/flightBoard/useFlightBoards.hooks.js";
import {
  formatAddonScanSummary
} from "../features/addons/addonScanFormatting.js";
import { useTourSelection } from "../features/tours/useTourSelection.hooks.js";
import { useDutyScheduleBuilder } from "../features/dutySchedule/useDutyScheduleBuilder.hooks.js";
import { useVatsimCoverage } from "../features/vatsim/useVatsimCoverage.hooks.js";
import { useLogbookWorkspace } from "../features/logbook/useLogbookWorkspace.hooks.js";
import { DEFAULT_FILTERS, DEFAULT_SORT } from "../features/schedule/schedule.constants.js";
import { DEFAULT_DUTY_FILTERS } from "../logic/dutySchedule/dutySchedule.constants.js";
import { buildDefaultDutyFilters } from "../logic/dutySchedule/dutyFilters";
import {
  buildFilterBounds,
  normalizeFilters
} from "../features/schedule/scheduleFilters.model";
import {
  selectFilteredScheduleFlights
} from "../features/schedule/scheduleFilters.selectors";
import {
  selectSortedScheduleFlights
} from "../features/schedule/scheduleSort.selectors";
import {
  selectAirportOptions,
  selectGeoOptions,
  selectScheduleAirlines,
  selectScheduleEquipmentOptions
} from "../features/schedule/scheduleOptions.selectors";
import { formatNumber } from "../domain/formatting/formatters.js";
import {
  logAppError,
  logAppEvent,
  getAppSessionId,
  setDebugLoggingEnabled,
  openAppLogFile
} from "../services/logging/appLog.client.js";
import { writeGettingStartedState } from "../services/storage/storage.js";
import {
  createFlightBoard,
  normalizeBoardEntry,
  normalizeDraftNetwork,
} from "../features/flightBoard/flightBoard.model";
import {
  DEFAULT_MAP_OPTIONS,
} from "../components/map/mapOptions.model.js";
import {
  getAircraftDisplayName,
  findCustomAirframeByInternalId,
  getSelectedAircraftForFlight,
  resolveSimBriefDispatchAircraft
} from "../domain/aircraft/aircraftIdentity.js";
import { DEFAULT_DERIVED_TOUR_PROGRESS } from "../features/tours/tours.constants";
import {
  buildFooterDateLabel,
  buildFooterDateTimeLabel,
  buildScheduleDateInfo
} from "../domain/schedule/scheduleDate";

const APP_BUILD_GIT_TAG = String(import.meta.env.VITE_BUILD_GIT_TAG || "").trim() || "local-dev";
const BOOT_SPLASH_HIDE_DELAY_MS = 200;
const DEFAULT_GETTING_STARTED_STATE = {
  gettingStartedDismissed: false,
  gettingStartedFinalized: false,
  addonSetupSkipped: false
};

export default function App() {
  const [schedule, setSchedule] = useState(null);
  const [flightBoards, setFlightBoards] = useState([createFlightBoard()]);
  const [activeFlightBoardId, setActiveFlightBoardId] = useState("");
  const [selectedFlightId, setSelectedFlightId] = useState(null);
  const [selectedTourRowId, setSelectedTourRowId] = useState(null);
  const [selectedAirportInfo, setSelectedAirportInfo] = useState(null);
  const [expandedBoardFlightId, setExpandedBoardFlightId] = useState(null);
  const [pendingMapFlightPathViewMode, setPendingMapFlightPathViewMode] = useState(null);
  const [pendingMapFitToRoute, setPendingMapFitToRoute] = useState(false);
  const [scheduleView, setScheduleView] = useState("flights");
  const [plannerMode, setPlannerMode] = useState("basic");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [dutyFilters, setDutyFilters] = useState(DEFAULT_DUTY_FILTERS);
  const [filterUiVersion, setFilterUiVersion] = useState(0);
  const [vatsimRefreshVersion, setVatsimRefreshVersion] = useState(0);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [selectedTourPath, setSelectedTourPath] = useState("");
  const [selectedAccomplishmentName, setSelectedAccomplishmentName] = useState("");
  const [isAccomplishmentSelectorCollapsed, setIsAccomplishmentSelectorCollapsed] = useState(false);
  const [isTourSelectorCollapsed, setIsTourSelectorCollapsed] = useState(false);
  const [tourProgress, setTourProgress] = useState({});
  const [derivedTourProgress, setDerivedTourProgress] = useState(DEFAULT_DERIVED_TOUR_PROGRESS);
  const [deltaVirtualToursCache, setDeltaVirtualToursCache] = useState(null);
  const [deltaVirtualAccomplishmentEligibility, setDeltaVirtualAccomplishmentEligibility] =
    useState({
      lastSyncAt: null,
      sourceUrl: null,
      rows: []
    });
  const [mapOptions, setMapOptions] = useState(DEFAULT_MAP_OPTIONS);
  const [theme, setTheme] = useState(readSavedTheme);
  const setMapOptionsThroughPersistenceRef = useRef(null);
  const handleSetMapOptions = useCallback((updater) => {
    setMapOptionsThroughPersistenceRef.current?.(updater);
  }, []);
  const {
    viewportSize,
    plannerControlsCollapsed,
    setPlannerControlsCollapsed,
    basicAdvancedFiltersOpen,
    setBasicAdvancedFiltersOpen,
    basicAddonFiltersOpen,
    setBasicAddonFiltersOpen,
    isPlannerControlsInlineCollapsed,
    topbarTitle,
    syncButtonLabel
  } = useAppLayout();
  const [gettingStartedState, setGettingStartedState] = useState(DEFAULT_GETTING_STARTED_STATE);
  const [hasLoadedGettingStartedState, setHasLoadedGettingStartedState] = useState(false);
  const [shouldRunDeferredStartupDvaSync, setShouldRunDeferredStartupDvaSync] = useState(false);
  const [, setStatusMessage] = useState("Ready");
  const [logbookAirportProgress, setLogbookAirportProgress] = useState({
    dateIso: null,
    lastSyncAt: null,
    visitedAirports: [],
    arrivalAirports: []
  });
  const simBriefDispatchStateRef = useRef({
    flightId: "",
    isDispatching: false,
    message: ""
  });
  const clearSimBriefDispatchStateRef = useRef(null);
  const logbookSyncCompleteRef = useRef(() => {});
  const isDesktopAddonScanAvailable = isTauriRuntime();
  const { handleOpenSimBriefFlight } = useExternalFlightActions({
    isDesktop: isDesktopAddonScanAvailable
  });
  const appDevTools = useAppDevTools({
    isDesktopAddonScanAvailable,
    setStatusMessage
  });
  const appAddons = useAddonAirports({
    gettingStartedState,
    isDevToolsEnabled: appDevTools.isDevToolsEnabled,
    setGettingStartedState,
    setStatusMessage
  });
  const appModals = useAppModals();
  const {
    isDeleteUserDataConfirmOpen,
    confirmDeleteUserDataInApp,
    resolveDeleteUserDataConfirmation,
    isDutyBoardOverwriteConfirmOpen,
    confirmDutyBoardOverwriteInApp,
    resolveDutyBoardOverwriteConfirmation
  } = useAppConfirmations();
  const {
    isDevToolsEnabled,
    devWindowWidth,
    isDevWindowMenuOpen,
    setIsDevWindowMenuOpen,
    isDevContextMenuOpen,
    devContextMenuPosition,
    devWindowMenuRef,
    devContextMenuRef,
    selectedDevWindowPreset,
    devWindowWidthPresets,
    handleToggleDevTools,
    handleToggleDevWindowMenu,
    handleOpenDevContextMenu,
    handleCloseDevContextMenu,
    handleOpenMainDevtools,
    handleSelectDevWindowWidth
  } = appDevTools;
  const {
    addonScan,
    setAddonScan,
    isAddonScanBusy,
    isAddonAutoScanning,
    handleScanAddonAirports,
    handleSkipAddonSetup,
    handleAddAddonRoot,
    handleRemoveAddonRoot
  } = appAddons;
  const {
    isReadmeOpen,
    handleToggleReadme,
    handleCloseReadme,
    isSimBriefDispatchBlockedOpen,
    simBriefDispatchBlockedMessage,
    handleOpenSimBriefDispatchBlocked,
    handleCloseSimBriefDispatchBlocked,
    isStaleScheduleBlockedOpen,
    handleOpenStaleScheduleBlocked,
    handleCloseStaleScheduleBlocked
  } = appModals;
  const appSettings = useAppSettings({ setIsDevWindowMenuOpen });
  const {
    dvaSyncWarning,
    setDvaSyncWarning,
    isDvaSyncWarningOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    settingsTab,
    setSettingsTab,
    dvaFirstName,
    setDvaFirstName,
    dvaFirstNameDraft,
    setDvaFirstNameDraft,
    dvaLastName,
    setDvaLastName,
    dvaLastNameDraft,
    setDvaLastNameDraft,
    dvaHasPassword,
    setDvaHasPassword,
    dvaPasswordDraft,
    setDvaPasswordDraft,
    isDvaPasswordEditing,
    setIsDvaPasswordEditing,
    isDvaCredentialsSaving,
    setIsDvaCredentialsSaving,
    hasDvaCredentialChanges,
    isDvaPasswordDisplayText,
    dvaPasswordFieldValue,
    dvaCredentialsConfigured,
    simBriefCredentialsConfigured,
    simBriefUsername,
    setSimBriefUsername,
    simBriefUsernameDraft,
    setSimBriefUsernameDraft,
    simBriefPilotId,
    setSimBriefPilotId,
    simBriefPilotIdDraft,
    setSimBriefPilotIdDraft,
    simBriefUseCurrentUtcForDispatchTime,
    setSimBriefUseCurrentUtcForDispatchTime,
    simBriefDispatchUnits,
    setSimBriefDispatchUnits,
    savedSimBriefDispatchUnits,
    setSavedSimBriefDispatchUnits,
    simBriefDepartureOffsetMinutes,
    setSimBriefDepartureOffsetMinutes,
    savedSimBriefDepartureOffsetMinutes,
    setSavedSimBriefDepartureOffsetMinutes,
    simBriefCustomAirframes,
    setSimBriefCustomAirframes,
    simBriefCustomAirframesDraft,
    setSimBriefCustomAirframesDraft,
    simBriefCustomAirframeIdDraft,
    setSimBriefCustomAirframeIdDraft,
    simBriefCustomAirframeNameDraft,
    setSimBriefCustomAirframeNameDraft,
    simBriefCustomAirframeMatchTypeDraft,
    setSimBriefCustomAirframeMatchTypeDraft,
    isSimBriefSaving,
    setIsSimBriefSaving,
    handleToggleSettings,
    handleCloseSettings,
    handleOpenDeltaVirtualSettings
  } = appSettings;
  const appSettingsPersistence = useAppSettingsPersistence({
    dvaFirstName,
    dvaFirstNameDraft,
    dvaLastName,
    dvaLastNameDraft,
    dvaPasswordDraft,
    isDvaCredentialsSaving,
    isSimBriefSaving,
    savedSimBriefDispatchUnits,
    savedSimBriefDepartureOffsetMinutes,
    simBriefCustomAirframes,
    simBriefCustomAirframeIdDraft,
    simBriefCustomAirframeMatchTypeDraft,
    simBriefCustomAirframeNameDraft,
    simBriefCustomAirframesDraft,
    simBriefDispatchUnits,
    simBriefPilotId,
    simBriefPilotIdDraft,
    simBriefUsername,
    simBriefUsernameDraft,
    simBriefUseCurrentUtcForDispatchTime,
    simBriefDepartureOffsetMinutes,
    setDvaFirstName,
    setDvaFirstNameDraft,
    setDvaHasPassword,
    setDvaLastName,
    setDvaLastNameDraft,
    setDvaPasswordDraft,
    setIsDvaCredentialsSaving,
    setIsDvaPasswordEditing,
    setIsSimBriefSaving,
    setSavedSimBriefDispatchUnits,
    setSavedSimBriefDepartureOffsetMinutes,
    setSimBriefCustomAirframeIdDraft,
    setSimBriefCustomAirframeMatchTypeDraft,
    setSimBriefCustomAirframeNameDraft,
    setSimBriefCustomAirframes,
    setSimBriefCustomAirframesDraft,
    setSimBriefDispatchUnits,
    setSimBriefPilotId,
    setSimBriefPilotIdDraft,
    setSimBriefUsername,
    setSimBriefUsernameDraft,
    setSimBriefUseCurrentUtcForDispatchTime,
    setSimBriefDepartureOffsetMinutes,
    setStatusMessage
  });
  const {
    handleSaveDeltaVirtualCredentials,
    handleClearDeltaVirtualCredentials,
    handleSaveSimBriefCredentials,
    handleSimBriefDispatchUnitsChange,
    handleSimBriefDispatchTimeModeChange,
    handleSimBriefDepartureOffsetChange,
    handleAddCustomAirframeDraft,
    handleRemoveCustomAirframeDraft
  } = appSettingsPersistence;
  const deferredFilters = useDeferredValue(filters);
  const deferredDutyFilters = useDeferredValue(dutyFilters);
  const { isHydrating, isStartupReady, restoredUiState } = useAppBootstrap({
    activeFlightBoardId,
    deferredDutyFilters,
    deferredFilters,
    dutyFilters,
    filters,
    flightBoards,
    schedule,
    setActiveFlightBoardId,
    setAddonScan,
    setBasicAddonFiltersOpen,
    setBasicAdvancedFiltersOpen,
    setDutyFilters,
    setDvaFirstName,
    setDvaFirstNameDraft,
    setDvaHasPassword,
    setDvaLastName,
    setDvaLastNameDraft,
    setDerivedTourProgress,
    setDeltaVirtualAccomplishmentEligibility,
    setDeltaVirtualToursCache,
    setFilters,
    setFlightBoards,
    setGettingStartedState,
    setHasLoadedGettingStartedState,
    setIsDvaPasswordEditing,
    setPlannerControlsCollapsed,
    setPlannerMode,
    setSchedule,
    setScheduleView,
    setSelectedAccomplishmentName,
    setSelectedFlightId,
    setSelectedTourPath,
    setSelectedTourRowId,
    setLogbookAirportProgress,
    setMapOptions: handleSetMapOptions,
    setSavedSimBriefDispatchUnits,
    setSavedSimBriefDepartureOffsetMinutes,
    setSort,
    setStatusMessage,
    setSimBriefCustomAirframes,
    setSimBriefCustomAirframesDraft,
    setSimBriefDispatchUnits,
    setSimBriefDepartureOffsetMinutes,
    setSimBriefPilotId,
    setSimBriefPilotIdDraft,
    setSimBriefUsername,
    setSimBriefUsernameDraft,
    setSimBriefUseCurrentUtcForDispatchTime,
    setTourProgress
  });
  const isDesktopSimBriefAvailable = isDesktopAddonScanAvailable;
  // Keep the derived flight list stable so downstream hooks can read it safely.
  const scheduleFlights = useMemo(() => schedule?.flights || [], [schedule]);
  const scheduleDateInfo = buildScheduleDateInfo(schedule?.flights || []);
  const isScheduleOutOfDate = Boolean(schedule?.flights?.length) && scheduleDateInfo.isCurrent === false;
  const scheduleDateLabel = scheduleDateInfo.label;
  const logbookLastReportLabel = buildFooterDateLabel(logbookAirportProgress.dateIso);
  const logbookLastSyncLabel = buildFooterDateTimeLabel(logbookAirportProgress.lastSyncAt);
  // Tracks which rows are already assigned to any board so the schedule tables only show available work.
  const boardedFlightIds = useMemo(
    () =>
      new Set(
        flightBoards.flatMap((board) =>
          (Array.isArray(board?.entries) ? board.entries : [])
            .filter((entry) => !entry?.isTourFlight && String(entry?.linkedFlightId || "").trim())
            .map((entry) => String(entry.linkedFlightId).trim())
        )
      ),
    [flightBoards]
  );
  const boardedTourRowIds = useMemo(
    () =>
      new Set(
        flightBoards.flatMap((board) =>
          (Array.isArray(board?.entries) ? board.entries : [])
            .filter((entry) => entry?.isTourFlight && String(entry?.tourRowId || "").trim())
            .map((entry) => String(entry.tourRowId).trim())
        )
      ),
    [flightBoards]
  );
  const footerMetadataItems = schedule?.importSummary
    ? [
        {
          kind: "date",
          label: "Schedule Date",
          value: scheduleDateLabel,
          isCurrent: scheduleDateInfo.isCurrent
        },
        {
          kind: "stat",
          label: "Imported Legs",
          value: formatNumber(schedule.importSummary.importedRows ?? 0)
        },
        { kind: "stat", label: "Logbook Sync", value: logbookLastSyncLabel },
        { kind: "stat", label: "Last Flight Report", value: logbookLastReportLabel }
      ]
    : [];
  const tourSelection = useTourSelection({
    boardedTourRowIds,
    boardedFlightIds,
    deltaVirtualAccomplishmentEligibility,
    deltaVirtualToursCache,
    derivedTourProgress,
    isDevToolsEnabled,
    logbookAirportProgress,
    scheduleView,
    scheduleFlights,
    selectedAccomplishmentName,
    selectedTourPath,
    setSelectedAccomplishmentName,
    setSelectedTourPath,
    setSelectedTourRowId,
    sort,
    tourProgress
  });
  const {
    availableTours,
    selectedTour,
    selectedAccomplishment,
    accomplishmentOptions,
    accomplishmentRows,
    accomplishmentFlightRows,
    accomplishmentFlightSearch,
    accomplishmentFlightSort,
    hasAccomplishmentFlightSearch,
    sortedTourRows,
    activeTourRows,
    tourFlightsByKey,
    handleSelectTourPath,
    handleShowAccomplishmentFlights,
    handleSortAccomplishmentFlights
  } = tourSelection;
  const boardState = useFlightBoards({
    activeFlightBoardId,
    activeTourRows,
    clearSimBriefDispatchStateRef,
    expandedBoardFlightId,
    flightBoards,
    isDevToolsEnabled,
    isScheduleCurrent: !isScheduleOutOfDate,
    schedule,
    scheduleView,
    onOpenStaleScheduleBlocked: handleOpenStaleScheduleBlocked,
    setActiveFlightBoardId,
    setExpandedBoardFlightId,
    setFlightBoards,
    setPlannerControlsCollapsed,
    setStatusMessage,
    setTourProgress,
    simBriefDispatchStateRef,
    tourFlightsByKey
  });
  const {
    activeFlightBoard,
    flightBoard,
    shortlist,
    selectedShortlistFlight,
    updateActiveFlightBoardEntries,
    replaceFlightBoard,
    handleToggleBoardFlight,
    handleAddToFlightBoard,
    handleCompleteTourFlight,
    handleRemoveFromFlightBoard,
    handleReorderFlightBoard,
    handleRepairFlightBoardEntry,
    handleSelectFlightBoard,
    handleCreateFlightBoard,
    handleRenameFlightBoard,
    handleDeleteFlightBoard
  } = boardState;
  const handleToggleAccomplishmentSelectorCollapsed = useCallback((nextCollapsed) => {
    setIsAccomplishmentSelectorCollapsed(nextCollapsed);
  }, []);

  const handleToggleTourSelectorCollapsed = useCallback((nextCollapsed) => {
    setIsTourSelectorCollapsed(nextCollapsed);
  }, []);

  // Opens the transient airport tray from a schedule table DEP/ARR cell.
  const handleSelectAirportInfo = useCallback(({ airportIcao, side, row, sourceView }) => {
    const normalizedAirportIcao = String(airportIcao || "").trim().toUpperCase();

    if (!normalizedAirportIcao) {
      setSelectedAirportInfo(null);
      return;
    }

    const flightCode = String(
      row?.flightCode || row?.tourFlightNumber || row?.flightNumber || ""
    ).trim();
    const from = String(row?.from || "").trim().toUpperCase();
    const to = String(row?.to || "").trim().toUpperCase();
    const routeLabel = from && to ? `${from} → ${to}` : "";

    setSelectedAirportInfo({
      airportIcao: normalizedAirportIcao,
      side: side === "arrival" ? "arrival" : "departure",
      sourceView: String(sourceView || "flights").trim() || "flights",
      flightId: String(row?.flightId || row?.tourRowId || "").trim(),
      flightCode,
      routeLabel
    });
  }, []);

  const handleCloseAirportInfo = useCallback(() => {
    setSelectedAirportInfo(null);
  }, []);

  const handleActivateRow = useCallback(
    (row) => {
      const didAddRow = handleAddToFlightBoard(row);

      // Collapse the active selector panel only after a successful add so duplicate clicks do not hide context.
      if (didAddRow) {
        if (scheduleView === "accomplishments") {
          setIsAccomplishmentSelectorCollapsed(true);
        } else if (scheduleView === "tours") {
          setIsTourSelectorCollapsed(true);
        }
      }
    },
    [
      handleAddToFlightBoard,
      scheduleView,
      setIsAccomplishmentSelectorCollapsed,
      setIsTourSelectorCollapsed
    ]
  );
  useEffect(() => {
    // Accomplishments should always open expanded when the tab becomes active.
    if (scheduleView === "accomplishments") {
      setIsAccomplishmentSelectorCollapsed(false);
    }
  }, [scheduleView, setIsAccomplishmentSelectorCollapsed]);

  useEffect(() => {
    // Tours should always open expanded when the tab becomes active.
    if (scheduleView === "tours") {
      setIsTourSelectorCollapsed(false);
    }
  }, [scheduleView, setIsTourSelectorCollapsed]);

  useEffect(() => {
    if (!flightBoards.length) {
      return;
    }

    if (!activeFlightBoardId || !flightBoards.some((board) => board.id === activeFlightBoardId)) {
      setActiveFlightBoardId(flightBoards[0].id);
    }
  }, [flightBoards, activeFlightBoardId]);

  useEffect(() => {
    let timeoutHandle = null;
    const splash = typeof document !== "undefined" ? document.getElementById("boot-splash") : null;

    if (!isStartupReady) {
      if (typeof document !== "undefined") {
        delete document.body.dataset.appReady;
      }
      if (splash) {
        splash.hidden = false;
      }
      return undefined;
    }

    if (typeof document !== "undefined") {
      document.body.dataset.appReady = "true";
    }

    timeoutHandle = window.setTimeout(() => {
      if (splash) {
        splash.hidden = true;
      }
    }, BOOT_SPLASH_HIDE_DELAY_MS);

    return () => {
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [isStartupReady]);
  useEffect(() => {
    if (!isSettingsOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen, setIsSettingsOpen]);

  useEffect(() => {
    if (!isDvaSyncWarningOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setDvaSyncWarning(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDvaSyncWarningOpen, setDvaSyncWarning]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(DEV_TOOLS_STORAGE_KEY, isDevToolsEnabled ? "true" : "false");
  }, [isDevToolsEnabled]);

  useEffect(() => {
    if (devWindowWidth === null) {
      window.localStorage.removeItem(DEV_WINDOW_WIDTH_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(DEV_WINDOW_WIDTH_STORAGE_KEY, String(devWindowWidth));
  }, [devWindowWidth]);

  useEffect(() => {
    if (!isDevWindowMenuOpen && !isDevContextMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (
        !devWindowMenuRef.current?.contains(event.target) &&
        !devContextMenuRef.current?.contains(event.target)
      ) {
        handleCloseDevContextMenu();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        handleCloseDevContextMenu();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    devContextMenuRef,
    devWindowMenuRef,
    handleCloseDevContextMenu,
    isDevContextMenuOpen,
    isDevWindowMenuOpen
  ]);

  useEffect(() => {
    // Dev mode swaps the browser's default right-click menu for a menu that can open Dev Tools.
    function handleContextMenu(event) {
      event.preventDefault();
      handleOpenDevContextMenu(event);
    }

    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [handleOpenDevContextMenu]);

  useEffect(() => {
    if (!isDevToolsEnabled) {
      handleCloseDevContextMenu();
    }
  }, [handleCloseDevContextMenu, isDevToolsEnabled]);

  useEffect(() => {
    if (!isDesktopAddonScanAvailable || !isWindowsRuntime()) {
      return;
    }

    let cancelled = false;

    // Keep the desktop window pinned above others while dev tools are enabled on Windows.
    const syncAlwaysOnTop = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (cancelled) {
          return;
        }

        await getCurrentWindow().setAlwaysOnTop(isDevToolsEnabled);
      } catch (error) {
        await logAppError("window-always-on-top-sync-failed", error);
      }
    };

    syncAlwaysOnTop();

    return () => {
      cancelled = true;
    };
  }, [isDevToolsEnabled, isDesktopAddonScanAvailable]);

  useEffect(() => {
    setDebugLoggingEnabled(isDevToolsEnabled);
  }, [isDevToolsEnabled]);

  useEffect(() => {
    logAppEvent("start", {
      appSessionId: getAppSessionId(),
      version: APP_BUILD_GIT_TAG
    }).catch(() => {});
  }, []);

  const airlines = useMemo(
    () => selectScheduleAirlines({ flights: scheduleFlights }),
    [scheduleFlights]
  );

  const equipmentOptions = useMemo(() => selectScheduleEquipmentOptions(), []);
  const airportOptions = useMemo(
    () => selectAirportOptions({ flights: scheduleFlights }),
    [scheduleFlights]
  );
  const geoOptions = useMemo(() => selectGeoOptions({ airportOptions }), [airportOptions]);

  const filterBounds = useMemo(() => buildFilterBounds(scheduleFlights), [scheduleFlights]);
  const normalizedDeferredFilters = useMemo(
    () => normalizeFilters(deferredFilters, filterBounds),
    [deferredFilters, filterBounds]
  );
  // VATSIM starts once the app shell is ready so schedule indicators are available immediately.
  const shouldLoadVatsimCoverage = isStartupReady;
  const vatsimCoverage = useVatsimCoverage({
    enabled: shouldLoadVatsimCoverage,
    airportCatalog: airportOptions,
    refreshVersion: vatsimRefreshVersion
  });
  // Treat non-ready snapshots as unknown coverage so VATSIM filters fail closed.
  const activeVatsimCoverageIndex =
    vatsimCoverage.networkState === "ready" ? vatsimCoverage.vatsimCoverageIndex : null;
  const addonAirports = useMemo(() => new Set(addonScan.airports), [addonScan.airports]);
  const addonSetupComplete = addonScan.roots.length > 0 || gettingStartedState.addonSetupSkipped;
  const dutyScheduleBuilder = useDutyScheduleBuilder({
    activeFlightBoardId,
    addonAirports,
    confirmDutyBoardOverwriteInApp,
    dutyFilters,
    filterBounds,
    flightBoards,
    replaceFlightBoard,
    schedule,
    scheduleFlights,
    setDutyFilters,
    setFilters,
    setPendingMapFitToRoute,
    setPendingMapFlightPathViewMode,
    setPlannerControlsCollapsed,
    setPlannerMode,
    setScheduleView,
    setSelectedFlightId,
    setStatusMessage
  });
  const {
    dutyEquipmentOptions,
    dutyOriginAirportOptions,
    dutyBuildWarning,
    clearDutyBuildWarning,
    handleDutyFilterChange,
    handleBuildDutySchedule
  } = dutyScheduleBuilder;

  const basicFilteredFlights = useMemo(() => {
    return selectFilteredScheduleFlights({
      flights: scheduleFlights.filter((flight) => !boardedFlightIds.has(flight.flightId)),
      filters: normalizedDeferredFilters,
      addonAirports,
      vatsimCoverageIndex: activeVatsimCoverageIndex
    });
  }, [
    activeVatsimCoverageIndex,
    addonAirports,
    boardedFlightIds,
    normalizedDeferredFilters,
    scheduleFlights
  ]);

  const sortedFlights = useMemo(() => {
    return selectSortedScheduleFlights({
      flights: basicFilteredFlights,
      sort,
      filters: normalizedDeferredFilters,
      addonAirports
    });
  }, [addonAirports, basicFilteredFlights, normalizedDeferredFilters, sort]);

  const { isImporting, processImportedSchedule } = useScheduleImport({
    activeFlightBoardId,
    basicAdvancedFiltersOpen,
    basicAddonFiltersOpen,
    dutyFilters,
    filters,
    flightBoard,
    flightBoards,
    plannerControlsCollapsed,
    plannerMode,
    scheduleView,
    selectedAccomplishmentName,
    selectedFlightId,
    selectedTourPath,
    setActiveFlightBoardId,
    setDutyFilters,
    setExpandedBoardFlightId,
    setFilterUiVersion,
    setFilters,
    setFlightBoards,
    setPlannerMode,
    setSchedule,
    setSelectedFlightId,
    setSort,
    setStatusMessage,
    sort,
    tourProgress
  });
  const handleVatsimScheduleSyncComplete = useCallback(() => {
    setVatsimRefreshVersion((current) => current + 1);
  }, []);
  const shouldShowGettingStarted =
    hasLoadedGettingStartedState &&
    !isHydrating &&
    !gettingStartedState.gettingStartedDismissed &&
    !gettingStartedState.gettingStartedFinalized;
  const {
    appVersion: whatsNewAppVersion,
    whatsNewCards,
    hasWhatsNewCards,
    shouldShowWhatsNew,
    isWhatsNewOpen,
    whatsNewMode,
    openWhatsNewManually,
    finishWhatsNew,
    closeManualWhatsNew
  } = useWhatsNew({
    isGettingStartedOpen: shouldShowGettingStarted
  });
  const isStartupGateComplete = !shouldShowGettingStarted && !shouldShowWhatsNew;
  const {
    handleCloseDvaSyncWarning,
    handleDeltaVirtualSync,
    handleRefreshDeltaVirtualLogbook,
    handleResetDeltaVirtualSyncSession,
    isSyncing,
    isRefreshingLogbook
  } = useSyncOrchestration({
    deltaVirtualOptions: {
      dvaFirstName,
      dvaHasPassword,
      dvaLastName,
      isDevToolsEnabled,
      onLogbookSyncComplete: () => logbookSyncCompleteRef.current?.(),
      processImportedSchedule,
      onScheduleSyncComplete: handleVatsimScheduleSyncComplete,
      setDerivedTourProgress,
      setDeltaVirtualAccomplishmentEligibility,
      setDeltaVirtualToursCache,
      setDvaHasPassword,
      setDvaSyncWarning,
      setLogbookAirportProgress,
      setStatusMessage
    },
    shouldRunDeferredStartupSync: shouldRunDeferredStartupDvaSync,
    setShouldRunDeferredStartupSync: setShouldRunDeferredStartupDvaSync,
    isStartupGateComplete
  });
  const logbookWorkspace = useLogbookWorkspace({
    persistedUiState: restoredUiState,
    scheduleView,
    viewportWidth: viewportSize.width,
    isSyncing,
    isRefreshingLogbook,
    onRefreshLogbook: handleRefreshDeltaVirtualLogbook
  });
  const {
    isDeletingUserData,
    clearFailure: userDataClearFailure,
    handleDeleteUserData,
    retryUserDataClear,
    reloadAfterUserDataClearFailure
  } = useUserDataLifecycle({
    confirmDelete: confirmDeleteUserDataInApp,
    prepareForUserDataClear: logbookWorkspace.prepareForUserDataClear
  });
  logbookSyncCompleteRef.current = logbookWorkspace.handleSyncComplete;
  const uiStateSnapshot = useMemo(() => ({
      plannerMode,
      filters,
      dutyFilters,
      flightBoards,
      activeFlightBoardId,
      flightBoard,
      plannerControlsCollapsed,
      basicAdvancedFiltersOpen,
      basicAddonFiltersOpen,
      sort,
      selectedFlightId,
      scheduleView,
      selectedTourPath,
      selectedAccomplishmentName,
      mapOptions,
      ...logbookWorkspace.persistedUiState,
      tourProgress
    }), [
      activeFlightBoardId,
      basicAddonFiltersOpen,
      basicAdvancedFiltersOpen,
      dutyFilters,
      filters,
      flightBoard,
      flightBoards,
      logbookWorkspace.persistedUiState,
      mapOptions,
      plannerControlsCollapsed,
      plannerMode,
      scheduleView,
      selectedAccomplishmentName,
      selectedFlightId,
      selectedTourPath,
      sort,
      tourProgress
    ]);
  const handleUiStatePersistenceError = useCallback((error) => {
    setStatusMessage(error instanceof Error ? error.message : "Unable to persist the current planner state.");
  }, []);
  const appUiStatePersistence = useAppUiStatePersistence({
    snapshot: uiStateSnapshot,
    isHydrating,
    flightBoards,
    setMapOptions,
    onError: handleUiStatePersistenceError
  });
  setMapOptionsThroughPersistenceRef.current = appUiStatePersistence.handleSetMapOptions;
  const appDeltaVirtualDraftReport = useDeltaVirtualDraftReport({
    flightBoard,
    isDevToolsEnabled,
    simBriefCustomAirframes,
    setStatusMessage,
    updateActiveFlightBoardEntries
  });
  const appUpdates = useAppUpdates({
    isDesktopAddonScanAvailable,
    isDevToolsEnabled,
    isStartupGateComplete,
    setStatusMessage
  });
  const {
    isCheckingForUpdates,
    availableUpdate,
    isUpdatePromptOpen,
    isNoUpdatePromptOpen,
    handleCheckForUpdates,
    handleCloseUpdatePrompt,
    handleDownloadUpdate
  } = appUpdates;

  function handleFilterChange(key, value) {
    if (
      key === "addonMatchMode" ||
      key === "addonFilterEnabled" ||
      key === "addonPriorityEnabled"
    ) {
      logAppEvent("addon-filter-updated", {
        key,
        value,
        addonMatchMode:
          key === "addonMatchMode" ? value : filters.addonMatchMode,
        addonFilterEnabled:
          key === "addonFilterEnabled" ? value : filters.addonFilterEnabled,
        addonPriorityEnabled:
          key === "addonPriorityEnabled" ? value : filters.addonPriorityEnabled,
        airportsCached: addonScan.airports.length
      }).catch(() => {});
    }

    startTransition(() => {
      setPlannerMode("basic");
      setFilters((current) => {
        if (key === "originIcao") {
          const icao = String(value || "")
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
            .slice(0, 4);
          return {
            ...current,
            origin: icao ? [icao] : []
          };
        }

        if (key === "destinationIcao") {
          const icao = String(value || "")
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
            .slice(0, 4);
          return {
            ...current,
            destination: icao ? [icao] : []
          };
        }

        if (key === "originOrDestinationIcao") {
          const icao = String(value || "")
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
            .slice(0, 4);
          return {
            ...current,
            originOrDestination: icao ? [icao] : []
          };
        }

        if (key === "addonFilterEnabled") {
          const nextEnabled = Boolean(value);
          return {
            ...current,
            addonFilterEnabled: nextEnabled,
            addonPriorityEnabled: nextEnabled ? false : current.addonPriorityEnabled
          };
        }

        if (key === "addonPriorityEnabled") {
          const nextEnabled = Boolean(value);
          return {
            ...current,
            addonFilterEnabled: nextEnabled ? false : current.addonFilterEnabled,
            addonPriorityEnabled: nextEnabled
          };
        }

        return {
          ...current,
          [key]: value
        };
      });
      setDutyFilters(buildDefaultDutyFilters(filterBounds));
    });
  }

  function handleResetFilters() {
    if (plannerMode === "duty") {
      setDutyFilters(buildDefaultDutyFilters(filterBounds));
      setPlannerMode("duty");
    } else {
      setFilters(normalizeFilters(DEFAULT_FILTERS, filterBounds));
      setPlannerMode("basic");
    }
    setFilterUiVersion((current) => current + 1);
  }

  function handlePrimaryViewChange(nextView) {
    if (nextView === "duty") {
      setPlannerMode("duty");
      setSelectedAirportInfo(null);
      return;
    }

    setPlannerMode("basic");
    handleScheduleViewChange(nextView);
  }

  function handleSort(sortKey) {
    if (scheduleView !== "flights") {
      return;
    }

    setSort((current) => {
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

  function handleScheduleViewChange(nextView) {
    let nextScheduleView = "flights";

    if (nextView === "map") {
      nextScheduleView = "map";
    } else if (nextView === "logbook") {
      nextScheduleView = "logbook";
    } else if (nextView === "tours") {
      nextScheduleView = "tours";
    } else if (nextView === "accomplishments") {
      nextScheduleView = "accomplishments";
    }

    setScheduleView(nextScheduleView);
    if (nextScheduleView === "map") {
      setSelectedAirportInfo(null);
    }

    if (nextScheduleView !== "flights") {
      setPlannerControlsCollapsed(true);
    }
  }

  function handleSelectFlight(flightId, clickedRow = null) {
    if (scheduleView === "tours") {
      const nextSelectedTourRowId = String(
        clickedRow?.tourRowId || clickedRow?.flightId || flightId || ""
      ).trim();

      if (isDevToolsEnabled && clickedRow) {
        logAppEvent("tour-row-selected", {
          clickedTourRowId: nextSelectedTourRowId,
          clickedTourRoute: String(clickedRow?.route || "").trim(),
          clickedTourFlight: String(clickedRow?.flightCode || clickedRow?.flightNumber || "").trim(),
          clickedTourLeg: Number.isFinite(clickedRow?.tourLeg)
            ? clickedRow.tourLeg
            : Number.isFinite(clickedRow?.leg)
              ? clickedRow.leg
              : null
        }).catch(() => {});
      }
      setSelectedTourRowId(nextSelectedTourRowId);
      return;
    }

    setSelectedFlightId(flightId);
  }

  async function handleOpenLogFile() {
    try {
      await openAppLogFile();
      await logAppEvent("log-opened");
    } catch (error) {
      setStatusMessage(error.message || "Unable to open the log file.");
      await logAppError("log-open-failed", error);
    }
  }

  async function persistGettingStartedState(nextState) {
    const normalizedState = {
      gettingStartedDismissed: Boolean(nextState?.gettingStartedDismissed),
      gettingStartedFinalized: Boolean(nextState?.gettingStartedFinalized),
      addonSetupSkipped: Boolean(nextState?.addonSetupSkipped)
    };
    await writeGettingStartedState(normalizedState);
    setGettingStartedState(normalizedState);
    return normalizedState;
  }

  function handleSimBriefTypeChange(boardEntryId, nextType) {
    const rawSelection = String(nextType || "").trim();
    const selectedCustomAirframe = findCustomAirframeByInternalId(
      rawSelection,
      simBriefCustomAirframes
    );
    const selectedAircraft = selectedCustomAirframe?.internalId
      ? rawSelection
      : getAircraftDisplayName(rawSelection);
    const nextFlightBoard = flightBoard.map((entry) =>
      entry.boardEntryId === boardEntryId
        ? {
            ...entry,
            selectedAircraft,
            simbriefSelectedType: ""
          }
        : entry
    );
    updateActiveFlightBoardEntries(nextFlightBoard);

    const updatedEntry =
      nextFlightBoard.find((entry) => entry.boardEntryId === boardEntryId) || null;
    if (!updatedEntry || !selectedAircraft) {
      handleCloseSimBriefDispatchBlocked();
      return;
    }

    const dispatchResolution = resolveSimBriefDispatchAircraft(
      {
        ...updatedEntry,
        selectedAircraft
      },
      simBriefCustomAirframes
    );

    if (dispatchResolution.ok) {
      handleCloseSimBriefDispatchBlocked();
      return;
    }

    handleOpenSimBriefDispatchBlocked(dispatchResolution.reason);
  }

  // Updates the board entry's draft network without disturbing the aircraft selection.
  function handleDraftNetworkChange(boardEntryId, nextNetwork) {
    const normalizedDraftNetwork = normalizeDraftNetwork(nextNetwork);

    updateActiveFlightBoardEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.boardEntryId === boardEntryId
          ? {
              ...entry,
              draftNetwork: normalizedDraftNetwork
            }
          : entry
      )
    );
  }

  function normalizeSimBriefPlanForBoardEntry(plan, fallbackStaticId = "") {
    if (!plan || typeof plan !== "object") {
      return null;
    }

    const routePointsSource = Array.isArray(plan.routePoints)
      ? plan.routePoints
      : Array.isArray(plan.route_points)
        ? plan.route_points
        : [];
    const routePoints = routePointsSource
      .map((point) => {
        if (!point || typeof point !== "object") {
          return null;
        }

        const latitude = Number(point.latitude);
        const longitude = Number(point.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }

        return {
          ident: String(point.ident || "").trim(),
          latitude,
          longitude
        };
      })
      .filter(Boolean);
    const aircraftType = String(
      plan.aircraftType ||
        plan.aircraft_type ||
        plan.aircraft?.icao ||
        plan.aircraft?.type ||
        plan.aircraft?.code ||
        plan.aircraft?.name ||
        plan.aircraft ||
        ""
    )
      .trim()
      .toUpperCase();
    const staticId = String(plan.staticId || plan.static_id || fallbackStaticId || "").trim();
    const ofpXmlId = String(plan.ofpXmlId || plan.ofp_xml_id || plan.dvaSimBriefId || "").trim().toUpperCase();
    const aircraft =
      plan.aircraft && typeof plan.aircraft === "object"
        ? { ...plan.aircraft }
        : aircraftType
          ? {
              code: aircraftType,
              icao: aircraftType,
              type: aircraftType,
              name: aircraftType
            }
          : null;

    return {
      status: String(plan.status || "").trim(),
      generatedAtUtc: String(plan.generatedAtUtc || plan.generated_at_utc || "").trim(),
      generated_at_utc: String(plan.generatedAtUtc || plan.generated_at_utc || "").trim(),
      staticId,
      static_id: staticId,
      ofpXmlId,
      ofp_xml_id: ofpXmlId,
      aircraftType,
      aircraft_type: aircraftType,
      aircraft,
      callsign: String(plan.callsign || "").trim(),
      route: String(plan.route || "").trim(),
      cruiseAltitude: String(plan.cruiseAltitude || plan.cruise_altitude || "").trim(),
      alternate: String(plan.alternate || "").trim(),
      ete: String(plan.ete || "").trim(),
      blockFuel: String(plan.blockFuel || plan.block_fuel || "").trim(),
      pax: Number.isInteger(plan.pax) ? plan.pax : Number.isInteger(Number(plan.pax)) ? Number(plan.pax) : null,
      ofpUrl: String(plan.ofpUrl || plan.ofp_url || "").trim(),
      pdfUrl: String(plan.pdfUrl || plan.pdf_url || "").trim(),
      routePoints,
      route_points: routePoints
    };
  }

  // Builds the board-entry shape used by both the live board state and the draft submit payload.
  function buildBoardEntryWithSimBriefPlan(boardEntry, simBriefPlan) {
    const normalizedBoardEntry = normalizeBoardEntry(boardEntry);
    if (!normalizedBoardEntry) {
      return null;
    }

    const normalizedPlan = normalizeSimBriefPlanForBoardEntry(
      simBriefPlan,
      normalizedBoardEntry.simbriefPlan?.staticId || normalizedBoardEntry.simbriefPlan?.static_id || ""
    );
    const existingSelectedAircraft =
      getSelectedAircraftForFlight(normalizedBoardEntry, simBriefCustomAirframes) || "";
    const refreshedSelectedAircraft =
      getAircraftDisplayName(normalizedPlan?.aircraftType) ||
      String(normalizedPlan?.aircraftType || "").trim();
    // Always sync the stored selection to the aircraft that SimBrief returned for the plan.
    const resolvedSelectedAircraft = refreshedSelectedAircraft || existingSelectedAircraft;
    const resolvedPlan = normalizedPlan
      ? {
          ...normalizedPlan,
          aircraftType: resolvedSelectedAircraft,
          aircraft_type: resolvedSelectedAircraft,
          aircraft: resolvedSelectedAircraft
            ? normalizedPlan.aircraft ||
              {
                code: resolvedSelectedAircraft,
                icao: resolvedSelectedAircraft,
                type: resolvedSelectedAircraft,
                name: resolvedSelectedAircraft
              }
            : null
        }
      : null;

    return {
      ...normalizedBoardEntry,
      simbriefPlan: resolvedPlan,
      selectedAircraft: resolvedSelectedAircraft,
      simbriefSelectedType: ""
    };
  }

  // Keeps the stored aircraft selection aligned with the latest imported SimBrief plan.
  function applySimBriefPlanToBoardEntry(boardEntryId, simBriefPlan) {
    const currentBoardEntry =
      flightBoard.find((entry) => entry.boardEntryId === boardEntryId) ||
      selectedShortlistFlight ||
      null;
    const nextBoardEntry = buildBoardEntryWithSimBriefPlan(currentBoardEntry, simBriefPlan);

    if (!nextBoardEntry) {
      return null;
    }

    updateActiveFlightBoardEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.boardEntryId === boardEntryId
          ? nextBoardEntry
          : entry
      )
    );

    return nextBoardEntry;
  }

  const {
    deltaDraftSubmitState,
    deltaDraftDeleteState,
    deltaDraftReportUrlState,
    handleSubmitDeltaVirtualDraftReport,
    handleDeleteDeltaVirtualDraftReport
  } = appDeltaVirtualDraftReport;

  const appSimBriefDispatch = useSimBriefDispatch({
    applySimBriefPlanToBoardEntry,
    flightBoard,
    isDesktopSimBriefAvailable,
    isDevToolsEnabled,
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
    submitDraftReportForBoardEntry: handleSubmitDeltaVirtualDraftReport,
    tourFlightsByKey
  });
  const {
    simBriefDispatchState,
    setSimBriefDispatchState,
    simBriefAircraftTypes,
    isSimBriefAircraftTypesLoading,
    simBriefAircraftTypesError,
    simBriefDispatchOptions: simBriefDispatchOptionsFromHook,
    handleStartSimBriefDispatch,
    handleRegenerateSimBriefDispatch
  } = appSimBriefDispatch;
  useEffect(() => {
    simBriefDispatchStateRef.current = simBriefDispatchState;
  }, [simBriefDispatchState]);

  useEffect(() => {
    clearSimBriefDispatchStateRef.current = () => {
      setSimBriefDispatchState({
        flightId: "",
        isDispatching: false,
        message: ""
      });
    };

    return () => {
      clearSimBriefDispatchStateRef.current = null;
    };
  }, [setSimBriefDispatchState]);

  const simBriefDispatchOptions = simBriefDispatchOptionsFromHook;
  const handleDispatchWorkflow = handleStartSimBriefDispatch;
  const handleRegenerateDispatchWorkflow = handleRegenerateSimBriefDispatch;

  function handleToggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  async function handleFinalizeGettingStarted() {
    try {
      await persistGettingStartedState({
        ...gettingStartedState,
        gettingStartedFinalized: true
      });
      // Queue the startup sync so it runs only after onboarding and What's New gating are complete.
      setShouldRunDeferredStartupDvaSync(true);
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to finalize onboarding.");
      await logAppError("getting-started-finalize-failed", error);
      return false;
    }
  }

  async function handleDismissGettingStarted() {
    try {
      await persistGettingStartedState({
        ...gettingStartedState,
        gettingStartedDismissed: true
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to dismiss onboarding.");
      await logAppError("getting-started-dismiss-failed", error);
      return false;
    }
  }

  // Opens the About > What's New flow without marking the release as completed.
  function handleOpenWhatsNewFromSettings() {
    setIsSettingsOpen(false);
    openWhatsNewManually();
  }

  async function handleFinishWhatsNew() {
    try {
      await finishWhatsNew();
    } catch (error) {
      setStatusMessage(error.message || "Unable to save What's New progress.");
      await logAppError("whats-new-finish-failed", error);
    }
  }

  const settingsTabContent = (
    <AppSettingsContent
      settingsTab={settingsTab}
      addonScan={addonScan}
      addonScanSummary={formatAddonScanSummary(addonScan)}
      isAddonScanBusy={isAddonScanBusy}
      isDesktopAddonScanAvailable={isDesktopAddonScanAvailable}
      onAddAddonRoot={handleAddAddonRoot}
      onRemoveAddonRoot={handleRemoveAddonRoot}
      onScanAddonAirports={handleScanAddonAirports}
      dvaFirstNameDraft={dvaFirstNameDraft}
      dvaLastNameDraft={dvaLastNameDraft}
      dvaPasswordFieldValue={dvaPasswordFieldValue}
      isDvaPasswordDisplayText={isDvaPasswordDisplayText}
      dvaHasPassword={dvaHasPassword}
      isDvaCredentialsSaving={isDvaCredentialsSaving}
      isImporting={isImporting}
      isSyncing={isSyncing || isRefreshingLogbook}
      hasDvaCredentialChanges={hasDvaCredentialChanges}
      onFirstNameChange={setDvaFirstNameDraft}
      onLastNameChange={setDvaLastNameDraft}
      onPasswordChange={setDvaPasswordDraft}
      onPasswordFocus={() => {
        if (isDvaPasswordDisplayText) {
          // Swap the display text for an editable field on first focus.
          setIsDvaPasswordEditing(true);
          setDvaPasswordDraft("");
        }
      }}
      onPasswordBlur={() => setIsDvaPasswordEditing(false)}
      onSaveDeltaVirtualCredentials={handleSaveDeltaVirtualCredentials}
      onClearDeltaVirtualCredentials={handleClearDeltaVirtualCredentials}
      onResetDeltaVirtualSyncSession={handleResetDeltaVirtualSyncSession}
      simBriefUsernameDraft={simBriefUsernameDraft}
      simBriefPilotIdDraft={simBriefPilotIdDraft}
      simBriefUseCurrentUtcForDispatchTime={simBriefUseCurrentUtcForDispatchTime}
      simBriefDispatchUnits={simBriefDispatchUnits}
      simBriefDepartureOffsetMinutes={simBriefDepartureOffsetMinutes}
      simBriefCustomAirframesDraft={simBriefCustomAirframesDraft}
      simBriefCustomAirframeIdDraft={simBriefCustomAirframeIdDraft}
      simBriefCustomAirframeNameDraft={simBriefCustomAirframeNameDraft}
      simBriefCustomAirframeMatchTypeDraft={simBriefCustomAirframeMatchTypeDraft}
      simBriefAircraftTypes={simBriefAircraftTypes}
      isSimBriefAircraftTypesLoading={isSimBriefAircraftTypesLoading}
      simBriefAircraftTypesError={simBriefAircraftTypesError}
      isSimBriefSaving={isSimBriefSaving}
      onUsernameChange={setSimBriefUsernameDraft}
      onPilotIdChange={setSimBriefPilotIdDraft}
      onDispatchUnitsChange={handleSimBriefDispatchUnitsChange}
      onDispatchTimeModeChange={handleSimBriefDispatchTimeModeChange}
      onDepartureOffsetChange={handleSimBriefDepartureOffsetChange}
      onCustomAirframeDraftIdChange={setSimBriefCustomAirframeIdDraft}
      onCustomAirframeDraftNameChange={setSimBriefCustomAirframeNameDraft}
      onCustomAirframeDraftMatchTypeChange={setSimBriefCustomAirframeMatchTypeDraft}
      onAddCustomAirframe={handleAddCustomAirframeDraft}
      onRemoveCustomAirframe={handleRemoveCustomAirframeDraft}
      onSaveSimBriefCredentials={handleSaveSimBriefCredentials}
      isCheckingForUpdates={isCheckingForUpdates}
      onCheckForUpdates={handleCheckForUpdates}
      onOpenLogFile={handleOpenLogFile}
      onToggleDevTools={handleToggleDevTools}
      isDevToolsEnabled={isDevToolsEnabled}
      onDeleteUserData={handleDeleteUserData}
      isDeletingUserData={isDeletingUserData}
      appBuildGitTag={APP_BUILD_GIT_TAG}
      hasWhatsNewCards={hasWhatsNewCards}
      onOpenWhatsNew={handleOpenWhatsNewFromSettings}
    />
  );

  const rightColumnContent = (
    <AppRightColumn
      plannerMode={plannerMode}
      scheduleView={scheduleView}
      isPlannerControlsInlineCollapsed={isPlannerControlsInlineCollapsed}
      filterUiVersion={filterUiVersion}
      filters={filters}
      filterBounds={filterBounds}
      logbookWorkspace={logbookWorkspace.rightPanelProps}
      airlines={airlines}
      airportOptions={airportOptions}
      geoOptions={geoOptions}
      equipmentOptions={equipmentOptions}
      viewportSize={viewportSize}
      onFilterChange={handleFilterChange}
      onTogglePlannerControls={() => setPlannerControlsCollapsed((current) => !current)}
      onResetFilters={handleResetFilters}
      onScheduleViewChange={setScheduleView}
      shortlist={shortlist}
      flightBoards={flightBoards}
      activeFlightBoard={activeFlightBoard}
      expandedBoardFlightId={expandedBoardFlightId}
      selectedAccomplishment={selectedAccomplishment}
      availableTours={availableTours}
      accomplishmentOptions={accomplishmentOptions}
      selectedAccomplishmentName={selectedAccomplishmentName}
      onSelectAccomplishmentName={setSelectedAccomplishmentName}
      selectedAirportInfo={selectedAirportInfo}
      onCloseAirportInfo={handleCloseAirportInfo}
      isAccomplishmentSelectorCollapsed={isAccomplishmentSelectorCollapsed}
      onToggleAccomplishmentSelectorCollapsed={handleToggleAccomplishmentSelectorCollapsed}
      selectedTourPath={selectedTourPath}
      onSelectTourPath={handleSelectTourPath}
      isTourSelectorCollapsed={isTourSelectorCollapsed}
      onToggleTourSelectorCollapsed={handleToggleTourSelectorCollapsed}
      simBriefDispatchState={simBriefDispatchState}
      deltaDraftSubmitState={deltaDraftSubmitState}
      deltaDraftDeleteState={deltaDraftDeleteState}
      deltaDraftReportUrlState={deltaDraftReportUrlState}
      simBriefCredentialsConfigured={simBriefCredentialsConfigured}
      isDesktopSimBriefAvailable={isDesktopSimBriefAvailable}
      simBriefDispatchOptions={simBriefDispatchOptions}
      simBriefCustomAirframes={simBriefCustomAirframes}
      isSimBriefAircraftTypesLoading={isSimBriefAircraftTypesLoading}
      simBriefAircraftTypesError={simBriefAircraftTypesError}
      onToggleBoardFlight={handleToggleBoardFlight}
      onRemoveFromFlightBoard={handleRemoveFromFlightBoard}
      onRepairFlightBoardEntry={handleRepairFlightBoardEntry}
      onReorderFlightBoard={handleReorderFlightBoard}
      onSelectFlightBoard={handleSelectFlightBoard}
      onCreateFlightBoard={handleCreateFlightBoard}
      onRenameFlightBoard={handleRenameFlightBoard}
      onDeleteFlightBoard={handleDeleteFlightBoard}
      onSimBriefTypeChange={handleSimBriefTypeChange}
      onDraftNetworkChange={handleDraftNetworkChange}
      onDispatchWorkflow={handleDispatchWorkflow}
      onRegenerateDispatch={handleRegenerateDispatchWorkflow}
      onOpenSimBriefFlight={handleOpenSimBriefFlight}
      onDraftOnlySubmit={handleSubmitDeltaVirtualDraftReport}
      onDeleteDeltaVirtualDraftReport={handleDeleteDeltaVirtualDraftReport}
      onCompleteTourFlight={handleCompleteTourFlight}
    />
  );

  const addonScanSummary = formatAddonScanSummary(addonScan);
  const handleTogglePlannerControls = () =>
    setPlannerControlsCollapsed((current) => !current);

  const appShellProps = {
    schedule,
    scheduleView,
    logbookProps: logbookWorkspace.mainProps,
    theme,
    flightBoard,
    activeFlightBoard,
    selectedFlightId,
    expandedBoardFlightId,
    pendingMapFlightPathViewMode,
    pendingMapFitToRoute,
    onConsumePendingMapFitToRoute: () => setPendingMapFitToRoute(false),
    setMapOptions: handleSetMapOptions,
    availableTours,
    selectedTourPath,
    selectedTour,
    selectedAccomplishment,
    mapOptions,
    onPrimaryViewChange: handlePrimaryViewChange,
    onSelectTourPath: handleSelectTourPath,
    accomplishmentRows,
    accomplishmentFlightRows,
    accomplishmentFlightSearch,
    accomplishmentFlightSort,
    hasAccomplishmentFlightSearch,
    viewportSize,
    flightRows: sortedFlights,
    sort,
    addonAirports,
    vatsimNetwork: vatsimCoverage,
    tourRows: sortedTourRows,
    selectedTourRowId,
    tourSyncMessage: deltaVirtualToursCache?.message || "",
    onShowAccomplishmentFlights: handleShowAccomplishmentFlights,
    onSortAccomplishmentFlights: handleSortAccomplishmentFlights,
    onSortFlights: handleSort,
    onAirportSelect: handleSelectAirportInfo,
    onSelectRow: handleSelectFlight,
    onActivateRow: handleActivateRow,
    plannerMode,
    dutyFilters,
    airlines,
    regionOptions: geoOptions.regions,
    countryOptions: geoOptions.countries,
    dutyEquipmentOptions,
    dutyOriginAirportOptions,
    filterBounds,
    onDutyFilterChange: handleDutyFilterChange,
    onBuildDutySchedule: handleBuildDutySchedule,
    onReset: handleResetFilters,
    dutyBuildWarning,
    onClearDutyBuildWarning: clearDutyBuildWarning,
    rightColumnContent,
    footerMetadataItems,
    isDevToolsEnabled,
    isDesktopAddonScanAvailable,
    availableUpdate,
    appBuildGitTag: APP_BUILD_GIT_TAG,
    selectedDevWindowPreset,
      topbarTitle,
      syncButtonLabel,
      devWindowMenuRef,
      isDevWindowMenuOpen,
      onToggleDevWindowMenu: handleToggleDevWindowMenu,
    devWindowWidth,
    devWindowWidthPresets,
    onSelectDevWindowWidth: handleSelectDevWindowWidth,
    onOpenReleasePage: handleDownloadUpdate,
    onDownloadUpdate: handleDownloadUpdate,
    isDevContextMenuOpen,
    devContextMenuRef,
    devContextMenuPosition,
    onOpenMainDevtools: handleOpenMainDevtools,
    isSettingsOpen,
    onCloseSettings: handleCloseSettings,
    settingsTab,
    onSetSettingsTab: setSettingsTab,
    settingsTabContent,
    isReadmeOpen,
    onCloseReadme: handleCloseReadme,
    shouldShowGettingStarted,
    dvaCredentialsConfigured,
    simBriefCredentialsConfigured,
    addonSetupComplete,
    onFinalizeGettingStarted: handleFinalizeGettingStarted,
    onDismissGettingStarted: handleDismissGettingStarted,
    isWhatsNewOpen,
    whatsNewMode,
    whatsNewCards,
    whatsNewAppVersion,
    onFinishWhatsNew: handleFinishWhatsNew,
    onCloseManualWhatsNew: closeManualWhatsNew,
    dvaFirstNameDraft,
    dvaLastNameDraft,
    dvaPasswordFieldValue,
    isDvaPasswordDisplayText,
    dvaHasPassword,
    isDvaCredentialsSaving,
    isImporting,
    isSyncing,
    isRefreshingLogbook,
    hasDvaCredentialChanges,
    onDvaFirstNameDraftChange: setDvaFirstNameDraft,
    onDvaLastNameDraftChange: setDvaLastNameDraft,
    onDvaPasswordDraftChange: setDvaPasswordDraft,
    isDvaPasswordEditing,
    onDvaPasswordEditingChange: setIsDvaPasswordEditing,
    onSaveDeltaVirtualCredentials: handleSaveDeltaVirtualCredentials,
    onClearDeltaVirtualCredentials: handleClearDeltaVirtualCredentials,
    simBriefUsernameDraft,
    simBriefPilotIdDraft,
    simBriefUseCurrentUtcForDispatchTime,
    simBriefDispatchUnits,
    simBriefDepartureOffsetMinutes,
    simBriefCustomAirframesDraft,
    simBriefCustomAirframeIdDraft,
    simBriefCustomAirframeNameDraft,
    simBriefCustomAirframeMatchTypeDraft,
    simBriefAircraftTypes,
    isSimBriefAircraftTypesLoading,
    simBriefAircraftTypesError,
    isSimBriefSaving,
    onSimBriefUsernameDraftChange: setSimBriefUsernameDraft,
    onSimBriefPilotIdDraftChange: setSimBriefPilotIdDraft,
    onSimBriefDispatchUnitsChange: handleSimBriefDispatchUnitsChange,
    onSimBriefDispatchTimeModeChange: handleSimBriefDispatchTimeModeChange,
    onSimBriefDepartureOffsetChange: handleSimBriefDepartureOffsetChange,
    onSimBriefCustomAirframeIdDraftChange: setSimBriefCustomAirframeIdDraft,
    onSimBriefCustomAirframeNameDraftChange: setSimBriefCustomAirframeNameDraft,
    onSimBriefCustomAirframeMatchTypeDraftChange: setSimBriefCustomAirframeMatchTypeDraft,
    onAddCustomAirframeDraft: handleAddCustomAirframeDraft,
    onRemoveCustomAirframeDraft: handleRemoveCustomAirframeDraft,
    onSaveSimBriefCredentials: handleSaveSimBriefCredentials,
    addonScan,
    addonScanSummary,
    isAddonScanBusy,
    isDesktopSimBriefAvailable,
    onAddAddonRoot: handleAddAddonRoot,
    onRemoveAddonRoot: handleRemoveAddonRoot,
    onSkipAddonSetup: handleSkipAddonSetup,
    isDeleteUserDataConfirmOpen,
    onResolveDeleteUserDataConfirmation: resolveDeleteUserDataConfirmation,
    userDataClearFailure,
    onRetryUserDataClear: retryUserDataClear,
    onReloadAfterUserDataClearFailure: reloadAfterUserDataClearFailure,
    isDutyBoardOverwriteConfirmOpen,
    onResolveDutyBoardOverwriteConfirmation: resolveDutyBoardOverwriteConfirmation,
    isSimBriefDispatchBlockedOpen,
    simBriefDispatchBlockedMessage,
    onCloseSimBriefDispatchBlocked: handleCloseSimBriefDispatchBlocked,
    isStaleScheduleBlockedOpen,
    onCloseStaleScheduleBlocked: handleCloseStaleScheduleBlocked,
    onSyncStaleSchedule: handleDeltaVirtualSync,
    isUpdatePromptOpen,
    isNoUpdatePromptOpen,
    onCloseUpdatePrompt: handleCloseUpdatePrompt,
    isAddonAutoScanning,
    dvaSyncWarning,
    isDvaSyncWarningOpen,
    onCloseDvaSyncWarning: handleCloseDvaSyncWarning,
    onOpenDeltaVirtualSettings: handleOpenDeltaVirtualSettings,
    handleDeltaVirtualSync,
    onToggleTheme: handleToggleTheme,
    onToggleSettings: handleToggleSettings,
    onToggleReadme: handleToggleReadme,
    handleTogglePlannerControls,
    isPlannerControlsInlineCollapsed
  };

  return <AppShell {...appShellProps} />;
}
