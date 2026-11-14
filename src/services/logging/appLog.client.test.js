import { afterEach, describe, expect, it, vi } from "vitest";
import { appendImportLog } from "../storage/storage.js";
import { logSystemDebug, logSystemError, logSystemWarn, setDebugLoggingEnabled } from "./appLog.client.js";

vi.mock("../storage/storage.js", () => ({ appendImportLog: vi.fn(async () => {}), openImportLog: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); setDebugLoggingEnabled(false); });

describe("application logger", () => {
  it("keeps debug details opt-in and marks warnings explicitly", async () => {
    await logSystemDebug("Map", "options", { enabled: true });
    expect(appendImportLog).not.toHaveBeenCalled();
    setDebugLoggingEnabled(true);
    await logSystemDebug("Map", "options", { enabled: true });
    await logSystemWarn("Storage", "recovered");
    expect(appendImportLog.mock.calls[0][0]).toContain("[DEBUG] [Map] options");
    expect(appendImportLog.mock.calls[1][0]).toContain("[WARN] [Storage] recovered");
  });

  it("does not break a feature or recursively log when persistence fails", async () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    appendImportLog.mockRejectedValue(new Error("disk unavailable"));
    try {
      await expect(logSystemError("App", "failed", new Error("original failure"))).resolves.toBeUndefined();
      await expect(logSystemError("App", "failed-again", new Error("original failure"))).resolves.toBeUndefined();
      expect(appendImportLog).toHaveBeenCalledTimes(2);
      expect(diagnostic).toHaveBeenCalledTimes(1);
    } finally {
      diagnostic.mockRestore();
      appendImportLog.mockResolvedValue(undefined);
    }
  });
});
