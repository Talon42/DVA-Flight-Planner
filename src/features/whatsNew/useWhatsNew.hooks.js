import { useCallback, useEffect, useMemo, useState } from "react";
import {
  readLastSeenWhatsNewReleaseId,
  saveLastSeenWhatsNewReleaseId
} from "../../services/storage/storage.js";
import {
  WHATS_NEW_APP_VERSION,
  WHATS_NEW_ENABLED,
  whatsNewCards
} from "./whatsNewContent.js";

// Owns release-scoped What's New gating and manual-open behavior for app-level orchestration.
export function useWhatsNew({ isGettingStartedOpen = false } = {}) {
  const [lastSeenReleaseId, setLastSeenReleaseId] = useState("");
  const [hasLoadedLastSeenReleaseId, setHasLoadedLastSeenReleaseId] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadLastSeenReleaseId = async () => {
      try {
        const storedReleaseId = await readLastSeenWhatsNewReleaseId();
        if (!cancelled) {
          setLastSeenReleaseId(String(storedReleaseId || "").trim());
        }
      } finally {
        if (!cancelled) {
          setHasLoadedLastSeenReleaseId(true);
        }
      }
    };

    void loadLastSeenReleaseId();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasWhatsNewCards = whatsNewCards.length > 0;
  const isCurrentVersionSeen = lastSeenReleaseId === WHATS_NEW_APP_VERSION;

  const shouldShowWhatsNew =
    WHATS_NEW_ENABLED &&
    hasWhatsNewCards &&
    !isGettingStartedOpen &&
    hasLoadedLastSeenReleaseId &&
    !isCurrentVersionSeen;

  useEffect(() => {
    if (!hasWhatsNewCards && isManualOpen) {
      setIsManualOpen(false);
    }
  }, [hasWhatsNewCards, isManualOpen]);

  const openWhatsNewManually = useCallback(() => {
    if (!hasWhatsNewCards) {
      return;
    }

    setIsManualOpen(true);
  }, [hasWhatsNewCards]);

  const closeManualWhatsNew = useCallback(() => {
    setIsManualOpen(false);
  }, []);

  const finishWhatsNew = useCallback(async () => {
    await saveLastSeenWhatsNewReleaseId(WHATS_NEW_APP_VERSION);
    setLastSeenReleaseId(WHATS_NEW_APP_VERSION);
    setIsManualOpen(false);
  }, []);

  const whatsNewMode = useMemo(() => (shouldShowWhatsNew ? "automatic" : "manual"), [shouldShowWhatsNew]);

  return {
    appVersion: WHATS_NEW_APP_VERSION,
    whatsNewCards,
    hasWhatsNewCards,
    shouldShowWhatsNew,
    isWhatsNewOpen: shouldShowWhatsNew || isManualOpen,
    whatsNewMode,
    openWhatsNewManually,
    finishWhatsNew,
    closeManualWhatsNew
  };
}
