import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUserData,
  PERSISTENCE_WRITE_SUPPRESSED_ERROR,
  writeAppStorageFile,
  writeUiStateJson
} from "./storage.client.js";

const invokeAppCommand = vi.hoisted(() => vi.fn());

vi.mock("./invoke.client.js", () => ({ invokeAppCommand }));

describe("Tauri storage persistence suppression", () => {
  beforeEach(() => {
    invokeAppCommand.mockReset();
  });

  it("turns the exact post-clear write error into an intentional no-op", async () => {
    invokeAppCommand.mockRejectedValue(PERSISTENCE_WRITE_SUPPRESSED_ERROR);

    await expect(writeUiStateJson("{}")).resolves.toBeUndefined();
    const options = invokeAppCommand.mock.calls[0][2];
    expect(options.isExpectedError(PERSISTENCE_WRITE_SUPPRESSED_ERROR)).toBe(true);
  });

  it("preserves unrelated storage write failures", async () => {
    const error = new Error("disk full");
    invokeAppCommand.mockRejectedValue(error);

    await expect(writeAppStorageFile("savedSchedule", "{}")).rejects.toBe(error);
  });

  it("does not suppress errors from the clear command itself", async () => {
    invokeAppCommand.mockRejectedValue(PERSISTENCE_WRITE_SUPPRESSED_ERROR);

    await expect(clearUserData()).rejects.toBe(PERSISTENCE_WRITE_SUPPRESSED_ERROR);
  });
});
