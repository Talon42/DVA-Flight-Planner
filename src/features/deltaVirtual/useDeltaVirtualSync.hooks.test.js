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

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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

  it.each([
    ["window closing", true, false],
    ["storage pruning", false, true],
    ["both cleanup commands", true, true]
  ])("unlocks sync when %s fails", async (_label, closeFails, pruneFails) => {
    if (closeFails) {
      deltaVirtual.closeDeltaVirtualSyncWindow.mockRejectedValueOnce(
        new Error("Unable to close fixture window.")
      );
    }
    if (pruneFails) {
      deltaVirtual.pruneDeltaVirtualStorage.mockRejectedValueOnce(
        new Error("Unable to prune fixture storage.")
      );
    }
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(() => result.current.handleDeltaVirtualSync());

    expect(result.current.isSyncing).toBe(false);
    expect(deltaVirtual.closeDeltaVirtualSyncWindow).toHaveBeenCalledTimes(1);
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledTimes(1);

    await act(() => result.current.handleDeltaVirtualSync());

    expect(deltaVirtual.syncScheduleFromDeltaVirtual).toHaveBeenCalledTimes(2);
    expect(result.current.isSyncing).toBe(false);
    expect(logging.logSystemError).toHaveBeenCalledWith(
      expect.stringMatching(/^DVA Sync$/),
      expect.stringMatching(/^cleanup-/),
      expect.any(Error),
      expect.objectContaining({ syncRunId: "sync-run" })
    );
  });

  it("unlocks logbook refresh and attempts both cleanup commands when cleanup fails", async () => {
    deltaVirtual.closeDeltaVirtualSyncWindow.mockRejectedValueOnce(
      new Error("Unable to close fixture window.")
    );
    deltaVirtual.pruneDeltaVirtualStorage.mockRejectedValueOnce(
      new Error("Unable to prune fixture storage.")
    );
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(() => result.current.handleRefreshDeltaVirtualLogbook());

    expect(result.current.isRefreshingLogbook).toBe(false);
    expect(deltaVirtual.closeDeltaVirtualSyncWindow).toHaveBeenCalledOnce();
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledOnce();

    await act(() => result.current.handleRefreshDeltaVirtualLogbook());

    expect(deltaVirtual.refreshDeltaVirtualLogbook).toHaveBeenCalledTimes(2);
    expect(result.current.isRefreshingLogbook).toBe(false);
  });

  it("blocks same-render duplicate sync calls before asynchronous start logging settles", async () => {
    const startedLog = deferred();
    logging.logSystemEvent.mockImplementationOnce(() => startedLog.promise);
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));
    let firstSync;

    act(() => {
      firstSync = result.current.handleDeltaVirtualSync();
      void result.current.handleDeltaVirtualSync();
    });

    expect(logging.logSystemEvent).toHaveBeenCalledTimes(1);
    expect(result.current.isSyncing).toBe(true);

    await act(async () => {
      startedLog.resolve();
      await firstSync;
    });
    expect(deltaVirtual.syncScheduleFromDeltaVirtual).toHaveBeenCalledOnce();
  });

  it("prevents sync and logbook refresh from overlapping in either direction", async () => {
    const pendingSchedule = deferred();
    deltaVirtual.syncScheduleFromDeltaVirtual.mockReturnValueOnce(pendingSchedule.promise);
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));
    let syncOperation;

    act(() => {
      syncOperation = result.current.handleDeltaVirtualSync();
    });
    await waitFor(() => expect(result.current.isSyncing).toBe(true));
    await act(() => result.current.handleRefreshDeltaVirtualLogbook());
    expect(deltaVirtual.refreshDeltaVirtualLogbook).not.toHaveBeenCalled();

    await act(async () => {
      pendingSchedule.resolve({
        fileName: "schedule.xml",
        xmlText: "<SCHEDULE />",
        warnings: []
      });
      await syncOperation;
    });

    const pendingLogbook = deferred();
    deltaVirtual.refreshDeltaVirtualLogbook.mockReturnValueOnce(pendingLogbook.promise);
    let logbookOperation;
    act(() => {
      logbookOperation = result.current.handleRefreshDeltaVirtualLogbook();
    });
    await waitFor(() => expect(result.current.isRefreshingLogbook).toBe(true));
    await act(() => result.current.handleDeltaVirtualSync());
    expect(deltaVirtual.syncScheduleFromDeltaVirtual).toHaveBeenCalledOnce();

    await act(async () => {
      pendingLogbook.resolve({ logbookJson: { fileName: "logbook.json", bytes: 100 } });
      await logbookOperation;
    });
  });

  it("fails an unimportable schedule without deleting the downloaded fixture", async () => {
    const importError = new Error("Sanitized import failure.");
    const props = createProps({
      processImportedSchedule: vi.fn().mockResolvedValue({ ok: false, error: importError })
    });
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(() => result.current.handleDeltaVirtualSync());

    expect(props.setDvaSyncWarning).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sync_failed", detail: expect.stringContaining("could not be imported") })
    );
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledWith(false);
    expect(result.current.isSyncing).toBe(false);
  });

  it("rejects a downloaded schedule that remains stale", async () => {
    buildScheduleDateInfo.mockReturnValueOnce({ isCurrent: false, label: "July 1st" });
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(() => result.current.handleDeltaVirtualSync());

    expect(props.onScheduleSyncComplete).not.toHaveBeenCalled();
    expect(props.setDvaSyncWarning).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sync_failed", detail: expect.stringContaining("July 1st") })
    );
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledWith(false);
    expect(result.current.isSyncing).toBe(false);
  });

  it.each([
    ["cancelled", "Delta Virtual sync canceled."],
    ["auth_failed", "Delta Virtual Sync failed."],
    ["unknown_failure", "Delta Virtual Sync failed."]
  ])("resets state after a %s schedule failure", async (kind, expectedStatus) => {
    deltaVirtual.syncScheduleFromDeltaVirtual.mockRejectedValueOnce(
      Object.assign(new Error("Sanitized unknown sync failure."), { kind })
    );
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(() => result.current.handleDeltaVirtualSync());

    expect(props.setStatusMessage).toHaveBeenCalledWith(expect.stringContaining(expectedStatus));
    expect(deltaVirtual.closeDeltaVirtualSyncWindow).toHaveBeenCalledOnce();
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledWith(false);
    expect(result.current.isSyncing).toBe(false);
  });

  it("continues base sync completion when tour synchronization fails", async () => {
    deltaVirtual.syncDeltaVirtualTours.mockRejectedValueOnce(
      new Error("Sanitized tour sync failure.")
    );
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(() => result.current.handleDeltaVirtualSync());

    expect(props.onScheduleSyncComplete).toHaveBeenCalledOnce();
    expect(props.setDerivedTourProgress).toHaveBeenCalled();
    expect(props.setStatusMessage).toHaveBeenCalledWith("Sanitized tour sync failure.");
    expect(deltaVirtual.pruneDeltaVirtualStorage).toHaveBeenCalledWith(true);
    expect(result.current.isSyncing).toBe(false);
  });

  it("reports reset-session success and failure", async () => {
    const props = createProps();
    const { result } = renderHook(() => useDeltaVirtualSync(props));

    await act(() => result.current.handleResetDeltaVirtualSyncSession());
    expect(deltaVirtual.resetDeltaVirtualSyncSession).toHaveBeenCalledOnce();
    expect(clearLogbookPirepDetailsRequests).toHaveBeenCalledOnce();
    expect(props.setStatusMessage).toHaveBeenCalledWith(
      "Delta Virtual sync session reset. Try syncing again."
    );

    deltaVirtual.resetDeltaVirtualSyncSession.mockRejectedValueOnce(
      new Error("Sanitized reset failure.")
    );
    await act(() => result.current.handleResetDeltaVirtualSyncSession());
    expect(props.setStatusMessage).toHaveBeenCalledWith("Sanitized reset failure.");
    expect(logging.logSystemError).toHaveBeenCalledWith(
      "DVA Sync Reset",
      "failed",
      expect.any(Error)
    );
  });
});
