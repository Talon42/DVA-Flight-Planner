// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const appStorage = vi.hoisted(() => ({
  ensureAppLogFile: vi.fn(),
  quarantineAppStorageFile: vi.fn(),
  readAppStorageFile: vi.fn(),
  writeAppStorageFile: vi.fn()
}));

vi.mock("../tauri/storage.client.js", () => appStorage);

async function loadStorage() {
  vi.resetModules();
  return import("./storage.js");
}

describe("storage runtime boundaries", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.__TAURI_INTERNALS__;
    for (const mock of Object.values(appStorage)) mock.mockReset();
  });

  it("preserves browser localStorage fallback and saved-schedule compatibility", async () => {
    const storage = await loadStorage();
    await storage.writeSavedSchedule({
      importedAt: "2026-07-20T12:00:00Z",
      sourceFileName: "schedule.xml",
      flights: [],
      shortlist: []
    });

    const restored = await storage.readSavedSchedule();
    expect(restored).toMatchObject({
      importedAt: "2026-07-20T12:00:00Z",
      sourceFileName: "schedule.xml",
      flights: []
    });
    expect(appStorage.writeAppStorageFile).not.toHaveBeenCalled();
  });

  it("quarantines corrupt desktop schedule JSON through the narrow Rust command", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    appStorage.readAppStorageFile.mockResolvedValue("not-json");
    const storage = await loadStorage();

    await expect(storage.readSavedSchedule()).resolves.toBeNull();
    expect(appStorage.quarantineAppStorageFile).toHaveBeenCalledWith("savedSchedule");
  });

  it("writes fixed desktop settings without frontend filesystem access", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    const storage = await loadStorage();
    await storage.writeSimBriefSettings({ username: "pilot", dispatchUnits: "KGS" });

    expect(appStorage.writeAppStorageFile).toHaveBeenCalledWith(
      "simbriefSettings",
      expect.stringContaining('"username":"pilot"')
    );
  });
});
