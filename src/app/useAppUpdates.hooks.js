import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkForAppUpdate,
  GITHUB_LATEST_EXE_DOWNLOAD_URL
} from "../services/updates/updateCheck.client.js";
import { logAppError, logAppEvent, logSystemError, logSystemEvent } from "../services/logging/appLog.client.js";
import { openDesktopUrl } from "../services/tauri/desktopShell.client.js";

const APP_BUILD_GIT_TAG = String(import.meta.env.VITE_BUILD_GIT_TAG || "").trim() || "local-dev";

// Builds the simulated result used only when Dev Tools intentionally bypasses the real update check.
function buildDevToolsUpdateCheckResult() {
  return {
    updateAvailable: true,
    currentVersion: APP_BUILD_GIT_TAG || "local-dev",
    latestVersion: "dev-simulated-update",
    releaseUrl: GITHUB_LATEST_EXE_DOWNLOAD_URL,
    isDevToolsSimulation: true
  };
}

// Owns update-check UI state and side effects so App.jsx can stay focused on app workflows.
export function useAppUpdates({
  isDesktopAddonScanAvailable,
  isDevToolsEnabled = false,
  isStartupGateComplete = true,
  setStatusMessage
} = {}) {
  const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState(null);
  const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState(false);
  const [isNoUpdatePromptOpen, setIsNoUpdatePromptOpen] = useState(false);
  const hasPerformedStartupUpdateCheckRef = useRef(false);

  const handleCloseUpdatePrompt = useCallback(() => {
    setIsUpdatePromptOpen(false);
    setIsNoUpdatePromptOpen(false);
  }, []);

  const handleCloseNoUpdatePrompt = useCallback(() => {
    setIsUpdatePromptOpen(false);
    setIsNoUpdatePromptOpen(false);
  }, []);

  const handleCheckForUpdates = useCallback(
    async ({ manual = false, allowDevToolsSimulation = false } = {}) => {
      if (!isDesktopAddonScanAvailable || isCheckingForUpdates) {
        return;
      }

      setIsCheckingForUpdates(true);

      try {
        if (allowDevToolsSimulation && isDevToolsEnabled) {
          const simulatedUpdate = buildDevToolsUpdateCheckResult();

          setAvailableUpdate(simulatedUpdate);
          setIsNoUpdatePromptOpen(false);
          setIsUpdatePromptOpen(true);

          if (manual) {
            setStatusMessage?.(`Update available: ${simulatedUpdate.latestVersion}`);
          }

          await logAppEvent("dev-tools-simulated-update-available", {
            currentVersion: simulatedUpdate.currentVersion,
            latestVersion: simulatedUpdate.latestVersion,
            updateAvailable: true
          });
          return;
        }

        const result = await checkForAppUpdate();
        setAvailableUpdate(result);

        if (result.updateAvailable) {
          setIsUpdatePromptOpen(true);
          setIsNoUpdatePromptOpen(false);
          if (manual) {
            setStatusMessage?.(`Update available: ${result.latestVersion}`);
          }
          await logSystemEvent("Update", "check-complete", {
            currentVersion: result.currentVersion,
            latestVersion: result.latestVersion,
            updateAvailable: true
          });
          return;
        }

        if (manual) {
          setIsUpdatePromptOpen(false);
          setIsNoUpdatePromptOpen(true);
          setStatusMessage?.("No update required, currently on the latest version.");
        }

        await logSystemEvent("Update", "check-complete", {
          currentVersion: result.currentVersion,
          latestVersion: result.latestVersion,
          updateAvailable: false
        });
      } catch (error) {
        await logSystemError("Update", "check-failed", error, {
          manual
        });
      } finally {
        setIsCheckingForUpdates(false);
      }
    },
    [isCheckingForUpdates, isDesktopAddonScanAvailable, isDevToolsEnabled, setStatusMessage]
  );

  const handleDownloadUpdate = useCallback(async () => {
    const downloadUrl = GITHUB_LATEST_EXE_DOWNLOAD_URL;

    try {
      if (isDesktopAddonScanAvailable) {
        await openDesktopUrl(downloadUrl);
      } else {
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
      }

      setIsUpdatePromptOpen(false);

      await logAppEvent("update-download-opened", {
        downloadUrl,
        latestVersion: availableUpdate?.latestVersion || ""
      });
    } catch (error) {
      await logAppError("update-download-open-failed", error, {
        downloadUrl
      });
    }
  }, [availableUpdate, isDesktopAddonScanAvailable]);

  useEffect(() => {
    if (!isUpdatePromptOpen && !isNoUpdatePromptOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        handleCloseUpdatePrompt();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCloseUpdatePrompt, isNoUpdatePromptOpen, isUpdatePromptOpen]);

  useEffect(() => {
    if (
      !isDesktopAddonScanAvailable ||
      hasPerformedStartupUpdateCheckRef.current ||
      !isStartupGateComplete
    ) {
      return;
    }

    hasPerformedStartupUpdateCheckRef.current = true;

    void handleCheckForUpdates({ manual: false });
  }, [handleCheckForUpdates, isDesktopAddonScanAvailable, isStartupGateComplete]);

  return {
    isCheckingForUpdates,
    setIsCheckingForUpdates,
    availableUpdate,
    setAvailableUpdate,
    isUpdatePromptOpen,
    setIsUpdatePromptOpen,
    isNoUpdatePromptOpen,
    setIsNoUpdatePromptOpen,
    handleCheckForUpdates,
    handleCloseUpdatePrompt,
    handleCloseNoUpdatePrompt,
    handleDownloadUpdate
  };
}
