import { useEffect } from "react";
import { useDeltaVirtualSync } from "../features/deltaVirtual/useDeltaVirtualSync.hooks.js";
import { logAppError } from "../services/logging/appLog.client.js";

// Composes DVA sync ownership with the deferred post-onboarding startup trigger.
export function useSyncOrchestration({
  deltaVirtualOptions,
  shouldRunDeferredStartupSync,
  setShouldRunDeferredStartupSync,
  isStartupGateComplete
}) {
  const deltaVirtualSync = useDeltaVirtualSync(deltaVirtualOptions);
  const { handleDeltaVirtualSync } = deltaVirtualSync;
  const { setStatusMessage } = deltaVirtualOptions;

  useEffect(() => {
    if (!shouldRunDeferredStartupSync || !isStartupGateComplete) return;
    setShouldRunDeferredStartupSync(false);
    void handleDeltaVirtualSync().catch(async (error) => {
      setStatusMessage?.(error.message || "Unable to sync from Delta Virtual.");
      await logAppError("getting-started-sync-failed", error);
    });
  }, [
    handleDeltaVirtualSync,
    isStartupGateComplete,
    setShouldRunDeferredStartupSync,
    shouldRunDeferredStartupSync,
    setStatusMessage
  ]);

  return deltaVirtualSync;
}
