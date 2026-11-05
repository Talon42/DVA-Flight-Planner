import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReleaseHistory } from "./releaseHistory.client.js";

const release = (overrides = {}) => ({
  tag_name: "v1.0.0", name: "Release 1", body: "## Fixed\n- Airport data",
  draft: false, prerelease: false, published_at: "2026-10-01T12:00:00Z", ...overrides
});
const response = (rows) => ({ ok: true, json: async () => rows });

afterEach(() => vi.unstubAllGlobals());

describe("fetchReleaseHistory", () => {
  it("includes only published standard releases, sorted newest first", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([
      release(),
      release({ tag_name: "v2.0.0", published_at: "2026-11-01T12:00:00Z" }),
      release({ prerelease: true }), release({ draft: true }),
      release({ published_at: null }), release({ tag_name: "" }), null
    ])));
    expect((await fetchReleaseHistory()).map((row) => row.version)).toEqual(["v2.0.0", "v1.0.0"]);
  });

  it("fetches older pages even when every item on the first page is excluded", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(Array.from({ length: 100 }, () => release({ prerelease: true }))))
      .mockResolvedValueOnce(response([release({ body: null })]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchReleaseHistory()).toEqual([
      { version: "v1.0.0", name: "Release 1", notes: "", publishedAt: "2026-10-01T12:00:00Z" }
    ]);
    expect(fetchMock.mock.calls[1][0]).toContain("per_page=100&page=2");
  });

  it("fails clearly for HTTP errors or malformed responses", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce(response({ message: "Unexpected" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchReleaseHistory()).rejects.toThrow("status 403");
    await expect(fetchReleaseHistory()).rejects.toThrow("invalid release history");
  });

  it("passes caller cancellation through to the network request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation(async (_url, options) => {
      controller.abort();
      expect(options.signal.aborted).toBe(true);
      throw new DOMException("Aborted", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchReleaseHistory({ signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
