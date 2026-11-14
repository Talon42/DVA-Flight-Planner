// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { installGlobalErrorLogging } from "./globalError.client.js";
import { logSystemError } from "./appLog.client.js";
import { flushRepeatedLogs } from "./repeatedLog.client.js";

vi.mock("./appLog.client.js", () => ({ logSystemError: vi.fn(), logSystemWarn: vi.fn() }));

it("installs once and retains the real error stack while grouping runtime failures", () => {
  vi.useFakeTimers();
  const listeners = vi.spyOn(window, "addEventListener");
  try {
    installGlobalErrorLogging();
    installGlobalErrorLogging();
    expect(listeners.mock.calls.filter(([name]) => name === "error")).toHaveLength(1);
    const error = new Error("render failed");
    error.stack = "Error: render failed\n at Feature (feature.js:42)";
    for (let i = 0; i < 4; i++) window.dispatchEvent(new ErrorEvent("error", {
      message: error.message, error, filename: "https://app/main.js?private=query", lineno: 42
    }));
    expect(logSystemError).toHaveBeenCalledTimes(1);
    expect(logSystemError).toHaveBeenCalledWith("Frontend", "runtime-error", error,
      expect.objectContaining({ filename: "/main.js", line: 42 }));
    vi.advanceTimersByTime(60_000);
    expect(logSystemError).toHaveBeenLastCalledWith("Frontend", "runtime-error-repeated", error,
      expect.objectContaining({ repeatCount: 3 }));
  } finally {
    for (const [name, callback] of listeners.mock.calls) window.removeEventListener(name, callback);
    listeners.mockRestore();
    flushRepeatedLogs();
    vi.useRealTimers();
  }
});
