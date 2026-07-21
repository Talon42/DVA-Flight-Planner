// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppBootstrap } from "./useAppBootstrap.hooks.js";

const storage = vi.hoisted(() => ({
  readDeltaVirtualTourProgress: vi.fn(),
  readDeltaVirtualToursCache: vi.fn(),
  readGettingStartedState: vi.fn(),
  readSavedSchedule: vi.fn(),
  readSavedUiState: vi.fn(),
  readSimBriefSettings: vi.fn()
}));
const readAddonAirportCache = vi.hoisted(() => vi.fn());
const deltaVirtual = vi.hoisted(() => ({
  readDeltaVirtualAccomplishmentEligibility: vi.fn(),
  readDeltaVirtualLogbookProgress: vi.fn()
}));
const readDeltaVirtualCredentials = vi.hoisted(() => vi.fn());
const normalizeSimBriefCustomAirframe = vi.hoisted(() => vi.fn((entry) => entry));
const logging = vi.hoisted(() => ({
  logAppError: vi.fn(),
  logAppEvent: vi.fn(),
  logSystemError: vi.fn(),
  logSystemEvent: vi.fn()
}));
const installGlobalErrorLogging = vi.hoisted(() => vi.fn());

vi.mock("../services/storage/storage.js", () => storage);
vi.mock("../services/tauri/addonAirportScan.client.js", () => ({ readAddonAirportCache }));
vi.mock("../services/tauri/deltaVirtual.client.js", () => deltaVirtual);
vi.mock("../services/tauri/deltaVirtualCredentials.client.js", () => ({
  readDeltaVirtualCredentials
}));
vi.mock("../services/tauri/simbrief.client.js", () => ({ normalizeSimBriefCustomAirframe }));
vi.mock("../services/logging/appLog.client.js", () => logging);
vi.mock("../services/logging/globalError.client.js", () => ({ installGlobalErrorLogging }));

const EMPTY_LOGBOOK_PROGRESS = {
  dateIso: null,
  lastSyncAt: null,
  visitedAirports: [],
  arrivalAirports: []
};

function createSetters() {
  return Object.fromEntries(
    [
      "setActiveFlightBoardId",
      "setBasicAddonFiltersOpen",
      "setBasicAdvancedFiltersOpen",
      "setAddonScan",
      "setDutyFilters",
      "setDvaFirstName",
      "setDvaFirstNameDraft",
      "setDvaHasPassword",
      "setDvaLastName",
      "setDvaLastNameDraft",
      "setIsDvaPasswordEditing",
      "setDerivedTourProgress",
      "setDeltaVirtualToursCache",
      "setDeltaVirtualAccomplishmentEligibility",
      "setFilters",
      "setFlightBoards",
      "setGettingStartedState",
      "setHasLoadedGettingStartedState",
      "setPlannerControlsCollapsed",
      "setPlannerMode",
      "setSchedule",
      "setScheduleView",
      "setSelectedAccomplishmentName",
      "setSelectedFlightId",
      "setSelectedTourPath",
      "setSelectedTourRowId",
      "setSort",
      "setStatusMessage",
      "setLogbookAirportProgress",
      "setMapOptions",
      "setSimBriefDepartureOffsetMinutes",
      "setSavedSimBriefDispatchUnits",
      "setSavedSimBriefDepartureOffsetMinutes",
      "setSimBriefCustomAirframes",
      "setSimBriefCustomAirframesDraft",
      "setSimBriefDispatchUnits",
      "setSimBriefPilotId",
      "setSimBriefPilotIdDraft",
      "setSimBriefUsername",
      "setSimBriefUsernameDraft",
      "setSimBriefUseCurrentUtcForDispatchTime",
      "setTourProgress"
    ].map((name) => [name, vi.fn()])
  );
}

