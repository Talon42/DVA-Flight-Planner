// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDeltaVirtualLogbook } from "../../services/tauri/deltaVirtual.client.js";
import { useLogbook } from "./useLogbook.hooks.js";

vi.mock("../../services/tauri/deltaVirtual.client.js", () => ({
  readDeltaVirtualLogbook: vi.fn()
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function logbookResult(id) {
  const entries = id ? [{ id, status: "APPROVED" }] : [];
  return {
    dateIso: "2026-07-20",
    lastSyncAt: "2026-07-20T12:00:00Z",
    profileMetadata: null,
    entries,
    entryCount: entries.length,
    error: ""
  };
}

describe("useLogbook loading", () => {
  beforeEach(() => {
    readDeltaVirtualLogbook.mockReset();
  });

  it("clears loading and preserves last-good rows after a rejected refresh", async () => {
    readDeltaVirtualLogbook
      .mockResolvedValueOnce(logbookResult("good-row"))
      .mockRejectedValueOnce(new Error("invoke payload should not reach the user"));
    const { result, rerender } = renderHook(
      ({ reloadVersion }) => useLogbook({ reloadVersion }),
      { initialProps: { reloadVersion: 0 } }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.cacheResult.entries).toEqual([{ id: "good-row", status: "APPROVED" }]);

    rerender({ reloadVersion: 1 });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadError).toBe("Unable to load the Delta Virtual logbook.");
    expect(result.current.cacheResult.entries).toEqual([{ id: "good-row", status: "APPROVED" }]);
  });

  it("does not let an older read overwrite a newer result", async () => {
    const olderRead = deferred();
    const newerRead = deferred();
    readDeltaVirtualLogbook
      .mockReturnValueOnce(olderRead.promise)
      .mockReturnValueOnce(newerRead.promise);
    const { result, rerender } = renderHook(
      ({ reloadVersion }) => useLogbook({ reloadVersion }),
      { initialProps: { reloadVersion: 0 } }
    );

    rerender({ reloadVersion: 1 });
    await waitFor(() => expect(readDeltaVirtualLogbook).toHaveBeenCalledTimes(2));

    await act(async () => {
      newerRead.resolve(logbookResult("newer-row"));
      await newerRead.promise;
    });
    await waitFor(() => expect(result.current.cacheResult.entries[0]?.id).toBe("newer-row"));

    await act(async () => {
      olderRead.resolve(logbookResult("older-row"));
      await olderRead.promise;
    });
    expect(result.current.cacheResult.entries[0]?.id).toBe("newer-row");
  });

  it("does not update React state after unmount", async () => {
    const pendingRead = deferred();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    readDeltaVirtualLogbook.mockReturnValueOnce(pendingRead.promise);
    const { unmount } = renderHook(() => useLogbook());

    unmount();
    await act(async () => {
      pendingRead.resolve(logbookResult("late-row"));
      await pendingRead.promise;
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
