// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeltaVirtualSync } from "./useDeltaVirtualSync.hooks.js";

const logging = vi.hoisted(() => ({
  createLogRunId: vi.fn(),
  logAppDebug: vi.fn(),
  logSystemError: vi.fn(),
  logSystemEvent: vi.fn()
}));
const readDeltaVirtualCredentials = vi.hoisted(() => vi.fn());
const readDeltaVirtualTourProgress = vi.hoisted(() => vi.fn());
const deltaVirtual = vi.hoisted(() => ({
  readDeltaVirtualAccomplishmentEligibility: vi.fn(),
  closeDeltaVirtualSyncWindow: vi.fn(),
  pruneDeltaVirtualStorage: vi.fn(),
  resetDeltaVirtualSyncSession: vi.fn(),
  readDeltaVirtualLogbookProgress: vi.fn(),
  refreshDeltaVirtualLogbook: vi.fn(),
  syncDeltaVirtualTours: vi.fn(),
  syncScheduleFromDeltaVirtual: vi.fn()
}));
const buildScheduleDateInfo = vi.hoisted(() => vi.fn());
const clearLogbookPirepDetailsRequests = vi.hoisted(() => vi.fn());

vi.mock("../../services/logging/appLog.client.js", () => logging);
vi.mock("../../services/tauri/deltaVirtualCredentials.client.js", () => ({
  readDeltaVirtualCredentials
}));
vi.mock("../../services/storage/storage.js", () => ({ readDeltaVirtualTourProgress }));
vi.mock("../../services/tauri/deltaVirtual.client.js", () => deltaVirtual);
vi.mock("../../domain/schedule/scheduleDate.js", () => ({ buildScheduleDateInfo }));
vi.mock("../logbook/logbookPirepDetailsRequests.js", () => ({
  clearLogbookPirepDetailsRequests
}));

function createProps(overrides = {}) {
  return {
    dvaFirstName: "Jane",
    dvaHasPassword: true,
    dvaLastName: "Pilot",
    isDevToolsEnabled: true,
    processImportedSchedule: vi.fn().mockResolvedValue({
      ok: true,
      schedule: { flights: [{ flightId: "flight-1" }] }
    }),
    onLogbookSyncComplete: vi.fn(),
    onScheduleSyncComplete: vi.fn(),
    setDerivedTourProgress: vi.fn(),
    setDeltaVirtualToursCache: vi.fn(),
    setDeltaVirtualAccomplishmentEligibility: vi.fn(),
    setDvaHasPassword: vi.fn(),
    setDvaSyncWarning: vi.fn(),
    setLogbookAirportProgress: vi.fn(),
    setStatusMessage: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  logging.createLogRunId.mockImplementation((prefix) => `${prefix}-run`);
  logging.logAppDebug.mockResolvedValue(undefined);
  logging.logSystemError.mockResolvedValue(undefined);
  logging.logSystemEvent.mockResolvedValue(undefined);
  readDeltaVirtualCredentials.mockResolvedValue({ hasPassword: true });
  readDeltaVirtualTourProgress.mockResolvedValue({
    tourProgress: { "dva:42": { rows: { row1: { completed: true } } } },
    lastSyncAt: "fixture"
  });
  deltaVirtual.readDeltaVirtualAccomplishmentEligibility.mockResolvedValue({
    lastSyncAt: "fixture",
    sourceUrl: "fixture",
    rows: [{ name: "World Traveler", achieved: false }]
  });
  deltaVirtual.closeDeltaVirtualSyncWindow.mockResolvedValue(undefined);
  deltaVirtual.pruneDeltaVirtualStorage.mockResolvedValue(undefined);
  deltaVirtual.resetDeltaVirtualSyncSession.mockResolvedValue(undefined);
  deltaVirtual.readDeltaVirtualLogbookProgress.mockResolvedValue({
    dateIso: "2026-07-21",
    lastSyncAt: "fixture",
    visitedAirports: ["KATL"],
    arrivalAirports: ["KJFK"]
  });
  deltaVirtual.refreshDeltaVirtualLogbook.mockResolvedValue({
    logbookJson: { fileName: "logbook.json", bytes: 100 }
  });
  deltaVirtual.syncDeltaVirtualTours.mockResolvedValue({
    ok: true,
    totalListTours: 1,
    candidateTours: 1,
    syncedTours: 1,
    failedTourIds: [],
    message: "Tours synced.",
    tours: [{ id: "dva:42" }]
  });
  deltaVirtual.syncScheduleFromDeltaVirtual.mockResolvedValue({
    fileName: "schedule.xml",
    xmlText: "<SCHEDULE />",
    logbookJson: { fileName: "logbook.json" },
    warnings: []
  });
  buildScheduleDateInfo.mockReturnValue({ isCurrent: true, label: "July 21st" });
});

