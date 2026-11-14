import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushRepeatedLogs, logRepeatedFailure } from "./repeatedLog.client.js";
import { logSystemError, logSystemWarn } from "./appLog.client.js";

vi.mock("./appLog.client.js", () => ({ logSystemError: vi.fn(), logSystemWarn: vi.fn() }));

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { flushRepeatedLogs(); vi.useRealTimers(); });

describe("failure burst summaries", () => {
  it("records the first error and flushes repeats even when no later error arrives", () => {
    const error = new Error("offline");
    for (let i = 0; i < 20; i++) logRepeatedFailure("ERROR", "Frontend", "runtime-error", error);
    expect(logSystemError).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(logSystemError).toHaveBeenCalledTimes(2);
    expect(logSystemError).toHaveBeenLastCalledWith("Frontend", "runtime-error-repeated", error,
      expect.objectContaining({ repeatCount: 19, firstSeen: expect.any(String), lastSeen: expect.any(String) }));
    logRepeatedFailure("ERROR", "Frontend", "runtime-error", error);
    expect(logSystemError).toHaveBeenCalledTimes(3);
  });

  it("groups changing tile errors and flushes pending counts on exit", () => {
    logRepeatedFailure("WARN", "Map", "resource-failed", "tile 1", null, "tiles");
    logRepeatedFailure("WARN", "Map", "resource-failed", "tile 2", null, "tiles");
    flushRepeatedLogs();
    expect(logSystemWarn).toHaveBeenCalledTimes(2);
    expect(logSystemWarn).toHaveBeenLastCalledWith("Map", "resource-failed-repeated", expect.objectContaining({ repeatCount: 1 }));
    expect(vi.getTimerCount()).toBe(0);
  });
});
