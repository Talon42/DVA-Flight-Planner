import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName } from "../../components/ui/typography";
import { cardFrameClassName, tableFrameClassName } from "../../components/ui/patterns";
import LogbookPilotStatsDetailView from "./LogbookPilotStatsDetailView.jsx";
import LogbookPilotStatsHero from "./LogbookPilotStatsHero.jsx";
import LogbookPilotStatsSummaryPanel from "./LogbookPilotStatsSummaryPanel.jsx";
import { EMPTY_DETAIL_ROWS, getPilotStatsDashboardCards } from "./logbookPilotStats.constants.js";

// Renders the Pilot Stats overview and drill-in detail view.
function chunkPilotStatsCards(cards, pageSize) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 1));
  const pages = [];

  for (let index = 0; index < safeCards.length; index += safePageSize) {
    pages.push(safeCards.slice(index, index + safePageSize));
  }

  return pages;
}

function getPilotStatsDashboardPageSize() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return 2;
  }

  if (window.matchMedia("(min-width: 120rem)").matches) {
    return 4;
  }

  if (window.matchMedia("(min-width: 87.5rem)").matches) {
    return 3;
  }

  return 2;
}

function addMediaQueryListener(mediaQueryList, listener) {
  if (!mediaQueryList) {
    return () => {};
  }

  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", listener);
    return () => mediaQueryList.removeEventListener("change", listener);
  }

  if (typeof mediaQueryList.addListener === "function") {
    mediaQueryList.addListener(listener);
    return () => mediaQueryList.removeListener(listener);
  }

  return () => {};
}

function usePilotStatsDashboardPageSize() {
  const [pageSize, setPageSize] = useState(getPilotStatsDashboardPageSize);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const bp1920Query = window.matchMedia("(min-width: 120rem)");
    const bp1400Query = window.matchMedia("(min-width: 87.5rem)");
    const updatePageSize = () => {
      setPageSize(getPilotStatsDashboardPageSize());
    };

    updatePageSize();

    const remove1920Listener = addMediaQueryListener(bp1920Query, updatePageSize);
    const remove1400Listener = addMediaQueryListener(bp1400Query, updatePageSize);

    return () => {
      remove1920Listener();
      remove1400Listener();
    };
  }, []);

  return pageSize;
}

function getPilotStatsDashboardGridClassName(pageSize) {
  if (pageSize >= 4) {
    return "grid-cols-4";
  }

  if (pageSize >= 3) {
    return "grid-cols-3";
  }

  return "grid-cols-2";
}

function clampPilotStatsPageIndex(pageIndex, pageCount) {
  return Math.max(0, Math.min(Math.max(0, pageCount - 1), pageIndex));
}

