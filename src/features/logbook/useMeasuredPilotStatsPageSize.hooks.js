import { useCallback, useEffect, useState } from "react";

export const PILOT_STATS_CARD_MIN_WIDTH_PX = 250;
export const PILOT_STATS_CARD_GAP_PX = 12;
export const PILOT_STATS_MIN_PAGE_SIZE = 2;
export const PILOT_STATS_MAX_PAGE_SIZE = 4;

// Derives the 2/3/4-card layout from the actual dashboard container rather than the viewport.
export function getPilotStatsPageSizeForWidth(width) {
  const availableWidth = Math.max(0, Number(width) || 0);
  const fittingCards = Math.floor(
    (availableWidth + PILOT_STATS_CARD_GAP_PX) /
      (PILOT_STATS_CARD_MIN_WIDTH_PX + PILOT_STATS_CARD_GAP_PX)
  );
  return Math.max(PILOT_STATS_MIN_PAGE_SIZE, Math.min(PILOT_STATS_MAX_PAGE_SIZE, fittingCards));
}

export function clampPilotStatsPageIndex(pageIndex, pageCount) {
  return Math.max(0, Math.min(Math.max(0, pageCount - 1), pageIndex));
}

export function useMeasuredPilotStatsPageSize() {
  const [container, setContainer] = useState(null);
  const [pageSize, setPageSize] = useState(PILOT_STATS_MIN_PAGE_SIZE);
  const containerRef = useCallback((node) => setContainer(node), []);

  useEffect(() => {
    if (!container) return undefined;

    const updateWidth = (width) => {
      const nextPageSize = getPilotStatsPageSizeForWidth(width);
      setPageSize((current) => (current === nextPageSize ? current : nextPageSize));
    };
    updateWidth(container.getBoundingClientRect?.().width || container.clientWidth || 0);

    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === container) || entries[0];
      updateWidth(entry?.contentRect?.width || container.clientWidth || 0);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  return { containerRef, pageSize };
}
