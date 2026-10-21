import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";

// Centralizes desktop shell actions so app features stop mixing static and dynamic opener imports.
export async function openDesktopUrl(url) {
  return openUrl(url);
}

// Opens a desktop path and falls back to revealing the item when direct open fails.
export async function openDesktopPath(path) {
  return openPath(path);
}

// Reveals a desktop file path in the host file manager.
export async function revealDesktopPath(path) {
  return revealItemInDir(path);
}
