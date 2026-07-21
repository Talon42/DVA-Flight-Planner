// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUserDataLifecycle } from "./useUserDataLifecycle.hooks.js";

vi.mock("../services/storage/uiState.storage.js", () => ({
  suspendUiStateWrites: vi.fn(),
  flushUiStateWrites: vi.fn(async () => {})
}));
vi.mock("../services/storage/simBriefSettings.storage.js", () => ({
  suspendSimBriefSettingsWrites: vi.fn(),
  flushSimBriefSettingsWrites: vi.fn(async () => {})
}));

describe("user data lifecycle", () => {
  it("reloads only after a complete clear", async () => {
    const reloadPage = vi.fn();
    const prepareForUserDataClear = vi.fn();
    const deleteUserData = vi.fn(async () => ({ ok: true, failures: [] }));
    const { result } = renderHook(() => useUserDataLifecycle({
      confirmDelete: async () => true,
      prepareForUserDataClear,
      deleteUserData,
      reloadPage
    }));

    await act(() => result.current.handleDeleteUserData());

    expect(prepareForUserDataClear).toHaveBeenCalledOnce();
    expect(reloadPage).toHaveBeenCalledOnce();
    expect(result.current.clearFailure).toBeNull();
  });

  it("keeps a structured failure available for retry without re-confirming", async () => {
    const deleteUserData = vi.fn()
      .mockResolvedValueOnce({ ok: false, failures: [{ target: "uiState", reasonCode: "in_use" }] })
      .mockResolvedValueOnce({ ok: true, failures: [] });
    const reloadPage = vi.fn();
    const { result } = renderHook(() => useUserDataLifecycle({
      confirmDelete: async () => true,
      deleteUserData,
      reloadPage
    }));

    await act(() => result.current.handleDeleteUserData());
    expect(result.current.clearFailure.failures[0].reasonCode).toBe("in_use");
    await act(() => result.current.retryUserDataClear());
    expect(deleteUserData).toHaveBeenCalledTimes(2);
    expect(reloadPage).toHaveBeenCalledOnce();
  });
});
