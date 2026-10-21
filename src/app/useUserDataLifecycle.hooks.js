import { useCallback, useRef, useState } from "react";
import { deleteStoredUserData } from "../services/storage/storage.js";
import {
  flushUiStateWrites,
  suspendUiStateWrites
} from "../services/storage/uiState.storage.js";
import {
  flushSimBriefSettingsWrites,
  suspendSimBriefSettingsWrites
} from "../services/storage/simBriefSettings.storage.js";
import { logAppError } from "../services/logging/appLog.client.js";
import { isPersistenceWriteSuppressedError } from "../services/tauri/storage.client.js";

// Owns the suspend-flush-delete-reload lifecycle so deleted state cannot be rewritten.
export function useUserDataLifecycle({
  confirmDelete,
  isDeleteBlocked = false,
  prepareForUserDataClear,
  deleteUserData = deleteStoredUserData,
  reloadPage = () => window.location.reload()
} = {}) {
  const [isDeletingUserData, setIsDeletingUserData] = useState(false);
  const [clearFailure, setClearFailure] = useState(null);
  const isDeletingRef = useRef(false);
  const isDeleteBlockedRef = useRef(Boolean(isDeleteBlocked));
  const clearFailureRef = useRef(null);
  isDeleteBlockedRef.current = Boolean(isDeleteBlocked);

  const executeClear = useCallback(async () => {
    const previousClearFailure = clearFailureRef.current;
    setIsDeletingUserData(true);
    setClearFailure(null);
    clearFailureRef.current = null;

    try {
      suspendUiStateWrites();
      suspendSimBriefSettingsWrites();
      prepareForUserDataClear?.();
      await Promise.all([flushUiStateWrites(), flushSimBriefSettingsWrites()]);
      const result = await deleteUserData();
      if (result?.ok) {
        reloadPage();
        return true;
      }
      const failure = result || { failures: [{ target: "userData", reasonCode: "unknown" }] };
      clearFailureRef.current = failure;
      setClearFailure(failure);
      return false;
    } catch (error) {
      if (previousClearFailure && isPersistenceWriteSuppressedError(error)) {
        // A late rejected write must not replace the backend's actionable partial-clear result.
        clearFailureRef.current = previousClearFailure;
        setClearFailure(previousClearFailure);
        return false;
      }
      const failure = {
        failures: [{ target: "userData", reasonCode: "request_failed" }]
      };
      clearFailureRef.current = failure;
      setClearFailure(failure);
      await logAppError("delete-user-data-failed", error);
      return false;
    } finally {
      setIsDeletingUserData(false);
    }
  }, [deleteUserData, prepareForUserDataClear, reloadPage]);

  const runClear = useCallback(async () => {
    if (isDeletingRef.current || isDeleteBlockedRef.current) return false;
    isDeletingRef.current = true;
    try {
      return await executeClear();
    } finally {
      isDeletingRef.current = false;
    }
  }, [executeClear]);

  const handleDeleteUserData = useCallback(async () => {
    if (isDeletingRef.current || isDeleteBlockedRef.current) return false;
    isDeletingRef.current = true;
    try {
      if (!(await confirmDelete?.()) || isDeleteBlockedRef.current) return false;
      return await executeClear();
    } finally {
      isDeletingRef.current = false;
    }
  }, [confirmDelete, executeClear]);

  return {
    isDeletingUserData,
    clearFailure,
    handleDeleteUserData,
    retryUserDataClear: runClear,
    reloadAfterUserDataClearFailure: reloadPage
  };
}
