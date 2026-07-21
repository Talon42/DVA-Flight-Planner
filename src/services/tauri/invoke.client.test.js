// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invokeAppCommand } from "./invoke.client.js";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
  invoke.mockReset();
  window.__TAURI_INTERNALS__ = {};
});

afterEach(() => {
  delete window.__TAURI_INTERNALS__;
});

describe("Tauri invocation boundary", () => {
  it("logs command failures with sensitive metadata redacted", async () => {
    const failure = new Error("backend failed");
    invoke.mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);

    await expect(
      invokeAppCommand(
        "save_sensitive_settings",
        { password: "command-secret" },
        {
          subsystem: "Settings",
          event: "save-failed",
          metadata: {
            pilotId: 123,
            password: "metadata-secret",
            nested: { token: "token-secret", safe: "visible" },
            responseBody: "private-response"
          }
        }
      )
    ).rejects.toBe(failure);

    expect(invoke.mock.calls[0]).toEqual([
      "save_sensitive_settings",
      { password: "command-secret" }
    ]);
    expect(invoke.mock.calls[1][0]).toBe("append_app_log_text");

    const logLine = invoke.mock.calls[1][1].text;
    expect(logLine).toContain("[Settings] save-failed error=backend failed");
    expect(logLine).toContain("commandName=save_sensitive_settings");
    expect(logLine).toContain("pilotId=123");
    expect(logLine).toContain("[REDACTED]");
    expect(logLine).not.toContain("command-secret");
    expect(logLine).not.toContain("metadata-secret");
    expect(logLine).not.toContain("token-secret");
    expect(logLine).not.toContain("private-response");
  });

  it("does not log errors explicitly classified as expected", async () => {
    const expectedFailure = "persistence write suppressed after clear";
    invoke.mockRejectedValue(expectedFailure);

    await expect(
      invokeAppCommand(
        "write_ui_state",
        { json: "{}" },
        { isExpectedError: (error) => error === expectedFailure }
      )
    ).rejects.toBe(expectedFailure);

    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("rejects outside the desktop runtime without invoking anything", async () => {
    delete window.__TAURI_INTERNALS__;

    await expect(invokeAppCommand("read_ui_state")).rejects.toThrow(
      "Tauri commands are only available in the desktop app."
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});
