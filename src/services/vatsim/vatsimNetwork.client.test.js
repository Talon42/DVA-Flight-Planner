import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVatsimNetworkData } from "./vatsimNetwork.client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VATSIM network client", () => {
  it("requests the public snapshot without caching and returns parsed JSON", async () => {
    const payload = { general: { update_timestamp: "fixture" }, controllers: [] };
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload)
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchVatsimNetworkData({ signal })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("https://data.vatsim.net/v3/vatsim-data.json", {
      signal,
      cache: "no-store"
    });
  });

  it("surfaces HTTP failures without attempting to parse a response body", async () => {
    const json = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json }));

    await expect(fetchVatsimNetworkData()).rejects.toThrow(
      "VATSIM data request failed with HTTP 503"
    );
    expect(json).not.toHaveBeenCalled();
  });
});
