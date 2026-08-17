import { useCallback, useRef, useState } from "react";
import { DEFAULT_DERIVED_TOUR_PROGRESS } from "../tours/tours.constants.js";
import {
  createLogRunId,
  logAppDebug,
  logSystemError,
  logSystemEvent,
  logSystemWarn
} from "../../services/logging/appLog.client.js";
import { readDeltaVirtualCredentials } from "../../services/tauri/deltaVirtualCredentials.client.js";
import { readDeltaVirtualTourProgress } from "../../services/storage/storage.js";
import {
  readDeltaVirtualAccomplishmentEligibility,
  closeDeltaVirtualSyncWindow,
  pruneDeltaVirtualStorage,
  resetDeltaVirtualSyncSession,
  readDeltaVirtualLogbookProgress,
  refreshDeltaVirtualLogbook,
  syncDeltaVirtualTours,
  syncScheduleFromDeltaVirtual
} from "../../services/tauri/deltaVirtual.client.js";
import { buildScheduleDateInfo } from "../../domain/schedule/scheduleDate.js";
import { clearLogbookPirepDetailsRequests } from "../logbook/logbookPirepDetailsRequests.js";

const DELTA_VIRTUAL_SYNC_FAILURE_GUIDANCE =
  "Delta Virtual Sync failed. Please check your Delta Virtual credentials, try again later, or post the app log on the DVA forums.";

// Shows one consistent recovery message for failed Delta Virtual schedule syncs.
function showDeltaVirtualSyncFailureWarning(setStatusMessage, setDvaSyncWarning, detail = "") {
  setStatusMessage?.(DELTA_VIRTUAL_SYNC_FAILURE_GUIDANCE);
  setDvaSyncWarning?.({
    kind: "sync_failed",
    title: "Delta Virtual Sync failed.",
    message: DELTA_VIRTUAL_SYNC_FAILURE_GUIDANCE,
    detail,
    primaryAction: "open_delta_virtual_settings",
    primaryLabel: "Open Delta Virtual Settings"
  });
}

// Reports stale upstream schedule data without misclassifying a successful sync as failed.
function showDeltaVirtualStaleScheduleWarning(setStatusMessage, setDvaSyncWarning, scheduleDateLabel) {
  const message = `Delta Virtual sync completed, but DVA is still publishing the ${scheduleDateLabel} schedule.`;
  setStatusMessage?.(message);
  setDvaSyncWarning?.({
    kind: "schedule_stale",
    title: "Delta Virtual schedule is awaiting an update.",
    message,
    detail: "The imported schedule is available, but it may be out of date. Sync again after DVA publishes the next schedule."
  });
}