describe("useDeltaVirtualSync", () => {
  it("blocks sync before invocation when saved credentials are incomplete", async () => {
    const props = createProps({ dvaHasPassword: false });
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(async () => {
      await result.current.handleDeltaVirtualSync();
    });

    expect(deltaVirtual.syncScheduleFromDeltaVirtual).not.toHaveBeenCalled();
    expect(props.setDvaSyncWarning).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "missing_credentials", primaryAction: "open_delta_virtual_settings" })
    );
    expect(result.current.isSyncing).toBe(false);
  });

  it("runs the complete sync once, reloads dependent state, and cleans up", async () => {
    let resolveScheduleSync;
    deltaVirtual.syncScheduleFromDeltaVirtual.mockImplementation(
      () => new Promise((resolve) => {
        resolveScheduleSync = resolve;
      })
    );
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));
    let firstSync;

    act(() => {
      firstSync = result.current.handleDeltaVirtualSync();
    });
    await waitFor(() => expect(result.current.isSyncing).toBe(true));

    await act(async () => {
      await result.current.handleDeltaVirtualSync();
    });
    expect(deltaVirtual.syncScheduleFromDeltaVirtual).toHaveBeenCalledTimes(1);

    resolveScheduleSync({
      fileName: "schedule.xml",
      xmlText: "<SCHEDULE />",
      logbookJson: { fileName: "logbook.json" },
      warnings: []
    });
    await act(async () => {
      await firstSync;
    });

    expect(props.processImportedSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "schedule.xml" }),
      "deltava-sync"
    );
    expect(props.onScheduleSyncComplete).toHaveBeenCalledOnce();
    expect(props.onLogbookSyncComplete).toHaveBeenCalledOnce();
    expect(props.setLogbookAirportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ visitedAirports: ["KATL"] })
    );
    expect(props.setDeltaVirtualAccomplishmentEligibility).toHaveBeenCalledWith(
      expect.objectContaining({ rows: [expect.objectContaining({ name: "World Traveler" })] })
    );
    expect(props.setDeltaVirtualToursCache).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, syncedTours: 1 })
    );
    expect(props.setDerivedTourProgress).toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncAt: "fixture" })
    );
    expect(deltaVirtual.closeDeltaVirtualSyncWindow).toHaveBeenCalledOnce();
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledWith(true);
    expect(result.current.isSyncing).toBe(false);
  });

  it("refreshes only logbook state and always performs non-destructive cleanup", async () => {
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(async () => {
      await result.current.handleRefreshDeltaVirtualLogbook();
    });

    expect(deltaVirtual.refreshDeltaVirtualLogbook).toHaveBeenCalledWith({
      syncRunId: "logbook-refresh-run",
      debugEnabled: true
    });
    expect(props.setLogbookAirportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ arrivalAirports: ["KJFK"] })
    );
    expect(props.onLogbookSyncComplete).toHaveBeenCalledOnce();
    expect(props.onScheduleSyncComplete).not.toHaveBeenCalled();
    expect(deltaVirtual.syncDeltaVirtualTours).not.toHaveBeenCalled();
    expect(deltaVirtual.closeDeltaVirtualSyncWindow).toHaveBeenCalledOnce();
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledWith(false);
    expect(result.current.isRefreshingLogbook).toBe(false);
  });

  it("preserves refreshed logbook progress when schedule sync partially succeeds", async () => {
    const partialError = Object.assign(new Error("Schedule download failed after logbook save."), {
      kind: "partial_success",
      syncResult: {
        logbookJson: { fileName: "logbook.json" },
        warnings: ["schedule unavailable"]
      }
    });
    deltaVirtual.syncScheduleFromDeltaVirtual.mockRejectedValue(partialError);
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(async () => {
      await result.current.handleDeltaVirtualSync();
    });

    expect(props.onLogbookSyncComplete).toHaveBeenCalledOnce();
    expect(props.onScheduleSyncComplete).not.toHaveBeenCalled();
    expect(props.setDeltaVirtualAccomplishmentEligibility).toHaveBeenCalled();
    expect(props.setDvaSyncWarning).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sync_failed", detail: partialError.message })
    );
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledWith(false);
    expect(result.current.isSyncing).toBe(false);
  });
});
