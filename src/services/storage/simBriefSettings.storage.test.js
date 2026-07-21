// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeSimBriefSettings } = vi.hoisted(() => ({ writeSimBriefSettings: vi.fn() }));
vi.mock("./storage.js", async (importOriginal) => ({
  ...(await importOriginal()),
  writeSimBriefSettings
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function loadCoordinator() {
  vi.resetModules();
  return import("./simBriefSettings.storage.js");
}

describe("SimBrief settings write coordinator", () => {
  beforeEach(() => writeSimBriefSettings.mockReset());

  it("serializes and coalesces snapshots while only the newest result is authoritative", async () => {
    const firstWrite = deferred();
    writeSimBriefSettings.mockImplementationOnce(() => firstWrite.promise).mockResolvedValue(undefined);
    const { saveSimBriefSettings } = await loadCoordinator();

    const first = saveSimBriefSettings({ username: "one" });
    const second = saveSimBriefSettings({ username: "two" });
    const third = saveSimBriefSettings({ username: "three" });
    expect(writeSimBriefSettings).toHaveBeenCalledTimes(1);

    firstWrite.resolve();
    const [firstResult, secondResult, thirdResult] = await Promise.all([first, second, third]);

    expect(firstResult.authoritative).toBe(false);
    expect(secondResult.authoritative).toBe(false);
    expect(thirdResult.authoritative).toBe(true);
    expect(writeSimBriefSettings).toHaveBeenCalledTimes(2);
    expect(writeSimBriefSettings.mock.calls[1][0].username).toBe("three");
  });

  it("continues after failure and skips new writes while suspended", async () => {
    writeSimBriefSettings.mockRejectedValueOnce(new Error("disk")).mockResolvedValueOnce(undefined);
    const {
      saveSimBriefSettings,
      suspendSimBriefSettingsWrites,
      resumeSimBriefSettingsWrites
    } = await loadCoordinator();

    await expect(saveSimBriefSettings({ username: "one" })).rejects.toThrow("disk");
    await expect(saveSimBriefSettings({ username: "two" })).resolves.toMatchObject({ authoritative: true });
    suspendSimBriefSettingsWrites();
    await expect(saveSimBriefSettings({ username: "blocked" })).resolves.toMatchObject({ skipped: true });
    expect(writeSimBriefSettings).toHaveBeenCalledTimes(2);
    resumeSimBriefSettingsWrites();
  });

  it("does not surface a superseded failure after a newer snapshot is queued", async () => {
    const firstWrite = deferred();
    writeSimBriefSettings.mockImplementationOnce(() => firstWrite.promise).mockResolvedValueOnce(undefined);
    const { saveSimBriefSettings } = await loadCoordinator();

    const first = saveSimBriefSettings({ username: "old", dispatchUnits: "LBS" });
    const second = saveSimBriefSettings({ username: "new", dispatchUnits: "KGS" });
    firstWrite.reject(new Error("old write failed"));

    await expect(first).resolves.toMatchObject({ authoritative: false, failed: true });
    await expect(second).resolves.toMatchObject({ authoritative: true });
    expect(writeSimBriefSettings.mock.calls[1][0]).toMatchObject({
      username: "new",
      dispatchUnits: "KGS"
    });
  });
});
