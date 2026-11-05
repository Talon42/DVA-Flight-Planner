import { useCallback, useEffect, useMemo, useState } from "react";
import {
  readLastSeenWhatsNewReleaseId,
  saveLastSeenWhatsNewReleaseId
} from "../../services/storage/storage.js";
import {
  WHATS_NEW_APP_VERSION,
  WHATS_NEW_ENABLED,
  whatsNewCards as featureCards
} from "./whatsNewContent.js";
import { fetchReleaseHistory } from "../../services/updates/releaseHistory.client.js";
import { buildCardsWithReleaseHistory } from "./releaseHistory.model.js";

// Owns release-scoped What's New gating and manual-open behavior for app-level orchestration.
export function useWhatsNew({ isGettingStartedOpen = false } = {}) {
  const [lastSeenReleaseId, setLastSeenReleaseId] = useState("");
  const [hasLoadedLastSeenReleaseId, setHasLoadedLastSeenReleaseId] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [releaseHistory, setReleaseHistory] = useState({ status: "loading", releases: [] });
  const [loadRevision, setLoadRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchReleaseHistory({ signal: controller.signal }).then(
      (releases) => {
        if (!controller.signal.aborted) setReleaseHistory({ status: "ready", releases });
      },
      () => {
        if (!controller.signal.aborted) setReleaseHistory({ status: "error", releases: [] });
      }
    );
    return () => controller.abort();
  }, [loadRevision]);

  const whatsNewCards = useMemo(
    () => buildCardsWithReleaseHistory(featureCards, releaseHistory), [releaseHistory]
  );

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
    (featureCards.length > 0 || (releaseHistory.status === "ready" && releaseHistory.releases.length > 0)) &&
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
    // Manual reopen retries failures while preserving the installed version's seen state.
    if (releaseHistory.status === "error") {
      setReleaseHistory({ status: "loading", releases: [] });
      setLoadRevision((revision) => revision + 1);
    }
  }, [hasWhatsNewCards, releaseHistory.status]);

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
