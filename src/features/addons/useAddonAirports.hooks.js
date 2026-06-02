import { useCallback, useState } from "react";
import { formatNumber } from "../../domain/formatting/formatters.js";
import { logAppError, logSystemError, logSystemEvent } from "../../services/logging/appLog.client.js";
import { writeGettingStartedState } from "../../services/storage/storage.js";
import {
  createEmptyAddonAirportScan,
  pickAddonAirportFolder,
  saveAddonAirportRoots,
  scanAddonAirports
} from "../../services/tauri/addonAirportScan.client.js";

function buildAddonScanSummary(addonScan) {
  return {
    rootCount: addonScan?.roots?.length || 0,
    airportsCached: addonScan?.airports?.length || 0,
    filesScanned: addonScan?.contentHistoryFilesScanned || 0,
    entriesFound: addonScan?.airportEntriesFound || 0,
    contentHistoryFilesScanned: addonScan?.contentHistoryFilesScanned || 0,
    manifestFilesScanned: addonScan?.manifestFilesScanned || 0,
    manifestFallbacksUsed: addonScan?.manifestFallbacksUsed || 0,
    airportEntriesFound: addonScan?.airportEntriesFound || 0,
    manifestAirportEntriesFound: addonScan?.manifestAirportEntriesFound || 0,
    duplicateAirportEntries: addonScan?.duplicateAirportEntries || 0,
    status: addonScan?.status || "idle",
    warningCount: Array.isArray(addonScan?.warnings) ? addonScan.warnings.length : 0,
    airportPreview: Array.isArray(addonScan?.airports) ? addonScan.airports.slice(0, 12) : []
  };
}

// Owns the addon-airport workflow state so App.jsx can keep startup hydration and other
// broader app flows separate.
export function useAddonAirports({
  gettingStartedState,
  isDevToolsEnabled,
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

      setIsAddonAutoScanning(true);

      if (options.resetCache) {
        // Clear the stored results for this root set before starting a fresh scan.
        await persistAddonRoots(roots);
      }

      setIsAddonScanBusy(true);
      setStatusMessage?.("Scanning addon folders for ContentHistory.json and manifest.json...");
      await logSystemEvent("AddonScan", "scan-start", {
        rootCount: roots.length,
        airportsCached: options.resetCache ? 0 : addonScan.airports.length,
        contentHistoryFilesScanned: addonScan.contentHistoryFilesScanned,
        manifestFilesScanned: addonScan.manifestFilesScanned
      });

      try {
        const nextScan = await scanAddonAirports(roots);
        setAddonScan(nextScan);
        setStatusMessage?.(
          `Scanned ${formatNumber(nextScan.contentHistoryFilesScanned)} ContentHistory files and ${formatNumber(nextScan.manifestFilesScanned)} manifest files, then cached ${formatNumber(nextScan.airports.length)} addon airports.`
        );
        await logSystemEvent("AddonScan", "scan-succeeded", buildAddonScanSummary(nextScan));
        if (isDevToolsEnabled && Array.isArray(nextScan.scanDetails) && nextScan.scanDetails.length) {
          await logSystemEvent("AddonScan", "scan-details", {
            scanDetails: nextScan.scanDetails
          });
        }
        return nextScan;
      } catch (error) {
        setStatusMessage?.(error.message || "Addon airport scan failed.");
        await logSystemError("AddonScan", "scan-failed", error, {
          rootCount: roots.length
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
      isDevToolsEnabled,
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
