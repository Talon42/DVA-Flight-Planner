// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDeltaVirtualPirepDetails } from "../../services/tauri/deltaVirtual.client.js";
import { useVisibleLogbookPirepDetails } from "./useLogbookPirepDetails.hooks.js";

vi.mock("../../services/tauri/deltaVirtual.client.js", () => ({
  fetchDeltaVirtualPirepDetails: vi.fn()
}));

function row(dvaPirepId) {
  return { dvaPirepId };
}

describe("useVisibleLogbookPirepDetails", () => {
  beforeEach(() => {
    fetchDeltaVirtualPirepDetails.mockReset();
    fetchDeltaVirtualPirepDetails.mockImplementation(async (id) => ({ id, routeSummary: `route-${id}` }));
  });

  it("does not refetch or replace state for an equivalent visible ID list", async () => {
    const { result, rerender } = renderHook(
      ({ rows }) => useVisibleLogbookPirepDetails(rows),
      { initialProps: { rows: [row("0xabc101"), row("0xabc101")] } }
    );

    await waitFor(() => expect(result.current["0xabc101"]?.routeSummary).toBe("route-0xabc101"));
    const firstDetailsMap = result.current;

    rerender({ rows: [row("0xabc101"), row("0xabc101")] });

    expect(fetchDeltaVirtualPirepDetails).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(firstDetailsMap);
  });

  it("fetches when the semantic visible ID list changes", async () => {
    const { rerender } = renderHook(
      ({ rows }) => useVisibleLogbookPirepDetails(rows),
      { initialProps: { rows: [row("0xabc201")] } }
    );
    await waitFor(() => expect(fetchDeltaVirtualPirepDetails).toHaveBeenCalledWith("0xabc201"));

    rerender({ rows: [row("0xabc202")] });

    await waitFor(() => expect(fetchDeltaVirtualPirepDetails).toHaveBeenCalledWith("0xabc202"));
    expect(fetchDeltaVirtualPirepDetails).toHaveBeenCalledTimes(2);
  });

  it("never fetches rows hidden beyond the visible limit", async () => {
    renderHook(() =>
      useVisibleLogbookPirepDetails([row("0xabc301"), row("0xabc302")], { limit: 1 })
    );

    await waitFor(() => expect(fetchDeltaVirtualPirepDetails).toHaveBeenCalledWith("0xabc301"));
    expect(fetchDeltaVirtualPirepDetails).not.toHaveBeenCalledWith("0xabc302");
  });
});
