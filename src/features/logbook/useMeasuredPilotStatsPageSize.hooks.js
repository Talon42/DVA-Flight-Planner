import { useCallback, useEffect, useState } from "react";

export const PILOT_STATS_CARD_MIN_WIDTH_PX = 250;
export const PILOT_STATS_CARD_GAP_PX = 12;
export const PILOT_STATS_MIN_PAGE_SIZE = 2;
export const PILOT_STATS_MAX_PAGE_SIZE = 4;
export const PILOT_STATS_WIDE_BREAKPOINT = "(min-width: 120rem)";

// Derives the dashboard page size from the container while respecting the wide-screen card limit.
export function getPilotStatsPageSizeForWidth(width, maxPageSize = PILOT_STATS_MAX_PAGE_SIZE) {
  const availableWidth = Math.max(0, Number(width) || 0);
  const fittingCards = Math.floor(
    (availableWidth + PILOT_STATS_CARD_GAP_PX) /
      (PILOT_STATS_CARD_MIN_WIDTH_PX + PILOT_STATS_CARD_GAP_PX)
  );
  const safeMaxPageSize = Math.max(PILOT_STATS_MIN_PAGE_SIZE, Math.floor(Number(maxPageSize) || PILOT_STATS_MIN_PAGE_SIZE));
  return Math.max(PILOT_STATS_MIN_PAGE_SIZE, Math.min(safeMaxPageSize, fittingCards));
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

    const mediaQuery = window.matchMedia?.(PILOT_STATS_WIDE_BREAKPOINT) || null;
    const getMaxPageSize = () => (mediaQuery?.matches ? PILOT_STATS_MAX_PAGE_SIZE : 3);

    const updateWidth = (width) => {
      const nextPageSize = getPilotStatsPageSizeForWidth(width, getMaxPageSize());
      setPageSize((current) => (current === nextPageSize ? current : nextPageSize));
    };
    updateWidth(container.getBoundingClientRect?.().width || container.clientWidth || 0);

    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver((entries) => {
            const entry = entries.find((candidate) => candidate.target === container) || entries[0];
            updateWidth(entry?.contentRect?.width || container.clientWidth || 0);
          })
        : null;
    observer?.observe(container);

    const handleBreakpointChange = () => updateWidth(container.getBoundingClientRect?.().width || container.clientWidth || 0);
    mediaQuery?.addEventListener?.("change", handleBreakpointChange);

    return () => {
      observer?.disconnect();
      mediaQuery?.removeEventListener?.("change", handleBreakpointChange);
    };
  }, [container]);

  return { containerRef, pageSize };
}