// Renders one active dashboard page stack so each page snaps as a single full-height row.
function LogbookPilotStatsDashboardPages({ cards, pageSize, onPilotStatsDetailViewChange }) {
  const pages = useMemo(() => chunkPilotStatsCards(cards, pageSize), [cards, pageSize]);

  if (!pages.length) {
    return null;
  }

  const gridClassName = getPilotStatsDashboardGridClassName(pageSize);

  return (
    <div className="flex h-full min-h-full w-full min-w-0 flex-col">
      {pages.map((pageCards, pageIndex) => (
        <div
          key={`${pageSize}-${pageIndex}`}
          className="h-full min-h-full w-full min-w-0 shrink-0 snap-start snap-always overflow-hidden"
        >
          <div className={cn("grid h-full min-h-0 w-full min-w-0 grid-rows-1 gap-3", gridClassName)}>
            {pageCards.map((card) => (
              <LogbookPilotStatsSummaryPanel
                key={card.key}
                title={card.title}
                items={card.items}
                departureItems={card.departureItems}
                arrivalItems={card.arrivalItems}
                variant={card.variant}
                maxRows={card.maxRows}
                autoFitRows={card.autoFitRows ?? true}
                showProgressBar={card.key !== "equipment"}
                onViewAll={card.hasData ? () => onPilotStatsDetailViewChange?.(card.detailView) : null}
                className={cn("h-full min-h-0", card.spanClassName, card.cardClassName)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LogbookPilotStats({
  stats,
  summaryStats,
  profileMetadata,
  pilotStatsComparisonPeriod = "off",
  pilotStatsDetailView = null,
  onPilotStatsDetailViewChange
}) {
  const displayStats = useMemo(() => summaryStats || stats || {}, [stats, summaryStats]);
  const summary = displayStats.summary || null;
  const comparisons = displayStats.comparisons || null;
  const detailRows = useMemo(() => displayStats.detailRows || EMPTY_DETAIL_ROWS, [displayStats.detailRows]);
  const dashboardCards = useMemo(() => getPilotStatsDashboardCards(displayStats), [displayStats]);
  const dashboardPageSize = usePilotStatsDashboardPageSize();
  const dashboardPageCount = Math.max(1, Math.ceil(dashboardCards.length / dashboardPageSize));
  const dashboardScrollRef = useRef(null);
  const dashboardPageIndexRef = useRef(0);
  const dashboardPageCountRef = useRef(dashboardPageCount);
  const dashboardWheelLockUntilRef = useRef(0);
  const previousDetailViewRef = useRef(Boolean(pilotStatsDetailView));
  const [dashboardPageIndex, setDashboardPageIndex] = useState(0);

  useEffect(() => {
    dashboardPageCountRef.current = dashboardPageCount;
  }, [dashboardPageCount]);

  useEffect(() => {
    dashboardPageIndexRef.current = dashboardPageIndex;
  }, [dashboardPageIndex]);

  useEffect(() => {
    setDashboardPageIndex(0);
  }, [dashboardPageSize]);

  useEffect(() => {
    setDashboardPageIndex(0);
  }, [dashboardCards.length]);

  useEffect(() => {
    const wasDetailView = previousDetailViewRef.current;
    const isDetailView = Boolean(pilotStatsDetailView);

    previousDetailViewRef.current = isDetailView;

    if (wasDetailView && !isDetailView) {
      setDashboardPageIndex(0);
    }
  }, [pilotStatsDetailView]);

  useEffect(() => {
    setDashboardPageIndex((currentPageIndex) =>
      clampPilotStatsPageIndex(currentPageIndex, dashboardPageCount)
    );
  }, [dashboardPageCount]);

  useEffect(() => {
    if (pilotStatsDetailView) {
      return undefined;
    }

    const scrollNode = dashboardScrollRef.current;

    if (!scrollNode) {
      return undefined;
    }

    const nextTop = scrollNode.clientHeight * dashboardPageIndex;

    if (typeof scrollNode.scrollTo === "function") {
      scrollNode.scrollTo({ top: nextTop, behavior: "auto" });
    } else {
      scrollNode.scrollTop = nextTop;
    }

    return undefined;
  }, [dashboardPageIndex, dashboardPageSize, dashboardCards.length, pilotStatsDetailView]);

  useEffect(() => {
    if (pilotStatsDetailView) {
      return undefined;
    }

    const scrollNode = dashboardScrollRef.current;

    if (!scrollNode) {
      return undefined;
    }

    const handleWheel = (event) => {
      if (Math.abs(event.deltaY) < 8) {
        return;
      }

      const now = Date.now();
      if (now < dashboardWheelLockUntilRef.current) {
        return;
      }

      event.preventDefault();

      const direction = event.deltaY > 0 ? 1 : -1;
      const currentPageIndex = dashboardPageIndexRef.current;
      const nextPageIndex = clampPilotStatsPageIndex(
        currentPageIndex + direction,
        dashboardPageCountRef.current
      );

      dashboardWheelLockUntilRef.current = now + 220;

      if (nextPageIndex === currentPageIndex) {
        return;
      }

      dashboardPageIndexRef.current = nextPageIndex;
      setDashboardPageIndex(nextPageIndex);

      const nextTop = scrollNode.clientHeight * nextPageIndex;
      if (typeof scrollNode.scrollTo === "function") {
        scrollNode.scrollTo({ top: nextTop, behavior: "auto" });
      } else {
        scrollNode.scrollTop = nextTop;
      }
    };

    scrollNode.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      scrollNode.removeEventListener("wheel", handleWheel);
    };
  }, [dashboardPageCount, dashboardPageSize, pilotStatsDetailView]);

  function handleDashboardKeyDown(event) {
    const isNextKey =
      event.key === "PageDown" || event.key === "ArrowDown" || event.key === " " || event.code === "Space";
    const isPreviousKey = event.key === "PageUp" || event.key === "ArrowUp";

    if (!isNextKey && !isPreviousKey) {
      return;
    }

    event.preventDefault();

    const currentPageIndex = dashboardPageIndexRef.current;
    const nextPageIndex = clampPilotStatsPageIndex(
      currentPageIndex + (isNextKey ? 1 : -1),
      dashboardPageCountRef.current
    );

    if (nextPageIndex === currentPageIndex) {
      return;
    }

    dashboardPageIndexRef.current = nextPageIndex;
    setDashboardPageIndex(nextPageIndex);

    const scrollNode = dashboardScrollRef.current;
    if (!scrollNode) {
      return;
    }

    const nextTop = scrollNode.clientHeight * nextPageIndex;
    if (typeof scrollNode.scrollTo === "function") {
      scrollNode.scrollTo({ top: nextTop, behavior: "auto" });
    } else {
      scrollNode.scrollTop = nextTop;
    }
  }

  return (
    <div
      className={cn(
        "logbook-pilot-stats flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden",
        tableFrameClassName
      )}
    >
      {summary ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 bp-1024:p-3.5">
          <div className="min-w-0 shrink-0">
            <LogbookPilotStatsHero
              summary={summary}
              comparison={comparisons}
              profileMetadata={profileMetadata}
              comparisonPeriod={pilotStatsComparisonPeriod}
            />
          </div>

          {pilotStatsDetailView ? (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <LogbookPilotStatsDetailView
                detailView={pilotStatsDetailView}
                detailRows={detailRows}
                onClose={() => onPilotStatsDetailViewChange?.(null)}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div
                ref={dashboardScrollRef}
                tabIndex={0}
                role="region"
                aria-label="Pilot stats dashboard pages"
                onKeyDown={handleDashboardKeyDown}
                className={cn(
                  "logbook-pilot-stats__paged-dashboard app-scrollbar h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] snap-y snap-mandatory [&::-webkit-scrollbar]:hidden",
                )}
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                <LogbookPilotStatsDashboardPages
                  cards={dashboardCards}
                  pageSize={dashboardPageSize}
                  onPilotStatsDetailViewChange={onPilotStatsDetailViewChange}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <Panel className={cn("border border-dashed border-[color:var(--line)] bg-[var(--surface-raised)] p-5", cardFrameClassName)}>
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No logbook data available.</p>
        </Panel>
      )}
    </div>
  );
}
