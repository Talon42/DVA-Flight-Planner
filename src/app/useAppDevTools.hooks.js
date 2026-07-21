import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEV_TOOLS_STORAGE_KEY,
  DEV_WINDOW_WIDTH_STORAGE_KEY,
  isWindowsRuntime
} from "./appRuntime.js";
import {
  logAppError,
  logAppEvent,
  setDebugLoggingEnabled
} from "../services/logging/appLog.client.js";
import {
  readSavedDevToolsEnabled as readPersistedDevToolsEnabled,
  writeSavedDevToolsEnabled
} from "../services/storage/storage.js";
import { invokeAppCommand } from "../services/tauri/invoke.client.js";

export const DEV_WINDOW_WIDTH_PRESETS = [
  { width: 1920, height: 900, label: "1920x900" },
  { width: 1400, height: 900, label: "1400x900" },
  { width: 1024, height: 768, label: "1024x768" }
];

function readSavedDevToolsEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(DEV_TOOLS_STORAGE_KEY) === "true";
}

function readSavedDevWindowWidth() {
  if (typeof window === "undefined") {
    return null;
  }

  const savedWidth = Number(window.localStorage.getItem(DEV_WINDOW_WIDTH_STORAGE_KEY));
  return DEV_WINDOW_WIDTH_PRESETS.some((option) => option.width === savedWidth) ? savedWidth : null;
}

