import { useRef, useState } from "react";
import {
  DEV_TOOLS_STORAGE_KEY,
  DEV_WINDOW_WIDTH_STORAGE_KEY
} from "./appRuntime.js";
import { logAppError, logAppEvent } from "../services/logging/appLog.client.js";
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

  function handleOpenDevContextMenu(event) {
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
  }

  function handleCloseDevContextMenu() {
    setIsDevWindowMenuOpen(false);
    setIsDevContextMenuOpen(false);
  }

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
