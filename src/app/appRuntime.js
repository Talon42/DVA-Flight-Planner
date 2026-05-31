export const THEME_STORAGE_KEY = "flight-planner.theme";
export const DEV_TOOLS_STORAGE_KEY = "flight-planner.dev-tools-enabled";
export const DEV_WINDOW_WIDTH_STORAGE_KEY = "flight-planner.dev-window-width";

// Detects whether the app is running inside the Tauri desktop shell.
export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Detects Windows-specific runtime behavior for desktop-only helpers.
export function isWindowsRuntime() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  return /Windows/i.test(platform) || /Windows/i.test(navigator.userAgent || "");
}

// Reads the saved theme preference while preserving the legacy light default.
export function readSavedTheme() {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}