function renderBootstrap(setters) {
  return renderHook(() =>
    useAppBootstrap({
      ...setters,
      activeFlightBoardId: "",
      deferredDutyFilters: {},
      deferredFilters: {},
      dutyFilters: {},
      filters: {},
      flightBoards: [],
      schedule: null
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const logger of Object.values(logging)) {
    logger.mockResolvedValue(undefined);
  }

  storage.readSavedSchedule.mockResolvedValue(null);
  storage.readSavedUiState.mockResolvedValue(null);
  storage.readSimBriefSettings.mockResolvedValue({});
  storage.readGettingStartedState.mockResolvedValue({});
  storage.readDeltaVirtualTourProgress.mockResolvedValue({ tourProgress: {}, lastSyncAt: null });
  storage.readDeltaVirtualToursCache.mockResolvedValue(null);
  readAddonAirportCache.mockResolvedValue({ status: "idle", airports: [], warnings: [] });
  deltaVirtual.readDeltaVirtualAccomplishmentEligibility.mockResolvedValue({
    lastSyncAt: null,
    sourceUrl: null,
    rows: []
  });
  deltaVirtual.readDeltaVirtualLogbookProgress.mockResolvedValue(EMPTY_LOGBOOK_PROGRESS);
  readDeltaVirtualCredentials.mockResolvedValue({ firstName: "", lastName: "", hasPassword: false });
});

describe("useAppBootstrap", () => {
  it("hydrates the saved schedule, board, settings, and cached DVA state", async () => {
    const flight = {
      flightId: "flight-1",
      flightCode: "DL100",
      airline: "DL",
      airlineIcao: "DAL",
      from: "KATL",
      to: "KJFK",
      blockMinutes: 120,
      distanceNm: 760,
      stdLocal: "2026-07-21T08:00:00"
    };
    storage.readSavedSchedule.mockResolvedValue({
      importedAt: "2026-07-21T12:00:00Z",
      flights: [flight],
      importSummary: { sourceFileName: "sanitized-schedule.xml" }
    });
    storage.readSavedUiState.mockResolvedValue({
      activeFlightBoardId: "board-1",
      flightBoards: [
        {
          id: "board-1",
          name: "Saved Board",
          entries: [
            {
              boardEntryId: "entry-1",
              linkedFlightId: "flight-1",
              flightId: "flight-1",
              flightCode: "DL100",
              airline: "DL",
              from: "KATL",
              to: "KJFK"
            }
          ]
        }
      ],
      filters: { airline: ["Delta Air Lines"] },
      dutyFilters: { selectedAirline: "Delta Air Lines" },
      plannerMode: "duty",
      scheduleView: "flights",
      selectedTourPath: "dva:42",
      selectedAccomplishmentName: "World Traveler",
      selectedFlightId: "flight-1",
      plannerControlsCollapsed: true,
      mapOptions: { radarEnabled: true },
      tourProgress: { "dva:42": { rows: {} } }
    });
    readDeltaVirtualCredentials.mockResolvedValue({
      firstName: "Jane",
      lastName: "Pilot",
      hasPassword: true
    });
    storage.readSimBriefSettings.mockResolvedValue({
      username: "navigator",
      pilotId: "123456",
      useCurrentUtcForDispatchTime: true,
      dispatchUnits: "KGS",
      departureOffsetMinutes: 45,
      customAirframes: [{ internalId: "custom-1", matchAircraft: "B737-800" }]
    });
    const addonCache = { status: "complete", airports: ["KATL"], warnings: [] };
    const eligibility = { lastSyncAt: "fixture", sourceUrl: "fixture", rows: [{ name: "A" }] };
    const logbookProgress = {
      dateIso: "2026-07-21",
      lastSyncAt: "fixture",
      visitedAirports: ["KATL"],
      arrivalAirports: ["KJFK"]
    };
    const tourProgress = { tourProgress: { "dva:42": { rows: {} } }, lastSyncAt: "fixture" };
    const toursCache = { tours: [{ id: "dva:42", name: "Tour" }] };
    readAddonAirportCache.mockResolvedValue(addonCache);
    deltaVirtual.readDeltaVirtualAccomplishmentEligibility.mockResolvedValue(eligibility);
    deltaVirtual.readDeltaVirtualLogbookProgress.mockResolvedValue(logbookProgress);
    storage.readDeltaVirtualTourProgress.mockResolvedValue(tourProgress);
    storage.readDeltaVirtualToursCache.mockResolvedValue(toursCache);
    storage.readGettingStartedState.mockResolvedValue({
      gettingStartedDismissed: true,
      gettingStartedFinalized: true,
      addonSetupSkipped: false
    });
    const setters = createSetters();
    const { result } = renderBootstrap(setters);

    await waitFor(() => expect(result.current.isHydrating).toBe(false));

    expect(result.current.isStartupReady).toBe(true);
    expect(installGlobalErrorLogging).toHaveBeenCalledOnce();
    expect(setters.setSchedule).toHaveBeenCalledWith({
      importedAt: "2026-07-21T12:00:00Z",
      flights: [flight],
      importSummary: { sourceFileName: "sanitized-schedule.xml" }
    });
    expect(setters.setFlightBoards).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "board-1",
        name: "Saved Board",
        entries: [expect.objectContaining({ boardEntryId: "entry-1", isStale: false })]
      })
    ]);
    expect(setters.setActiveFlightBoardId).toHaveBeenCalledWith("board-1");
    expect(setters.setPlannerMode).toHaveBeenCalledWith("duty");
    expect(setters.setSelectedFlightId).toHaveBeenCalledWith("flight-1");
    expect(setters.setDvaFirstName).toHaveBeenCalledWith("Jane");
    expect(setters.setDvaLastName).toHaveBeenCalledWith("Pilot");
    expect(setters.setDvaHasPassword).toHaveBeenCalledWith(true);
    expect(setters.setSimBriefUsername).toHaveBeenCalledWith("navigator");
    expect(setters.setSimBriefPilotId).toHaveBeenCalledWith("123456");
    expect(setters.setSimBriefDispatchUnits).toHaveBeenCalledWith("KGS");
    expect(setters.setSimBriefDepartureOffsetMinutes).toHaveBeenCalledWith(45);
    expect(setters.setAddonScan).toHaveBeenCalledWith(addonCache);
    expect(setters.setDeltaVirtualAccomplishmentEligibility).toHaveBeenCalledWith(eligibility);
    expect(setters.setLogbookAirportProgress).toHaveBeenCalledWith(logbookProgress);
    expect(setters.setDerivedTourProgress).toHaveBeenCalledWith(tourProgress);
    expect(setters.setDeltaVirtualToursCache).toHaveBeenCalledWith(toursCache);
    expect(setters.setHasLoadedGettingStartedState).toHaveBeenCalledWith(true);
  });

  it("settles startup with safe fallbacks when persisted sources fail", async () => {
    storage.readSavedSchedule.mockRejectedValue(new Error("schedule unavailable"));
    storage.readSavedUiState.mockResolvedValue({
      scheduleView: "logbook",
      mapOptions: { labelsEnabled: false }
    });
    storage.readSimBriefSettings.mockRejectedValue(new Error("settings unavailable"));
    storage.readGettingStartedState.mockRejectedValue(new Error("onboarding unavailable"));
    storage.readDeltaVirtualTourProgress.mockRejectedValue(new Error("progress unavailable"));
    storage.readDeltaVirtualToursCache.mockRejectedValue(new Error("tours unavailable"));
    readDeltaVirtualCredentials.mockRejectedValue(new Error("credentials unavailable"));
    readAddonAirportCache.mockRejectedValue(new Error("addon cache unavailable"));
    deltaVirtual.readDeltaVirtualAccomplishmentEligibility.mockRejectedValue(
      new Error("eligibility unavailable")
    );
    deltaVirtual.readDeltaVirtualLogbookProgress.mockRejectedValue(
      new Error("logbook progress unavailable")
    );
    const setters = createSetters();
    const { result } = renderBootstrap(setters);

    await waitFor(() => expect(result.current.isHydrating).toBe(false));

    expect(result.current.isStartupReady).toBe(true);
    expect(setters.setScheduleView).toHaveBeenCalledWith("logbook");
    expect(setters.setMapOptions).toHaveBeenCalledWith(
      expect.objectContaining({ labelsEnabled: false })
    );
    expect(setters.setStatusMessage).toHaveBeenCalledWith("schedule unavailable");
    expect(setters.setGettingStartedState).toHaveBeenCalledWith({
      gettingStartedDismissed: false,
      gettingStartedFinalized: false,
      addonSetupSkipped: false
    });
    expect(setters.setHasLoadedGettingStartedState).toHaveBeenCalledWith(true);
    expect(setters.setDeltaVirtualToursCache).toHaveBeenCalledWith(null);
    expect(logging.logAppError).toHaveBeenCalled();
    expect(logging.logSystemError).toHaveBeenCalled();
  });
});
