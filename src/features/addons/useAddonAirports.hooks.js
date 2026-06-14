import { useCallback, useState } from "react";
import { formatNumber } from "../../domain/formatting/formatters.js";
import {
  createLogRunId,
  logAppError,
  logSystemDebug,
  logSystemError,
  logSystemEvent
} from "../../services/logging/appLog.client.js";
import { writeGettingStartedState } from "../../services/storage/storage.js";
import {
  createEmptyAddonAirportScan,
  pickAddonAirportFolder,
  saveAddonAirportRoots,
  scanAddonAirports
} from "../../services/tauri/addonAirportScan.client.js";

function buildAddonScanSummary(addonScan) {
  return {
    airportsCached: addonScan?.airports?.length || 0,
    contentHistoryFilesScanned: addonScan?.contentHistoryFilesScanned || 0,
    manifestFilesScanned: addonScan?.manifestFilesScanned || 0,
    manifestFallbacksUsed: addonScan?.manifestFallbacksUsed || 0,
    duplicateAirportEntries: addonScan?.duplicateAirportEntries || 0,
    status: addonScan?.status || "idle",
    warningCount: Array.isArray(addonScan?.warnings) ? addonScan.warnings.length : 0
  };
}

// Owns the addon-airport workflow state so App.jsx can keep startup hydration and other
// broader app flows separate.
export function useAddonAirports({
  gettingStartedState,
  setGettingStartedState,
  setStatusMessage
} = {}) {
  const [addonScan, setAddonScan] = useState(createEmptyAddonAirportScan);
  const [isAddonScanBusy, setIsAddonScanBusy] = useState(false);
  const [isAddonAutoScanning, setIsAddonAutoScanning] = useState(false);

  const persistAddonRoots = useCallback(async (nextRoots) => {
    const nextScan = await saveAddonAirportRoots(nextRoots);
    setAddonScan(nextScan);
    return nextScan;
  }, []);

  const handlePickAddonAirportFolder = useCallback(async () => {
    try {
      const path = await pickAddonAirportFolder();
      return String(path || "").trim();
    } catch (error) {
      setStatusMessage?.(error.message || "Unable to choose an addon folder.");
      await logSystemError("AddonScan", "root-pick-failed", error);
      return "";
    }
  }, [setStatusMessage]);

  const handleSaveAddonAirportRoots = useCallback(
    async (nextRoots = []) => {
      try {
        return await persistAddonRoots(nextRoots);
      } catch (error) {
        setStatusMessage?.(error.message || "Unable to update addon folder list.");
        await logSystemError("AddonScan", "roots-save-failed", error);
        return null;
      }
    },
    [persistAddonRoots, setStatusMessage]
  );

  const handleScanAddonAirports = useCallback(
    async (roots = addonScan.roots, options = {}) => {
      if (!roots.length) {
        await logSystemEvent("AddonScan", "scan-skipped-no-roots");
        return null;
      }

      const scanRunId = createLogRunId("scan");
      const scanStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      setIsAddonAutoScanning(true);

      if (options.resetCache) {
        // Clear the stored results for this root set before starting a fresh scan.
        await persistAddonRoots(roots);
      }

      setIsAddonScanBusy(true);
      setStatusMessage?.("Scanning addon folders for ContentHistory.json and manifest.json...");
      await logSystemEvent("AddonScan", "scan-start", {
        scanRunId,
        rootCount: roots.length,
        previousAirportsCached: options.resetCache ? 0 : addonScan.airports.length,
        previousContentHistoryFilesScanned: options.resetCache ? 0 : addonScan.contentHistoryFilesScanned,
        previousManifestFilesScanned: options.resetCache ? 0 : addonScan.manifestFilesScanned
      });

      try {
        const nextScan = await scanAddonAirports(roots);
        setAddonScan(nextScan);
        setStatusMessage?.(
          `Scan complete. Cached ${formatNumber(nextScan.airports.length)} addon airports.`
        );
        await logSystemEvent("AddonScan", "scan-succeeded", {
          scanRunId,
          durationMs: Math.max(
            0,
            Math.round(
              (typeof performance !== "undefined" ? performance.now() : Date.now()) - scanStartedAt
            )
          ),
          ...buildAddonScanSummary(nextScan)
        });
        if (Array.isArray(nextScan.scanDetails) && nextScan.scanDetails.length) {
          await logSystemDebug("AddonScan", "scan-details", {
            scanRunId,
            scanDetails: nextScan.scanDetails
          });
        }
        return nextScan;
      } catch (error) {
        setStatusMessage?.(error.message || "Addon airport scan failed.");
        await logSystemError("AddonScan", "scan-failed", error, {
          scanRunId,
          rootCount: roots.length,
          durationMs: Math.max(
            0,
            Math.round(
              (typeof performance !== "undefined" ? performance.now() : Date.now()) - scanStartedAt
            )
          )
        });
        return null;
      } finally {
        setIsAddonScanBusy(false);
        setIsAddonAutoScanning(false);
      }
    },
    [
      addonScan.airports.length,
      addonScan.contentHistoryFilesScanned,
      addonScan.manifestFilesScanned,
      addonScan.roots,
      persistAddonRoots,
      setStatusMessage
    ]
  );

  const handleResetAddonAirportScan = useCallback(() => {
    setAddonScan(createEmptyAddonAirportScan());
    setIsAddonScanBusy(false);
    setIsAddonAutoScanning(false);
  }, []);

  const handleAddAddonRoot = useCallback(async () => {
    try {
      const path = await handlePickAddonAirportFolder();
      if (!path) {
        await logSystemEvent("AddonScan", "root-add-cancelled");
        return false;
      }

      const nextRoots = [...new Set([...addonScan.roots, path])];
      await handleSaveAddonAirportRoots(nextRoots);
      await handleScanAddonAirports(nextRoots);
      await logSystemEvent("AddonScan", "root-added", {
        rootCount: nextRoots.length
      });
      return true;
    } catch (error) {
      setStatusMessage?.(error.message || "Unable to add addon folder.");
      await logSystemError("AddonScan", "root-add-failed", error);
      return false;
    }
  }, [addonScan.roots, handlePickAddonAirportFolder, handleSaveAddonAirportRoots, handleScanAddonAirports, setStatusMessage]);

  const handleRemoveAddonRoot = useCallback(
    async (rootToRemove) => {
      try {
        const nextRoots = addonScan.roots.filter((root) => root !== rootToRemove);
        await handleSaveAddonAirportRoots(nextRoots);
        setStatusMessage?.(
          nextRoots.length
            ? `Removed addon folder. ${formatNumber(nextRoots.length)} roots remain.`
            : "Removed addon folder. No roots saved."
        );
        await logSystemEvent("AddonScan", "root-removed", {
          rootCount: nextRoots.length
        });
      } catch (error) {
        setStatusMessage?.(error.message || "Unable to update addon folder list.");
        await logSystemError("AddonScan", "root-remove-failed", error);
      }
    },
    [addonScan.roots, handleSaveAddonAirportRoots, setStatusMessage]
  );

  const handleSkipAddonSetup = useCallback(async () => {
    try {
      const nextState = {
        ...gettingStartedState,
        addonSetupSkipped: true
      };
      await writeGettingStartedState({
        gettingStartedDismissed: Boolean(nextState?.gettingStartedDismissed),
        gettingStartedFinalized: Boolean(nextState?.gettingStartedFinalized),
        addonSetupSkipped: true
      });
      setGettingStartedState?.({
        gettingStartedDismissed: Boolean(nextState?.gettingStartedDismissed),
        gettingStartedFinalized: Boolean(nextState?.gettingStartedFinalized),
        addonSetupSkipped: true
      });
      return true;
    } catch (error) {
      setStatusMessage?.(error.message || "Unable to save addon setup preference.");
      await logAppError("addon-setup-skip-failed", error);
      return false;
    }
  }, [gettingStartedState, setGettingStartedState, setStatusMessage]);

  return {
    addonScan,
    setAddonScan,
    isAddonScanBusy,
    setIsAddonScanBusy,
    isAddonAutoScanning,
    setIsAddonAutoScanning,
    handlePickAddonAirportFolder,
    handleSaveAddonAirportRoots,
    handleScanAddonAirports,
    handleResetAddonAirportScan,
    handleSkipAddonSetup,
    handleAddAddonRoot,
    handleRemoveAddonRoot
  };
}
