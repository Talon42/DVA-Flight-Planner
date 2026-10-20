// @vitest-environment jsdom
import { useState } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import scheduleFixture from "../../../test-fixtures/schedules/representative-search-response.json";
import { useDeltaVirtualSync } from "./useDeltaVirtualSync.hooks.js";
import { useScheduleImport } from "../schedule/useScheduleImport.hooks.js";
import { useAppBootstrap } from "../../app/useAppBootstrap.hooks.js";
import { parseScheduleImport } from "../../services/workers/parseSchedule.js";
import { readSavedSchedule } from "../../services/storage/storage.js";

const invokeAppCommand = vi.hoisted(() => vi.fn());
vi.mock("../../services/tauri/invoke.client.js", () => ({ invokeAppCommand }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));
vi.mock("../../services/logging/appLog.client.js", () => ({
  createLogRunId: (prefix) => `${prefix}-contract`,
  logAppDebug: vi.fn(), logAppError: vi.fn(), logAppEvent: vi.fn(),
  logSystemError: vi.fn(), logSystemEvent: vi.fn(), logSystemWarn: vi.fn()
}));
vi.mock("../../services/logging/globalError.client.js", () => ({
  installGlobalErrorLogging: vi.fn()
}));

const scheduleText = JSON.stringify(scheduleFixture);
const progress = {
  dateIso: "2026-10-20", lastSyncAt: "2026-10-20T12:00:00Z",
  visitedAirports: ["KATL", "KJFK"], arrivalAirports: ["KJFK"]
};
let files;
let response;

// jsdom has no Worker; preserve its message contract and execute the real parser.
class ParserWorker {
  postMessage(message) {
    queueMicrotask(() => {
      try {
        const payload = parseScheduleImport(message.fileName, message.scheduleText);
        this.onmessage({ data: { type: "success", payload } });
      } catch (error) {
        this.onmessage({ data: { type: "error", error: error.message } });
      }
    });
  }
  terminate() {}
}

function createCallbacks() {
  return Object.fromEntries([
    "onScheduleSyncComplete", "onLogbookSyncComplete", "setDvaHasPassword",
    "setDvaSyncWarning", "setLogbookAirportProgress", "setStatusMessage",
    "setDeltaVirtualAccomplishmentEligibility", "setDeltaVirtualToursCache",
    "setDerivedTourProgress"
  ].map((name) => [name, vi.fn()]));
}

// Join the production hooks directly so a renamed or dropped payload field breaks the test.
function useSyncHandoff(callbacks) {
  const [schedule, setSchedule] = useState(null);
  const importer = useScheduleImport({ setSchedule });
  const sync = useDeltaVirtualSync({
    ...callbacks, dvaFirstName: "Example", dvaLastName: "Pilot", dvaHasPassword: true,
    processImportedSchedule: importer.processImportedSchedule
  });
  return { ...sync, schedule, isImporting: importer.isImporting };
}

beforeEach(() => {
  files = new Map();
  response = {
    fileName: "deltava-schedule.json", scheduleText,
    logbookJson: { fileName: "logbook.json", bytes: 100 }, warnings: []
  };
  window.__TAURI_INTERNALS__ = {};
  vi.stubGlobal("Worker", ParserWorker);
  invokeAppCommand.mockReset();
  invokeAppCommand.mockImplementation(async (command, args) => {
    switch (command) {
      case "start_deltava_sync": return response;
      case "refresh_deltava_logbook": return {
        logbookJson: { fileName: "logbook.json", bytes: 100 },
        scheduleStatus: "skipped", logbookStatus: "success"
      };
      case "read_app_storage_file": return files.get(args.key) ?? null;
      case "write_app_storage_file": files.set(args.key, args.contents); return;
      case "read_deltava_auth_settings": return {
        firstName: "Example", lastName: "Pilot", hasPassword: true
      };
      case "read_deltava_logbook_progress": return progress;
      case "read_deltava_accomplishment_eligibility": return { rows: [] };
      case "sync_delta_virtual_tours": return { ok: true, tours: [], failedTourIds: [] };
      case "read_addon_airport_cache": return { airports: [] };
      case "close_deltava_sync_window":
      case "prune_deltava_storage": return;
      default: throw new Error(`Unexpected IPC command: ${command}`);
    }
  });
});

