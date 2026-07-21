// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setDebugLoggingEnabled } from "../services/logging/appLog.client.js";
import { writeSavedDevToolsEnabled } from "../services/storage/storage.js";
import { useAppDevTools } from "./useAppDevTools.hooks.js";

vi.mock("../services/logging/appLog.client.js", () => ({
  logAppError: vi.fn(),
  logAppEvent: vi.fn(() => Promise.resolve()),
  setDebugLoggingEnabled: vi.fn()
}));

vi.mock("../services/storage/storage.js", () => ({
  readSavedDevToolsEnabled: vi.fn(() => Promise.resolve(null)),
  writeSavedDevToolsEnabled: vi.fn(() => Promise.resolve())
}));

describe("useAppDevTools lifecycle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("persists and applies the developer-tools preference", async () => {
    const { result } = renderHook(() =>
      useAppDevTools({ isDesktopAddonScanAvailable: false, setStatusMessage: vi.fn() })
    );

    act(() => result.current.handleToggleDevTools());

    await waitFor(() => expect(writeSavedDevToolsEnabled).toHaveBeenLastCalledWith(true));
    expect(window.localStorage.getItem("flight-planner.dev-tools-enabled")).toBe("true");
    expect(setDebugLoggingEnabled).toHaveBeenLastCalledWith(true);
  });

  it("owns the global context-menu and escape-key workflow", () => {
    const { result } = renderHook(() =>
      useAppDevTools({ isDesktopAddonScanAvailable: true, setStatusMessage: vi.fn() })
    );

    act(() => result.current.handleToggleDevTools());
    act(() => {
      window.dispatchEvent(new MouseEvent("contextmenu", { clientX: 100, clientY: 120 }));
    });
    expect(result.current.isDevContextMenuOpen).toBe(true);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(result.current.isDevContextMenuOpen).toBe(false);
  });
});
