import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogbookPirepDetailsRequestManager } from "./logbookPirepDetailsRequests.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("logbook PIREP request manager", () => {
  it("deduplicates in-flight requests and caches successful results", async () => {
    const pending = deferred();
    const fetchDetails = vi.fn(() => pending.promise);
    const manager = createLogbookPirepDetailsRequestManager({ fetchDetails });

    const first = manager.prefetch("DVA100");
    const second = manager.request("DVA100");
    expect(first).toBe(second);
    await Promise.resolve();
    expect(fetchDetails).toHaveBeenCalledTimes(1);

    pending.resolve({ id: "DVA100" });
    await expect(first).resolves.toEqual({ id: "DVA100" });
    expect(manager.get("DVA100")).toEqual({ id: "DVA100" });
  });

  it("limits concurrency and promotes selected requests above queued prefetch", async () => {
    const pending = new Map();
    const starts = [];
    const fetchDetails = vi.fn((id) => {
      starts.push(id);
      const request = deferred();
      pending.set(id, request);
      return request.promise;
    });
    const manager = createLogbookPirepDetailsRequestManager({ fetchDetails, maxActiveRequests: 1 });

    const first = manager.prefetch("DVA1");
    const second = manager.prefetch("DVA2");
    const selected = manager.request("DVA3");
    await Promise.resolve();
    expect(starts).toEqual(["DVA1"]);

    pending.get("DVA1").resolve({ id: "DVA1" });
    await first;
    await vi.waitFor(() => expect(starts).toEqual(["DVA1", "DVA3"]));

    pending.get("DVA3").resolve({ id: "DVA3" });
    await selected;
    await vi.waitFor(() => expect(starts).toEqual(["DVA1", "DVA3", "DVA2"]));
    pending.get("DVA2").resolve({ id: "DVA2" });
    await second;
  });

  it("expires by TTL and evicts the least recently used success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
    const fetchDetails = vi.fn(async (id) => ({ id }));
    const manager = createLogbookPirepDetailsRequestManager({ fetchDetails, maxEntries: 2, ttlMs: 1000 });

    await manager.request("DVA1");
    await manager.request("DVA2");
    expect(manager.get("DVA1")).toEqual({ id: "DVA1" });
    await manager.request("DVA3");
    expect(manager.get("DVA2")).toBeNull();

    vi.advanceTimersByTime(1001);
    expect(manager.get("DVA1")).toBeNull();
    await manager.request("DVA1");
    expect(fetchDetails).toHaveBeenCalledTimes(4);
  });

  it("enforces failure cooldown without retry storms", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
    const fetchDetails = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ id: "DVA1" });
    const manager = createLogbookPirepDetailsRequestManager({ fetchDetails, failureCooldownMs: 30000 });

    await expect(manager.request("DVA1")).rejects.toThrow("offline");
    await expect(manager.request("DVA1")).rejects.toMatchObject({ kind: "cooldown" });
    expect(fetchDetails).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30001);
    await expect(manager.request("DVA1")).resolves.toEqual({ id: "DVA1" });
    expect(fetchDetails).toHaveBeenCalledTimes(2);
  });

  it("immediately rejects active requests and ignores their late completion after clear", async () => {
    const pending = deferred();
    const manager = createLogbookPirepDetailsRequestManager({ fetchDetails: () => pending.promise });
    const request = manager.request("DVA1");
    await Promise.resolve();
    manager.clear();
    await expect(request).rejects.toMatchObject({ kind: "invalidated" });
    pending.resolve({ id: "DVA1" });
    await Promise.resolve();

    expect(manager.get("DVA1")).toBeNull();
    expect(manager.diagnostics().generation).toBe(1);
  });

  it("immediately rejects an active request invalidated by id", async () => {
    const pending = deferred();
    const manager = createLogbookPirepDetailsRequestManager({ fetchDetails: () => pending.promise });
    const request = manager.request("DVA1");
    await Promise.resolve();

    manager.invalidate("DVA1");

    await expect(request).rejects.toMatchObject({ kind: "invalidated" });
    pending.resolve({ id: "DVA1" });
    await Promise.resolve();
    expect(manager.get("DVA1")).toBeNull();
  });
});
