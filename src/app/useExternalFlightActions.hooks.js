import { useCallback } from "react";
import { buildSimBriefLatestFlightUrl } from "../domain/flights/simBriefUrls.model.js";
import { logSystemError, logSystemEvent } from "../services/logging/appLog.client.js";
import { openDesktopUrl } from "../services/tauri/desktopShell.client.js";

// Owns trusted external flight links and the desktop/browser opener fallback.
export function useExternalFlightActions({ isDesktop }) {
  const handleOpenSimBriefFlight = useCallback(async (staticId) => {
    const normalizedStaticId = String(staticId || "").trim();
    const simBriefUrl = buildSimBriefLatestFlightUrl(normalizedStaticId);
    if (!simBriefUrl) return;

    try {
      if (isDesktop) await openDesktopUrl(simBriefUrl);
      else window.open(simBriefUrl, "_blank", "noopener,noreferrer");
      await logSystemEvent("SimBrief", "flight-opened", { staticId: normalizedStaticId, url: simBriefUrl });
    } catch (error) {
      await logSystemError("SimBrief", "flight-open-failed", error, { staticId: normalizedStaticId, url: simBriefUrl });
    }
  }, [isDesktop]);

  return { handleOpenSimBriefFlight };
}
