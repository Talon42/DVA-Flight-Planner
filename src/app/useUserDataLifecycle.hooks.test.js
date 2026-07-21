// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUserDataLifecycle } from "./useUserDataLifecycle.hooks.js";

const persistence = vi.hoisted(() => ({
  suspendUiStateWrites: vi.fn(),
  flushUiStateWrites: vi.fn(),
  suspendSimBriefSettingsWrites: vi.fn(),
  flushSimBriefSettingsWrites: vi.fn(),
  logAppError: vi.fn()
}));

vi.mock("../services/storage/uiState.storage.js", () => ({
  suspendUiStateWrites: persistence.suspendUiStateWrites,
  flushUiStateWrites: persistence.flushUiStateWrites
}));
vi.mock("../services/storage/simBriefSettings.storage.js", () => ({
  suspendSimBriefSettingsWrites: persistence.suspendSimBriefSettingsWrites,
  flushSimBriefSettingsWrites: persistence.flushSimBriefSettingsWrites
}));
vi.mock("../services/logging/appLog.client.js", () => ({
  logAppError: persistence.logAppError
}));

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe("user data lifecycle", () => {
  beforeEach(() => {
    for (const mock of Object.values(persistence)) mock.mockReset();
    persistence.flushUiStateWrites.mockResolvedValue(undefined);
    persistence.flushSimBriefSettingsWrites.mockResolvedValue(undefined);
    persistence.logAppError.mockResolvedValue(undefined);
  });

  it("skips confirmation and deletion when a writer is already busy", async () => {
    const confirmDelete = vi.fn(async () => true);
    const deleteUserData = vi.fn();
    const { result } = renderHook(() => useUserDataLifecycle({
      confirmDelete,
      isDeleteBlocked: true,
      deleteUserData
    }));

    await act(() => result.current.handleDeleteUserData());

    expect(confirmDelete).not.toHaveBeenCalled();
    expect(deleteUserData).not.toHaveBeenCalled();
  });

  it("rechecks busy state after confirmation before starting deletion", async () => {
    const confirmation = deferred();
    const deleteUserData = vi.fn();
    const { result, rerender } = renderHook(
      ({ blocked }) => useUserDataLifecycle({
        confirmDelete: () => confirmation.promise,
        isDeleteBlocked: blocked,
        deleteUserData
      }),
      { initialProps: { blocked: false } }
    );

    let operation;
    act(() => { operation = result.current.handleDeleteUserData(); });
    rerender({ blocked: true });
    confirmation.resolve(true);
    await act(() => operation);

    expect(deleteUserData).not.toHaveBeenCalled();
    expect(result.current.isDeletingUserData).toBe(false);
  });

  it("turns preparation exceptions into structured failure and resets busy state", async () => {
    const deleteUserData = vi.fn();
    const { result } = renderHook(() => useUserDataLifecycle({
      confirmDelete: async () => true,
      prepareForUserDataClear: () => { throw new Error("prepare failed"); },
      deleteUserData
    }));

    await act(() => result.current.handleDeleteUserData());

    expect(result.current.clearFailure.failures[0].reasonCode).toBe("request_failed");
    expect(result.current.isDeletingUserData).toBe(false);
    expect(deleteUserData).not.toHaveBeenCalled();
  });

  it("reports flush rejection and skips the backend clear", async () => {
    persistence.flushUiStateWrites.mockRejectedValue(new Error("flush failed"));
    const deleteUserData = vi.fn();
    const { result } = renderHook(() => useUserDataLifecycle({
      confirmDelete: async () => true,
      deleteUserData
    }));

    await act(() => result.current.handleDeleteUserData());

    expect(result.current.clearFailure.failures[0].reasonCode).toBe("request_failed");
    expect(deleteUserData).not.toHaveBeenCalled();
  });

  it("runs the transaction in order and reloads exactly once after full success", async () => {
    const sequence = [];
    persistence.suspendUiStateWrites.mockImplementation(() => sequence.push("suspend-ui"));
    persistence.suspendSimBriefSettingsWrites.mockImplementation(() => sequence.push("suspend-simbrief"));
    persistence.flushUiStateWrites.mockImplementation(async () => { sequence.push("flush-ui"); });
    persistence.flushSimBriefSettingsWrites.mockImplementation(async () => { sequence.push("flush-simbrief"); });
    const prepareForUserDataClear = vi.fn(() => sequence.push("prepare"));
    const deleteUserData = vi.fn(async () => {
      sequence.push("backend-clear");
      return { ok: true, failures: [] };
    });
    const reloadPage = vi.fn(() => sequence.push("reload"));
    const { result } = renderHook(() => useUserDataLifecycle({
      confirmDelete: async () => true,
      prepareForUserDataClear,
      deleteUserData,
      reloadPage
    }));

    await act(() => result.current.handleDeleteUserData());

    expect(sequence.slice(0, 3)).toEqual(["suspend-ui", "suspend-simbrief", "prepare"]);
    expect(sequence.slice(3, 5).sort()).toEqual(["flush-simbrief", "flush-ui"]);
    expect(sequence.slice(5)).toEqual(["backend-clear", "reload"]);
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("keeps partial deletion suspended without reloading", async () => {
    const reloadPage = vi.fn();
    const partialResult = {
      ok: false,
      failures: [{ target: "uiState", reasonCode: "in_use" }]
    };
    const { result } = renderHook(() => useUserDataLifecycle({
      confirmDelete: async () => true,
      deleteUserData: async () => partialResult,
      reloadPage
    }));

    await act(() => result.current.handleDeleteUserData());

    expect(result.current.clearFailure).toEqual(partialResult);
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it("retries a partial deletion without confirming again", async () => {
    const confirmDelete = vi.fn(async () => true);
    const deleteUserData = vi.fn()
      .mockResolvedValueOnce({ ok: false, failures: [{ target: "uiState", reasonCode: "in_use" }] })
      .mockResolvedValueOnce({ ok: true, failures: [] });
    const reloadPage = vi.fn();
    const { result } = renderHook(() => useUserDataLifecycle({
      confirmDelete,
      deleteUserData,
      reloadPage
    }));

    await act(() => result.current.handleDeleteUserData());
    await act(() => result.current.retryUserDataClear());

    expect(confirmDelete).toHaveBeenCalledOnce();
    expect(deleteUserData).toHaveBeenCalledTimes(2);
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it("collapses double invocation into one deletion transaction", async () => {
    const backend = deferred();
    const confirmDelete = vi.fn(async () => true);
    const deleteUserData = vi.fn(() => backend.promise);
    const { result } = renderHook(() => useUserDataLifecycle({ confirmDelete, deleteUserData }));

    let first;
    let second;
    act(() => {
      first = result.current.handleDeleteUserData();
      second = result.current.handleDeleteUserData();
    });
    backend.resolve({ ok: false, failures: [] });
    await act(() => Promise.all([first, second]));

    expect(confirmDelete).toHaveBeenCalledOnce();
    expect(deleteUserData).toHaveBeenCalledOnce();
  });
});
