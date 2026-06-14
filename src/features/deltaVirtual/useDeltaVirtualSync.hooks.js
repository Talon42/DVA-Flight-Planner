import { useCallback, useState } from "react";
import { DEFAULT_DERIVED_TOUR_PROGRESS } from "../tours/tours.constants.js";
import {
  createLogRunId,
  logAppDebug,
  logSystemError,
  logSystemEvent
} from "../../services/logging/appLog.client.js";
import { readDeltaVirtualCredentials } from "../../services/tauri/deltaVirtualCredentials.client.js";
import { readDeltaVirtualTourProgress } from "../../services/storage/storage.js";
import {
  readDeltaVirtualAccomplishmentEligibility,
  closeDeltaVirtualSyncWindow,
  pruneDeltaVirtualStorage,
  resetDeltaVirtualSyncSession,
  readDeltaVirtualLogbookProgress,
  syncDeltaVirtualTours,
  syncScheduleFromDeltaVirtual
} from "../../services/tauri/deltaVirtual.client.js";

const DELTA_VIRTUAL_SYNC_TIMEOUT_MS = 30_000;

function withTimeout(promise, timeoutMs, createError) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(createError()), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

// Owns the Delta Virtual sync workflow so App.jsx can keep the shell and settings wiring thin.
export function useDeltaVirtualSync({
  dvaFirstName = "",
  dvaHasPassword = false,
  dvaLastName = "",
  isDevToolsEnabled = false,
  processImportedSchedule,
  onLogbookSyncComplete,
  onScheduleSyncComplete,
  setDerivedTourProgress,
  setDeltaVirtualToursCache,
  setDeltaVirtualAccomplishmentEligibility,
  setDvaHasPassword,
  setDvaSyncWarning,
  setLogbookAirportProgress,
  setStatusMessage
} = {}) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleCloseDvaSyncWarning = useCallback(() => {
    setDvaSyncWarning?.(null);
  }, [setDvaSyncWarning]);

  const refreshSavedCredentials = useCallback(async () => {
    try {
      const refreshedDeltaCredentials = await readDeltaVirtualCredentials();
      setDvaHasPassword?.(Boolean(refreshedDeltaCredentials.hasPassword));
    } catch {
      // Best-effort refresh only.
    }
  }, [setDvaHasPassword]);

  const reloadTourProgress = useCallback(async () => {
    await logAppDebug("dva-tour-progress-reload-started", {
      reason: "post-dva-sync"
    });

    try {
      const reloadedTourProgress = await readDeltaVirtualTourProgress();
      setDerivedTourProgress?.(reloadedTourProgress);

      const tourCount = Object.keys(reloadedTourProgress?.tourProgress || {}).length;
      const completedRowCount = Object.values(reloadedTourProgress?.tourProgress || {}).reduce(
        (count, tourEntry) => count + Object.keys(tourEntry?.rows || {}).length,
        0
      );

      await logAppDebug("dva-tour-progress-reload-succeeded", {
        totalDerivedTours: tourCount,
        totalDerivedCompletedRows: completedRowCount,
        lastSyncAt: reloadedTourProgress?.lastSyncAt || null
      });
    } catch (error) {
      setDerivedTourProgress?.(DEFAULT_DERIVED_TOUR_PROGRESS);
      await logAppDebug("dva-tour-progress-reload-failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }, [setDerivedTourProgress]);

  const reloadAccomplishmentEligibility = useCallback(async () => {
    const eligibility = await readDeltaVirtualAccomplishmentEligibility();
    setDeltaVirtualAccomplishmentEligibility?.(eligibility);

    const count = Array.isArray(eligibility?.rows) ? eligibility.rows.length : 0;
    const achievedCount = (eligibility?.rows || []).filter((row) => Boolean(row?.achieved)).length;

    await logAppDebug("dva-accomplishment-eligibility-reload-succeeded", {
      count,
      achievedCount,
      incompleteCount: Math.max(count - achievedCount, 0),
      sourceUrl: eligibility?.sourceUrl || null,
      lastSyncAt: eligibility?.lastSyncAt || null
    });
  }, [setDeltaVirtualAccomplishmentEligibility]);

  const handleDeltaVirtualSync = useCallback(async () => {
    const syncRunId = createLogRunId("sync");
    const syncStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    await logSystemEvent("DVA Sync", "started", {
      syncRunId
    });

    const hasSavedDeltaVirtualCredentials =
      Boolean(String(dvaFirstName || "").trim()) &&
      Boolean(String(dvaLastName || "").trim()) &&
      Boolean(dvaHasPassword);

    if (!hasSavedDeltaVirtualCredentials) {
      const message =
        "Delta Virtual login settings are not saved in the app, so sync cannot be performed. Save your First Name, Last Name, and Password in Delta Virtual settings first.";
      setDvaSyncWarning?.({
        kind: "missing_credentials",
        title: "Credentials are not saved.",
        message,
        primaryAction: "open_delta_virtual_settings",
        primaryLabel: "Fix Now"
      });
      setStatusMessage?.(message);
      await logSystemError(
        "DVA Sync",
        "failed",
        new Error("Delta Virtual login settings are not saved."),
        { syncRunId, reason: "missing-credentials", stage: "credentials" }
      );
      return;
    }

    setIsSyncing(true);
    setStatusMessage?.("Syncing data from Delta Virtual.");
    let shouldRemoveDownloadedSchedule = false;
    let shouldResetSyncSession = false;

    try {
      setStatusMessage?.("Syncing data from Delta Virtual.");
      const syncedFile = await withTimeout(
        syncScheduleFromDeltaVirtual({ syncRunId, debugEnabled: isDevToolsEnabled }),
        DELTA_VIRTUAL_SYNC_TIMEOUT_MS,
        () => {
          const error = new Error("Delta Virtual Sync timed out after 30 seconds.");
          error.kind = "sync_timeout";
          return error;
        }
      );
      await logSystemEvent("DVA Sync", "succeeded", {
        syncRunId,
        file: syncedFile.fileName,
        bytes: syncedFile.xmlText?.length || 0,
        logbookJson: syncedFile.logbookJson?.fileName || null,
        warningCount: Array.isArray(syncedFile.warnings) ? syncedFile.warnings.length : 0,
        durationMs: Math.max(
          0,
          Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - syncStartedAt
          )
        )
      });
      setStatusMessage?.("Processing Delta Virtual schedule...");
      await processImportedSchedule?.(syncedFile, "deltava-sync");
      onScheduleSyncComplete?.();
      setLogbookAirportProgress?.(await readDeltaVirtualLogbookProgress());
      onLogbookSyncComplete?.();
      await reloadAccomplishmentEligibility();
      await refreshSavedCredentials();
      if (syncedFile.warnings?.length) {
        setStatusMessage?.(`Delta Virtual schedule synced with warning: ${syncedFile.warnings[0]}`);
      }
      setStatusMessage?.("Syncing Delta Virtual tours...");
      try {
        const tourSyncResult = await syncDeltaVirtualTours({
          syncRunId,
          debugEnabled: isDevToolsEnabled
        });
        setDeltaVirtualToursCache?.(tourSyncResult);

        if (tourSyncResult.ok) {
          await logSystemEvent("DVA Tours Sync", "succeeded", {
            syncRunId,
            totalListTours: tourSyncResult.totalListTours,
            candidateTours: tourSyncResult.candidateTours,
            syncedTours: tourSyncResult.syncedTours,
            failedTourIds: tourSyncResult.failedTourIds.length
          });
          setStatusMessage?.(tourSyncResult.message || "Delta Virtual tours synced.");
        } else if (tourSyncResult.syncedTours > 0) {
          await logSystemEvent("DVA Tours Sync", "succeeded", {
            syncRunId,
            partial: true,
            totalListTours: tourSyncResult.totalListTours,
            candidateTours: tourSyncResult.candidateTours,
            syncedTours: tourSyncResult.syncedTours,
            failedTourIds: tourSyncResult.failedTourIds.length
          });
          setStatusMessage?.(tourSyncResult.message || "Delta Virtual tours synced with warnings.");
        } else {
          await logSystemError(
            "DVA Tours Sync",
            "failed",
            new Error(tourSyncResult.message || "Delta Virtual tours sync failed."),
            {
              syncRunId,
              totalListTours: tourSyncResult.totalListTours,
              candidateTours: tourSyncResult.candidateTours,
              syncedTours: tourSyncResult.syncedTours,
              failedTourIds: tourSyncResult.failedTourIds.length
            }
          );
          setStatusMessage?.(tourSyncResult.message || "Delta Virtual tours sync failed.");
        }
      } catch (error) {
        setStatusMessage?.(error.message || "Delta Virtual tours sync failed.");
        await logSystemError("DVA Tours Sync", "failed", error, {
          syncRunId,
          stage: "tours"
        });
      }

      await reloadTourProgress();
      shouldRemoveDownloadedSchedule = true;
    } catch (error) {
      if (error?.kind === "cancelled") {
        setStatusMessage?.("Delta Virtual sync canceled.");
        await logSystemEvent("DVA Sync", "failed", {
          syncRunId,
          reason: "cancelled"
        });
      } else if (error?.kind === "auth_failed") {
        const message =
          "Delta Virtual Sync failed. Please check that your First Name, Last Name, and Password are correct, then try again.";
        setStatusMessage?.(message);
        setDvaSyncWarning?.({
          kind: "auth_failed",
          title: "Delta Virtual Sync failed.",
          message,
          primaryAction: "open_delta_virtual_settings",
          primaryLabel: "Open Delta Virtual Settings"
        });
        await logSystemError("DVA Sync", "failed", error, {
          syncRunId,
          reason: "auth_failed",
          stage: "auth"
        });
      } else if (error?.kind === "partial_success") {
        setLogbookAirportProgress?.(await readDeltaVirtualLogbookProgress());
        onLogbookSyncComplete?.();
        await reloadAccomplishmentEligibility();
        await refreshSavedCredentials();
        setStatusMessage?.(error.message || "Delta Virtual sync partially completed.");
        await logSystemEvent("DVA Sync", "succeeded", {
          syncRunId,
          partial: true,
          logbookJson: error.syncResult?.logbookJson?.fileName || null,
          warningCount: Array.isArray(error.syncResult?.warnings) ? error.syncResult.warnings.length : 0,
          durationMs: Math.max(
            0,
            Math.round(
              (typeof performance !== "undefined" ? performance.now() : Date.now()) - syncStartedAt
            )
          )
        });
      } else if (error?.kind === "sync_timeout") {
        shouldResetSyncSession = true;
        setIsSyncing(false);
        const message =
          "Delta Virtual Sync failed. Please check that your First Name, Last Name, and Password are correct, then try again.";
        setStatusMessage?.(message);
        setDvaSyncWarning?.({
          kind: "sync_timeout",
          title: "Delta Virtual Sync failed.",
          message,
          primaryAction: "open_delta_virtual_settings",
          primaryLabel: "Open Delta Virtual Settings"
        });
        await closeDeltaVirtualSyncWindow();
        await logSystemError("DVA Sync", "failed", error, {
          syncRunId,
          reason: "sync_timeout",
          timeoutMs: DELTA_VIRTUAL_SYNC_TIMEOUT_MS,
          stage: "sync"
        });
      } else {
        const message = error?.message || "Delta Virtual sync failed.";
        setStatusMessage?.(message);
        setDvaSyncWarning?.({
          kind: "sync_failed",
          title: "Delta Virtual Sync failed.",
          message,
          primaryAction: "open_delta_virtual_settings",
          primaryLabel: "Open Delta Virtual Settings"
        });
        await logSystemError("DVA Sync", "failed", error, {
          syncRunId,
          stage: "unknown"
        });
      }
    } finally {
      await closeDeltaVirtualSyncWindow();
      if (shouldResetSyncSession) {
        try {
          await resetDeltaVirtualSyncSession();
        } catch (resetError) {
          await logSystemError("DVA Sync Reset", "failed", resetError, {
            syncRunId
          });
        }
      }
      await pruneDeltaVirtualStorage(shouldRemoveDownloadedSchedule);
      setIsSyncing(false);
    }
  }, [
    dvaFirstName,
    dvaHasPassword,
    dvaLastName,
    isDevToolsEnabled,
    processImportedSchedule,
    onScheduleSyncComplete,
    onLogbookSyncComplete,
    refreshSavedCredentials,
    reloadTourProgress,
    reloadAccomplishmentEligibility,
    setDeltaVirtualToursCache,
    setDvaSyncWarning,
    setIsSyncing,
    setLogbookAirportProgress,
    setStatusMessage
  ]);

  const handleResetDeltaVirtualSyncSession = useCallback(async () => {
    try {
      setStatusMessage?.("Resetting Delta Virtual sync session...");
      await closeDeltaVirtualSyncWindow();
      await resetDeltaVirtualSyncSession();
      setStatusMessage?.("Delta Virtual sync session reset. Try syncing again.");
      await logSystemEvent("DVA Sync Reset", "succeeded");
    } catch (error) {
      setStatusMessage?.(error.message || "Delta Virtual sync session reset failed.");
      await logSystemError("DVA Sync Reset", "failed", error);
    }
  }, [setStatusMessage]);

  return {
    handleCloseDvaSyncWarning,
    handleDeltaVirtualSync,
    handleResetDeltaVirtualSyncSession,
    isSyncing
  };
}
