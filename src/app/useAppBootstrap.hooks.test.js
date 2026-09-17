import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  savedUiState: {}
}));

vi.mock("react", () => ({
  useEffect: (effect) => effect(),
  useRef: (value) => ({ current: value }),
  useState: (initialValue) => [initialValue, vi.fn()]
}));

vi.mock("../services/logging/appLog.client.js", () => ({
  logAppError: vi.fn(async () => {}),
  logAppEvent: vi.fn(async () => {}),
  logSystemError: vi.fn(async () => {}),
  logSystemEvent: vi.fn(async () => {})
}));

vi.mock("../services/logging/globalError.client.js", () => ({
  installGlobalErrorLogging: vi.fn()
}));

vi.mock("../services/storage/storage.js", () => ({
  readDeltaVirtualTourProgress: vi.fn(async () => ({})),
  readDeltaVirtualToursCache: vi.fn(async () => null),
  readGettingStartedState: vi.fn(async () => ({})),
  readSavedSchedule: vi.fn(async () => ({
    importedAt: "2026-09-17T12:00:00.000Z",
    scheduleMetadata: null,
    importSummary: { sourceFileName: "saved-schedule.xml" },
    flights: [
      {
        flightId: "DL-1-1",
        airline: "DAL",
        flightNumber: "1",
        from: "KATL",
        to: "KJFK",
        blockMinutes: 120,
        distanceNm: 650,
        equipmentType: "B738"
      }
    ]
  })),
  readSavedUiState: vi.fn(async () => testState.savedUiState),
  readSimBriefSettings: vi.fn(async () => ({}))
}));

vi.mock("../services/tauri/addonAirportScan.client.js", () => ({
  readAddonAirportCache: vi.fn(async () => ({ airports: [], status: "idle" }))
}));

vi.mock("../services/tauri/deltaVirtual.client.js", () => ({
  readDeltaVirtualAccomplishmentEligibility: vi.fn(async () => null),
  readDeltaVirtualLogbookProgress: vi.fn(async () => null)
}));

vi.mock("../services/tauri/deltaVirtualCredentials.client.js", () => ({
  readDeltaVirtualCredentials: vi.fn(async () => null)
}));

vi.mock("../services/tauri/simbrief.client.js", () => ({
  normalizeSimBriefCustomAirframe: vi.fn((value) => value)
}));

import { logAppError, logAppEvent } from "../services/logging/appLog.client.js";
import { useAppBootstrap } from "./useAppBootstrap.hooks.js";

const SETTER_NAMES = [
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
  "setSavedSimBriefDispatchUnits",
  "setSimBriefCustomAirframes",
  "setSimBriefCustomAirframesDraft",
  "setSimBriefDispatchUnits",
  "setSimBriefPilotId",
  "setSimBriefPilotIdDraft",
  "setSimBriefUsername",
  "setSimBriefUsernameDraft",
  "setSimBriefUseCurrentUtcForDispatchTime",
  "setTourProgress"
];

function buildBootstrapProps() {
  const setters = Object.fromEntries(SETTER_NAMES.map((name) => [name, vi.fn()]));
  const filters = {};

  return {
    ...setters,
    activeFlightBoardId: "",
    deferredDutyFilters: filters,
    deferredFilters: filters,
    dutyFilters: filters,
    filters,
    flightBoards: [],
    schedule: null
  };
}

async function flushHydration() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

describe("useAppBootstrap saved schedule hydration", () => {
  beforeEach(() => {
    testState.savedUiState = {};
    vi.clearAllMocks();
  });

  it.each(["utc", "local"])(
    "completes startup hydration with legacy display mode %s ignored",
    async (scheduleTableTimeDisplayMode) => {
      testState.savedUiState = { scheduleTableTimeDisplayMode };
      const props = buildBootstrapProps();

      useAppBootstrap(props);
      await flushHydration();

      expect(props.setSchedule).toHaveBeenCalledOnce();
      expect(logAppEvent).toHaveBeenCalledWith(
        "hydrate-succeeded",
        expect.objectContaining({ flights: 1 })
      );
      expect(logAppError).not.toHaveBeenCalledWith(
        "hydrate-unhandled-failed",
        expect.anything(),
        expect.anything()
      );
    }
  );
});
