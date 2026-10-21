// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeUiStateJson } = vi.hoisted(() => ({
  writeUiStateJson: vi.fn()
}));

vi.mock("../tauri/storage.client.js", () => ({
  writeUiStateJson
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

async function loadCoordinator() {
  vi.resetModules();
  return import("./uiState.storage.js");
}

describe("UI-state write coordinator", () => {
  beforeEach(() => {
    writeUiStateJson.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      value: {},
      configurable: true
    });
  });

  it("serializes desktop writes so only one is active", async () => {
    const writes = [];
    let activeCount = 0;
    let maximumActiveCount = 0;
    writeUiStateJson.mockImplementation((json) => {
      const pending = deferred();
      activeCount += 1;
      maximumActiveCount = Math.max(maximumActiveCount, activeCount);
      pending.promise.finally(() => {
        activeCount -= 1;
      });
      writes.push({ json, ...pending });
      return pending.promise;
    });
    const { saveUiState } = await loadCoordinator();

    const first = saveUiState({ revision: 1 });
    const second = saveUiState({ revision: 2 });
    expect(writes).toHaveLength(1);

    writes[0].resolve();
    await first;
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    expect(maximumActiveCount).toBe(1);

    writes[1].resolve();
    await second;
    expect(maximumActiveCount).toBe(1);
  });

  it("coalesces pending writes so the newest complete snapshot wins", async () => {
    const writes = [];
    writeUiStateJson.mockImplementation((json) => {
      const pending = deferred();
      writes.push({ json, ...pending });
      return pending.promise;
    });
    const { saveUiState, saveUiStateImmediate } = await loadCoordinator();

    const first = saveUiState({ revision: 1, complete: true });
    const second = saveUiState({ revision: 2, complete: true });
    const third = saveUiStateImmediate({ revision: 3, complete: true });

    writes[0].resolve();
    await first;
    await vi.waitFor(() => expect(writes).toHaveLength(2));
    expect(JSON.parse(writes[1].json)).toEqual({ revision: 3, complete: true });

    writes[1].resolve();
    await Promise.all([second, third]);
    expect(writeUiStateJson).toHaveBeenCalledTimes(2);
  });

  it("recovers after a failed write without poisoning the queue", async () => {
    const failure = new Error("disk unavailable");
    writeUiStateJson.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
    const { saveUiState, flushUiStateWrites } = await loadCoordinator();

    await expect(saveUiState({ revision: 1 })).rejects.toBe(failure);
    await expect(saveUiState({ revision: 2 })).resolves.toMatchObject({ revision: 2 });
    await expect(flushUiStateWrites()).resolves.toBeUndefined();
    expect(writeUiStateJson).toHaveBeenCalledTimes(2);
  });

  it("keeps browser-mode persistence in localStorage", async () => {
    delete window.__TAURI_INTERNALS__;
    window.localStorage.clear();
    const { saveUiState } = await loadCoordinator();

    await saveUiState({ revision: 1, browser: true });

    expect(JSON.parse(window.localStorage.getItem("flight-planner.ui-state"))).toEqual({
      revision: 1,
      browser: true
    });
    expect(writeUiStateJson).not.toHaveBeenCalled();
  });

  it("skips newly requested writes while suspended", async () => {
    const { saveUiState, suspendUiStateWrites, resumeUiStateWrites } = await loadCoordinator();
    suspendUiStateWrites();

    await expect(saveUiState({ blocked: true })).resolves.toMatchObject({ skipped: true });
    expect(writeUiStateJson).not.toHaveBeenCalled();
    resumeUiStateWrites();
  });
});
