// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAppConfirmations } from "./useAppConfirmations.hooks.js";

describe("useAppConfirmations", () => {
  it("resolves and clears one pending resolver per confirmation type", async () => {
    const { result } = renderHook(() => useAppConfirmations());
    let confirmation;
    act(() => {
      confirmation = result.current.confirmDeleteUserDataInApp();
    });
    expect(result.current.isDeleteUserDataConfirmOpen).toBe(true);
    act(() => result.current.resolveDeleteUserDataConfirmation(true));
    await expect(confirmation).resolves.toBe(true);
    expect(result.current.isDeleteUserDataConfirmOpen).toBe(false);
  });

  it("safely rejects a pending confirmation when the owner unmounts", async () => {
    const { result, unmount } = renderHook(() => useAppConfirmations());
    let confirmation;
    act(() => {
      confirmation = result.current.confirmDutyBoardOverwriteInApp();
    });
    unmount();
    await expect(confirmation).resolves.toBe(false);
  });
});
