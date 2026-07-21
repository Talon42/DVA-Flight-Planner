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
  isDeleteBlockedRef.current = Boolean(isDeleteBlocked);

  const executeClear = useCallback(async () => {
    setIsDeletingUserData(true);
    setClearFailure(null);

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
      setClearFailure(result || { failures: [{ target: "userData", reasonCode: "unknown" }] });
      return false;
    } catch (error) {
      setClearFailure({
        failures: [{ target: "userData", reasonCode: "request_failed" }]
      });
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