// Owns the developer-tools window state so App.jsx can keep the broader app logic focused.
export function useAppDevTools({ isDesktopAddonScanAvailable, setStatusMessage }) {
  const [isDevToolsEnabled, setIsDevToolsEnabled] = useState(readSavedDevToolsEnabled);
  const [devWindowWidth, setDevWindowWidth] = useState(readSavedDevWindowWidth);
  const [isDevWindowMenuOpen, setIsDevWindowMenuOpen] = useState(false);
  const [isDevContextMenuOpen, setIsDevContextMenuOpen] = useState(false);
  const [devContextMenuPosition, setDevContextMenuPosition] = useState({ x: 0, y: 0 });
  const devWindowMenuRef = useRef(null);
  const devContextMenuRef = useRef(null);

  const selectedDevWindowPreset =
    DEV_WINDOW_WIDTH_PRESETS.find((option) => option.width === devWindowWidth) || null;

  useEffect(() => {
    let cancelled = false;

    async function hydrateDevToolsPreference() {
      try {
        const persistedValue = await readPersistedDevToolsEnabled();
        if (!cancelled && typeof persistedValue === "boolean") {
          setIsDevToolsEnabled(persistedValue);
        }
      } catch {
        // Best-effort only. The browser fallback remains available.
      }
    }

    void hydrateDevToolsPreference();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeSavedDevToolsEnabled(isDevToolsEnabled).catch(() => {
      // Persistence is best-effort.
    });
  }, [isDevToolsEnabled]);

  useEffect(() => {
    window.localStorage.setItem(DEV_TOOLS_STORAGE_KEY, isDevToolsEnabled ? "true" : "false");
  }, [isDevToolsEnabled]);

  useEffect(() => {
    if (devWindowWidth === null) {
      window.localStorage.removeItem(DEV_WINDOW_WIDTH_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(DEV_WINDOW_WIDTH_STORAGE_KEY, String(devWindowWidth));
  }, [devWindowWidth]);

  function handleToggleDevTools() {
    const nextValue = !isDevToolsEnabled;
    setIsDevToolsEnabled(nextValue);
    if (!nextValue) {
      setIsDevWindowMenuOpen(false);
      setIsDevContextMenuOpen(false);
    }

    logAppEvent(nextValue ? "dev-tools-enabled" : "dev-tools-disabled", {
      selectedWidth: devWindowWidth
    }).catch(() => {});
  }

  function handleToggleDevWindowMenu() {
    setIsDevContextMenuOpen(false);
    setIsDevWindowMenuOpen((current) => !current);
  }

  const handleOpenDevContextMenu = useCallback((event) => {
    if (!isDevToolsEnabled || !isDesktopAddonScanAvailable) {
      setIsDevWindowMenuOpen(false);
      setIsDevContextMenuOpen(false);
      return;
    }

    setIsDevWindowMenuOpen(false);
    setIsDevContextMenuOpen(true);
    setDevContextMenuPosition({
      x: Math.max(12, Math.min(event.clientX, Math.max(12, window.innerWidth - 236))),
      y: Math.max(12, Math.min(event.clientY, Math.max(12, window.innerHeight - 72)))
    });
  }, [isDesktopAddonScanAvailable, isDevToolsEnabled]);

  const handleCloseDevContextMenu = useCallback(() => {
    setIsDevWindowMenuOpen(false);
    setIsDevContextMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!isDevWindowMenuOpen && !isDevContextMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (
        !devWindowMenuRef.current?.contains(event.target) &&
        !devContextMenuRef.current?.contains(event.target)
      ) {
        handleCloseDevContextMenu();
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        handleCloseDevContextMenu();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCloseDevContextMenu, isDevContextMenuOpen, isDevWindowMenuOpen]);

  useEffect(() => {
    // Dev mode swaps the browser's default right-click menu for a menu that can open Dev Tools.
    function handleContextMenu(event) {
      event.preventDefault();
      handleOpenDevContextMenu(event);
    }

    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [handleOpenDevContextMenu]);

  useEffect(() => {
    if (!isDevToolsEnabled) {
      handleCloseDevContextMenu();
    }
  }, [handleCloseDevContextMenu, isDevToolsEnabled]);

  useEffect(() => {
    if (!isDesktopAddonScanAvailable || !isWindowsRuntime()) {
      return undefined;
    }

    let cancelled = false;

    // Keep the desktop window pinned above others while dev tools are enabled on Windows.
    async function syncAlwaysOnTop() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (!cancelled) {
          await getCurrentWindow().setAlwaysOnTop(isDevToolsEnabled);
        }
      } catch (error) {
        await logAppError("window-always-on-top-sync-failed", error);
      }
    }

    void syncAlwaysOnTop();
    return () => {
      cancelled = true;
    };
  }, [isDevToolsEnabled, isDesktopAddonScanAvailable]);

  useEffect(() => {
    setDebugLoggingEnabled(isDevToolsEnabled);
  }, [isDevToolsEnabled]);

  async function handleOpenMainDevtools() {
    if (!isDesktopAddonScanAvailable || !isDevToolsEnabled) {
      return;
    }

    setIsDevWindowMenuOpen(false);
    setIsDevContextMenuOpen(false);

    try {
      await invokeAppCommand("open_main_devtools", {}, { subsystem: "DevTools" });
    } catch (error) {
      setStatusMessage(error.message || "Unable to open Dev Tools.");
      await logAppError("open-devtools-failed", error);
    }
  }

  async function handleSelectDevWindowWidth(width) {
    if (!isDesktopAddonScanAvailable) {
      setStatusMessage("Window size presets are only available in the desktop app.");
      setIsDevWindowMenuOpen(false);
      return;
    }

    const selectedPreset = DEV_WINDOW_WIDTH_PRESETS.find((option) => option.width === width);
    if (!selectedPreset) {
      return;
    }

    try {
      const [{ getCurrentWindow }, { LogicalSize }] = await Promise.all([
        import("@tauri-apps/api/window"),
        import("@tauri-apps/api/dpi")
      ]);
      const currentWindow = getCurrentWindow();

      if (await currentWindow.isMaximized()) {
        await currentWindow.unmaximize();
      }

      await currentWindow.setSize(new LogicalSize(selectedPreset.width, selectedPreset.height));

      setDevWindowWidth(width);
      setIsDevWindowMenuOpen(false);
      setStatusMessage(`Responsive window size set to ${selectedPreset.label}.`);
      await logAppEvent("dev-window-width-selected", {
        width: selectedPreset.width,
        height: selectedPreset.height
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to change the window width.");
      await logAppError("dev-window-width-select-failed", error);
    }
  }

  return {
    isDevToolsEnabled,
    setIsDevToolsEnabled,
    devWindowWidth,
    setDevWindowWidth,
    isDevWindowMenuOpen,
    setIsDevWindowMenuOpen,
    isDevContextMenuOpen,
    setIsDevContextMenuOpen,
    devContextMenuPosition,
    setDevContextMenuPosition,
    devWindowMenuRef,
    devContextMenuRef,
    selectedDevWindowPreset,
    devWindowWidthPresets: DEV_WINDOW_WIDTH_PRESETS,
    handleToggleDevTools,
    handleToggleDevWindowMenu,
    handleOpenDevContextMenu,
    handleCloseDevContextMenu,
    handleOpenMainDevtools,
    handleSelectDevWindowWidth
  };
}
