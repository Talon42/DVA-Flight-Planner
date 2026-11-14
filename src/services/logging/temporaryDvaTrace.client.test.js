import { afterEach, describe, expect, it, vi } from "vitest";
import { logSystemEvent } from "./appLog.client.js";
import { createTemporaryDvaTrace } from "./temporaryDvaTrace.client.js";

vi.mock("./appLog.client.js", () => ({ logSystemEvent: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

describe("temporary DVA timing observer", () => {
  it("records stage and full durations including cleanup without logging payloads", async () => {
    let clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const trace = createTemporaryDvaTrace("sync-fixture");
    const payload = { password: "never-log-this" };
    expect(await trace.time("download", () => { clock = 120; return payload; })).toBe(payload);
    await trace.time("cleanup", () => { clock = 145; });
    await trace.finish("succeeded");
    expect(logSystemEvent).toHaveBeenCalledWith("TEMP-DVA-TRACE", "finished", {
      syncRunId: "sync-fixture", stage: "download", durationMs: 120, elapsedMs: 120
    });
    expect(logSystemEvent).toHaveBeenLastCalledWith("TEMP-DVA-TRACE", "succeeded", {
      syncRunId: "sync-fixture", stage: "full-sync", durationMs: 145, elapsedMs: 145
    });
    expect(JSON.stringify(logSystemEvent.mock.calls)).not.toContain("never-log-this");
  });

  it("preserves errors and records a terminal trace after cleanup", async () => {
    const trace = createTemporaryDvaTrace("sync-failure");
    const error = new Error("request failed");
    await expect(trace.time("download", () => { throw error; })).rejects.toBe(error);
    await trace.time("cleanup", () => {});
    await trace.finish("failed");
    expect(logSystemEvent).toHaveBeenCalledWith("TEMP-DVA-TRACE", "failed", expect.objectContaining({ stage: "download" }));
    expect(logSystemEvent).toHaveBeenLastCalledWith("TEMP-DVA-TRACE", "failed", expect.objectContaining({ stage: "full-sync" }));
  });

  it("keeps logging failures from changing sync results", async () => {
    logSystemEvent.mockRejectedValue(new Error("disk unavailable"));
    const trace = createTemporaryDvaTrace("sync-no-log");
    expect(await trace.time("download", () => 42)).toBe(42);
    await expect(trace.finish("succeeded")).resolves.toBeUndefined();
  });
});