afterEach(() => {
  delete window.__TAURI_INTERNALS__;
  vi.unstubAllGlobals();
});

async function syncSuccessfully() {
  const callbacks = createCallbacks();
  const hook = renderHook(() => useSyncHandoff(callbacks));
  await act(() => hook.result.current.handleDeltaVirtualSync());
  expect(hook.result.current.schedule?.flights).toHaveLength(251);
  return { ...hook, callbacks };
}

describe("DVA sync handoff contract", () => {
  it.each(["camelCase", "snake_case"])("imports and persists the %s IPC response", async (shape) => {
    if (shape === "snake_case") {
      response = { file_name: response.fileName, schedule_text: scheduleText,
        logbook_json: response.logbookJson, warnings: [] };
    }
    const { result, callbacks } = await syncSuccessfully();
    expect(invokeAppCommand).toHaveBeenCalledWith("start_deltava_sync", {
      syncRunId: "sync-contract", debugEnabled: false
    });
    expect(result.current.schedule.flights[0]).toMatchObject({ from: "KATL", to: "KJFK" });
    const saved = await readSavedSchedule();
    expect(saved.flights).toHaveLength(251);
    expect(saved.scheduleMetadata.sources).toEqual(scheduleFixture.sources);
    expect(saved.importSummary.source).toBe("deltava-sync");
    expect(callbacks.onScheduleSyncComplete).toHaveBeenCalledOnce();
    expect(callbacks.setLogbookAirportProgress).toHaveBeenCalledWith(progress);
    expect(invokeAppCommand).toHaveBeenCalledWith("prune_deltava_storage",
      { removeDownloadedSchedule: true }, expect.anything());
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.isImporting).toBe(false);
  });

  it("keeps the saved schedule and reloads logbook state after partial success", async () => {
    const { result, callbacks } = await syncSuccessfully();
    const saved = files.get("savedSchedule");
    vi.clearAllMocks();
    response = { scheduleText: null, fileName: null, logbookJson: { fileName: "logbook.json" },
      warnings: ["Schedule unavailable"] };
    await act(() => result.current.handleDeltaVirtualSync());
    expect(files.get("savedSchedule")).toBe(saved);
    expect(callbacks.onScheduleSyncComplete).not.toHaveBeenCalled();
    expect(callbacks.onLogbookSyncComplete).toHaveBeenCalledOnce();
    expect(callbacks.setLogbookAirportProgress).toHaveBeenCalledWith(progress);
    expect(callbacks.setDvaSyncWarning).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sync_failed", detail: expect.stringContaining("Logbook JSON was saved") })
    );
    expect(invokeAppCommand).toHaveBeenCalledWith("prune_deltava_storage",
      { removeDownloadedSchedule: false }, expect.anything());
    expect(result.current.isSyncing).toBe(false);
  });

  it("imports the schedule when logbook download fails and exposes the warning", async () => {
    response.logbookJson = null;
    response.warnings = ["Logbook JSON download failed; previous cache preserved."];
    const { callbacks } = await syncSuccessfully();
    expect(callbacks.onScheduleSyncComplete).toHaveBeenCalledOnce();
    expect(callbacks.setLogbookAirportProgress).toHaveBeenCalledWith(progress);
    expect(callbacks.setStatusMessage).toHaveBeenCalledWith(
      `Delta Virtual schedule synced with warning: ${response.warnings[0]}`
    );
    expect((await readSavedSchedule()).flights).toHaveLength(251);
  });

  it.each([
    ["obsolete XML field", { xmlText: "<SCHEDULE />" }],
    ["malformed JSON", { scheduleText: "{broken" }],
    ["foreign JSON object", { scheduleText: '{"error":"Unavailable"}' }],
    ["non-object JSON", { scheduleText: "null" }]
  ])("rejects %s without overwriting a saved schedule and permits retry", async (_name, payload) => {
    const { result, callbacks } = await syncSuccessfully();
    const saved = files.get("savedSchedule");
    const originalResponse = response;
    vi.clearAllMocks();
    response = { fileName: "deltava-schedule.json", ...payload };
    await act(() => result.current.handleDeltaVirtualSync());
    expect(files.get("savedSchedule")).toBe(saved);
    expect(callbacks.onScheduleSyncComplete).not.toHaveBeenCalled();
    expect(callbacks.setDvaSyncWarning).toHaveBeenCalledWith(expect.objectContaining({ kind: "sync_failed" }));
    expect(invokeAppCommand).toHaveBeenCalledWith("prune_deltava_storage",
      { removeDownloadedSchedule: false }, expect.anything());
    expect(result.current.isSyncing).toBe(false);
    expect(result.current.isImporting).toBe(false);
    response = originalResponse;
    await act(() => result.current.handleDeltaVirtualSync());
    expect(callbacks.onScheduleSyncComplete).toHaveBeenCalledOnce();
  });

  it("refreshes the logbook without importing or replacing the saved schedule", async () => {
    const { result, callbacks } = await syncSuccessfully();
    const saved = files.get("savedSchedule");
    vi.clearAllMocks();
    await act(() => result.current.handleRefreshDeltaVirtualLogbook());
    expect(invokeAppCommand).toHaveBeenCalledWith("refresh_deltava_logbook", {
      syncRunId: "logbook-refresh-contract", debugEnabled: false
    });
    expect(invokeAppCommand.mock.calls.map(([command]) => command)).not.toContain("start_deltava_sync");
    expect(invokeAppCommand.mock.calls.map(([command]) => command)).not.toContain("write_app_storage_file");
    expect(files.get("savedSchedule")).toBe(saved);
    expect(callbacks.onScheduleSyncComplete).not.toHaveBeenCalled();
    expect(callbacks.onLogbookSyncComplete).toHaveBeenCalledOnce();
    expect(callbacks.setLogbookAirportProgress).toHaveBeenCalledWith(progress);
    expect(result.current.isRefreshingLogbook).toBe(false);
  });

  it("restores the synced schedule and logbook progress on a fresh startup", async () => {
    const synced = await syncSuccessfully();
    const expectedFlights = (await readSavedSchedule()).flights;
    synced.unmount();
    vi.clearAllMocks();
    // Passive startup setters capture hydration without replacing storage or domain logic.
    const setters = Object.fromEntries([
      "ActiveFlightBoardId", "BasicAddonFiltersOpen", "BasicAdvancedFiltersOpen", "AddonScan",
      "DutyFilters", "Filters", "FlightBoards", "PlannerControlsCollapsed", "PlannerMode",
      "Schedule", "ScheduleView", "SelectedAccomplishmentName", "SelectedFlightId",
      "SelectedTourPath", "SelectedTourRowId", "Sort", "StatusMessage", "TourProgress",
      "DeltaVirtualAccomplishmentEligibility", "LogbookAirportProgress", "DerivedTourProgress",
      "GettingStartedState", "HasLoadedGettingStartedState", "DeltaVirtualToursCache"
    ].map((name) => [`set${name}`, vi.fn()]));
    const restarted = renderHook(() => useAppBootstrap(setters));
    await waitFor(() => expect(setters.setSchedule).toHaveBeenCalled());
    expect(setters.setSchedule).toHaveBeenCalledWith(expect.objectContaining({
      flights: expectedFlights, scheduleMetadata: expect.objectContaining({ sources: scheduleFixture.sources })
    }));
    await waitFor(() => expect(setters.setLogbookAirportProgress).toHaveBeenCalledWith(progress));
    expect(invokeAppCommand.mock.calls.map(([command]) => command)).not.toContain("start_deltava_sync");
    restarted.unmount();
  });
});
