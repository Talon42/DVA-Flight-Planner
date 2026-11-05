// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWhatsNew } from "./useWhatsNew.hooks.js";

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), fetch: vi.fn(), cards: [] }));
vi.mock("../../services/storage/storage.js", () => ({
  readLastSeenWhatsNewReleaseId: mocks.read, saveLastSeenWhatsNewReleaseId: mocks.save
}));
vi.mock("../../services/updates/releaseHistory.client.js", () => ({ fetchReleaseHistory: mocks.fetch }));
vi.mock("./whatsNewContent.js", () => ({
  WHATS_NEW_APP_VERSION: "1.0.0", WHATS_NEW_ENABLED: true, whatsNewCards: mocks.cards
}));
const releases = [{ version: "v1.0.0", name: "", notes: "Airport updates", publishedAt: "2026-11-01T00:00:00Z" }];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cards.length = 0;
  mocks.read.mockResolvedValue("");
  mocks.save.mockResolvedValue();
  mocks.fetch.mockResolvedValue(releases);
});

describe("useWhatsNew release history", () => {
  it("waits for notes, respects onboarding, and marks the installed version seen on Finish", async () => {
    const { result, rerender } = renderHook((props) => useWhatsNew(props), {
      initialProps: { isGettingStartedOpen: true }
    });
    expect(result.current.hasWhatsNewCards).toBe(true);
    await waitFor(() => expect(result.current.whatsNewCards[0].description).toContain("Airport updates"));
    expect(result.current.shouldShowWhatsNew).toBe(false);
    rerender({ isGettingStartedOpen: false });
    expect(result.current.shouldShowWhatsNew).toBe(true);
    await act(() => result.current.finishWhatsNew());
    expect(mocks.save).toHaveBeenCalledWith("1.0.0");
    expect(result.current.isWhatsNewOpen).toBe(false);
  });

  it("keeps history last after feature cards and allows manual reopening of a seen version", async () => {
    mocks.cards.push({ id: "feature" });
    mocks.read.mockResolvedValue("1.0.0");
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(result.current.whatsNewCards.at(-1).description).toContain("Airport updates"));
    expect(result.current.whatsNewCards.map((card) => card.id)).toEqual(["feature", "release-history"]);
    expect(result.current.shouldShowWhatsNew).toBe(false);
    act(() => result.current.openWhatsNewManually());
    expect(result.current.isWhatsNewOpen).toBe(true);
    expect(result.current.whatsNewMode).toBe("manual");
  });

  it("does not block startup after a failed request and retries on manual open", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("Offline"));
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(result.current.whatsNewCards[0].description).toContain("could not be loaded"));
    expect(result.current.shouldShowWhatsNew).toBe(false);
    act(() => result.current.openWhatsNewManually());
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.whatsNewCards[0].description).toContain("Airport updates"));
  });

  it("keeps an empty history manually accessible without automatically opening", async () => {
    mocks.fetch.mockResolvedValue([]);
    const { result } = renderHook(() => useWhatsNew());
    await waitFor(() => expect(result.current.whatsNewCards[0].description).toContain("No published releases"));
    expect(result.current.shouldShowWhatsNew).toBe(false);
    act(() => result.current.openWhatsNewManually());
    expect(result.current.isWhatsNewOpen).toBe(true);
  });

  it("aborts the history request when unmounted", () => {
    mocks.fetch.mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderHook(() => useWhatsNew());
    const signal = mocks.fetch.mock.calls[0][0].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