// Cleanup must never keep a completed DVA operation locked or hide its primary result.
async function cleanupDeltaVirtualOperation({ category, removeDownloadedSchedule, syncRunId }) {
  try {
    await closeDeltaVirtualSyncWindow();
  } catch (error) {
    try {
      await logSystemError(category, "cleanup-window-close-failed", error, {
        syncRunId,
        stage: "cleanup-window"
      });
    } catch {
      // Cleanup logging is also best effort so operation state can always reset.
    }
  }

  try {
    await pruneDeltaVirtualStorage(removeDownloadedSchedule);
  } catch (error) {
    try {
      await logSystemError(category, "cleanup-storage-prune-failed", error, {
        syncRunId,
        stage: "cleanup-storage",
        removeDownloadedSchedule
      });
    } catch {
      // Cleanup logging is also best effort so operation state can always reset.
    }
  }
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
  const [isRefreshingLogbook, setIsRefreshingLogbook] = useState(false);
  const isSyncingRef = useRef(false);
  const isRefreshingLogbookRef = useRef(false);

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
    if (isSyncingRef.current || isRefreshingLogbookRef.current) {
      return;
    }

    const syncRunId = createLogRunId("sync");
    const syncStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

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

    isSyncingRef.current = true;
    setIsSyncing(true);
    setStatusMessage?.("Syncing data from Delta Virtual.");
    let shouldRemoveDownloadedSchedule = false;

    try {
      await logSystemEvent("DVA Sync", "started", {
        syncRunId
      });
      setStatusMessage?.("Syncing data from Delta Virtual.");
      const syncedFile = await syncScheduleFromDeltaVirtual({
        syncRunId,
        debugEnabled: isDevToolsEnabled
      });
      await logSystemEvent("DVA Sync", "succeeded", {
        syncRunId,
        file: syncedFile.fileName,
        bytes: syncedFile.xmlText?.length || 0,
        logbookJson: syncedFile.logbookJson?.fileName || null,
        warningCount: Array.isArray(syncedFile.warnings) ? syncedFile.warnings.length : 0,
        warning: Array.isArray(syncedFile.warnings) ? syncedFile.warnings[0] || null : null,
        durationMs: Math.max(
          0,
          Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - syncStartedAt
          )
        )
      });
      setStatusMessage?.("Processing Delta Virtual schedule...");
      const importResult = await processImportedSchedule?.(syncedFile, "deltava-sync");
      if (importResult?.ok === false) {
        showDeltaVirtualSyncFailureWarning(
          setStatusMessage,
          setDvaSyncWarning,
          "The downloaded schedule could not be imported, so the footer schedule date was not updated."
        );
        await logSystemError(
          "DVA Sync",
          "failed",
          importResult.error || new Error("Delta Virtual schedule import failed."),
          { syncRunId, stage: "schedule-import" }
        );
        return;
      }

      const importedScheduleDateInfo = buildScheduleDateInfo(importResult?.schedule?.flights || []);
      if (importedScheduleDateInfo.isCurrent === false) {
        showDeltaVirtualStaleScheduleWarning(
          setStatusMessage,
          setDvaSyncWarning,
          importedScheduleDateInfo.label
        );
        await logSystemWarn(
          "DVA Sync",
          "schedule-date-stale",
          {
            syncRunId,
            stage: "schedule-date",
            scheduleDate: importedScheduleDateInfo.label
          }
        );
      }
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
        showDeltaVirtualSyncFailureWarning(setStatusMessage, setDvaSyncWarning);
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
        showDeltaVirtualSyncFailureWarning(
          setStatusMessage,
          setDvaSyncWarning,
          error.message || "The logbook was saved, but the schedule download failed."
        );
        await logSystemEvent("DVA Sync", "succeeded", {
          syncRunId,
          partial: true,
          logbookJson: error.syncResult?.logbookJson?.fileName || null,
          warningCount: Array.isArray(error.syncResult?.warnings) ? error.syncResult.warnings.length : 0,
          warning: Array.isArray(error.syncResult?.warnings) ? error.syncResult.warnings[0] || null : null,
          durationMs: Math.max(
            0,
            Math.round(
              (typeof performance !== "undefined" ? performance.now() : Date.now()) - syncStartedAt
            )
          )
        });
      } else {
        showDeltaVirtualSyncFailureWarning(
          setStatusMessage,
          setDvaSyncWarning,
          error?.message || ""
        );
        await logSystemError("DVA Sync", "failed", error, {
          syncRunId,
          stage: "unknown"
        });
      }
    } finally {
      try {
        await cleanupDeltaVirtualOperation({
          category: "DVA Sync",
          removeDownloadedSchedule: shouldRemoveDownloadedSchedule,
          syncRunId
        });
      } finally {
        setIsSyncing(false);
        isSyncingRef.current = false;
      }
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

  const handleRefreshDeltaVirtualLogbook = useCallback(async () => {
    if (isSyncingRef.current || isRefreshingLogbookRef.current) {
      return;
    }

    const syncRunId = createLogRunId("logbook-refresh");
    const syncStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

    const hasSavedDeltaVirtualCredentials =
      Boolean(String(dvaFirstName || "").trim()) &&
      Boolean(String(dvaLastName || "").trim()) &&
      Boolean(dvaHasPassword);

    if (!hasSavedDeltaVirtualCredentials) {
      const message =
        "Delta Virtual login settings are not saved in the app, so logbook refresh cannot be performed. Save your First Name, Last Name, and Password in Delta Virtual settings first.";
      setDvaSyncWarning?.({
        kind: "missing_credentials",
        title: "Credentials are not saved.",
        message,
        primaryAction: "open_delta_virtual_settings",
        primaryLabel: "Fix Now"
      });
      setStatusMessage?.(message);
      await logSystemError(
        "DVA Logbook Refresh",
        "failed",
        new Error("Delta Virtual login settings are not saved."),
        { syncRunId, reason: "missing-credentials", stage: "credentials" }
      );
      return;
    }

    isRefreshingLogbookRef.current = true;
    setIsRefreshingLogbook(true);
    setStatusMessage?.("Refreshing Delta Virtual logbook.");

    try {
      await logSystemEvent("DVA Logbook Refresh", "started", {
        syncRunId
      });
      setStatusMessage?.("Refreshing Delta Virtual logbook.");
      const refreshResult = await refreshDeltaVirtualLogbook({
        syncRunId,
        debugEnabled: isDevToolsEnabled
      });
      await logSystemEvent("DVA Logbook Refresh", "succeeded", {
        syncRunId,
        file: refreshResult.logbookJson?.fileName || null,
        bytes: refreshResult.logbookJson?.bytes || 0,
        durationMs: Math.max(
          0,
          Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - syncStartedAt
          )
        )
      });
      setLogbookAirportProgress?.(await readDeltaVirtualLogbookProgress());
      onLogbookSyncComplete?.();
      await refreshSavedCredentials();
      setStatusMessage?.("Delta Virtual logbook refreshed.");
    } catch (error) {
      if (error?.kind === "cancelled") {
        setStatusMessage?.("Delta Virtual logbook refresh canceled.");
        await logSystemEvent("DVA Logbook Refresh", "failed", {
          syncRunId,
          reason: "cancelled"
        });
      } else if (error?.kind === "auth_failed") {
        const message =
          "Delta Virtual logbook refresh failed. Please check that your First Name, Last Name, and Password are correct, then try again.";
        setStatusMessage?.(message);
        setDvaSyncWarning?.({
          kind: "auth_failed",
          title: "Delta Virtual logbook refresh failed.",
          message,
          primaryAction: "open_delta_virtual_settings",
          primaryLabel: "Open Delta Virtual Settings"
        });
        await logSystemError("DVA Logbook Refresh", "failed", error, {
          syncRunId,
          reason: "auth_failed",
          stage: "auth"
        });
      } else {
        const message = error?.message || "Delta Virtual logbook refresh failed.";
        setStatusMessage?.(message);
        setDvaSyncWarning?.({
          kind: "sync_failed",
          title: "Delta Virtual logbook refresh failed.",
          message,
          primaryAction: "open_delta_virtual_settings",
          primaryLabel: "Open Delta Virtual Settings"
        });
        await logSystemError("DVA Logbook Refresh", "failed", error, {
          syncRunId,
          stage: "unknown"
        });
      }
    } finally {
      try {
        await cleanupDeltaVirtualOperation({
          category: "DVA Logbook Refresh",
          removeDownloadedSchedule: false,
          syncRunId
        });
      } finally {
        setIsRefreshingLogbook(false);
        isRefreshingLogbookRef.current = false;
      }
    }
  }, [
    dvaFirstName,
    dvaHasPassword,
    dvaLastName,
    isDevToolsEnabled,
    onLogbookSyncComplete,
    refreshSavedCredentials,
    setDvaSyncWarning,
    setLogbookAirportProgress,
    setStatusMessage
  ]);

  const handleResetDeltaVirtualSyncSession = useCallback(async () => {
    try {
      setStatusMessage?.("Resetting Delta Virtual sync session...");
      await closeDeltaVirtualSyncWindow();
      await resetDeltaVirtualSyncSession();
      clearLogbookPirepDetailsRequests();
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
    handleRefreshDeltaVirtualLogbook,
    handleResetDeltaVirtualSyncSession,
    isSyncing,
    isRefreshingLogbook
  };
}
