import { useEffect, useRef, useState } from "react";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { dropdownOptionRowClassName } from "../../components/ui/forms";
import { getEstimatedPilotStatsRowHeight } from "./logbookPilotStats.constants.js";

const TRANSPARENT_HEADER_ACTION_CLASS_NAME =
  "!bg-transparent !px-0 !text-[var(--delta-blue)] hover:!bg-transparent hover:!text-[var(--text-heading)] dark:!bg-transparent dark:!text-[#7db7ef] dark:hover:!text-white";
const CHANGE_MENU_PANEL_CLASS_NAME =
  "grid gap-1 overflow-hidden rounded-none border border-[color:var(--line)] bg-[var(--surface-raised)] p-2 shadow-none";

function parsePercentValue(percentValue) {
  const numeric = Number(String(percentValue || "").replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function getLandingToneClassName(rawLandingRate) {
  if (!Number.isFinite(rawLandingRate)) {
    return "text-[var(--text-muted)]";
  }

  if (rawLandingRate >= -150) {
    return "text-[#126835] dark:text-[#7FD18B]";
  }

  if (rawLandingRate >= -350) {
    return "text-[#946200] dark:text-[#f0c15d]";
  }

  return "text-[var(--delta-red)]";
}

function RankingRow({ item, showProgressBar = true }) {
  const barWidth = Math.max(0, Math.min(100, parsePercentValue(item?.percentValue)));

  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
          {item?.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("m-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
          {item?.percentValue ? <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{item.percentValue}</p> : null}
        </div>
      </div>
      {showProgressBar ? (
        <div className="h-1 w-full overflow-hidden bg-[color:var(--line)]">
          <div className="h-full bg-[var(--delta-blue)] dark:bg-[#4d91d8]" style={{ width: `${barWidth}%` }} />
        </div>
      ) : null}
    </div>
  );
}

// Renders the airline ranking row with a dedicated logo column and no progress bar.
function AirlineRow({ item }) {
  const airlineCode = String(item?.meta || item?.row?.airlineCode || "").trim();
  const logoSrc = String(item?.row?.airlineLogoSrc || "").trim();
  const logoClassName = String(item?.row?.airlineLogoClassName || "").trim();

  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {logoSrc ? (
          <img src={logoSrc} alt="" aria-hidden="true" className={cn("h-6 w-6 object-contain", logoClassName)} loading="lazy" />
        ) : (
          <span className={cn("truncate px-1 text-center text-[0.62rem] font-semibold uppercase", labelTextClassName)}>
            {airlineCode ? airlineCode.slice(0, 3) : "?"}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
        {airlineCode ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{airlineCode}</p> : null}
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("m-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
        {item?.percentValue ? <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{item.percentValue}</p> : null}
      </div>
    </div>
  );
}

function RouteRow({ item }) {
  const barWidth = Math.max(0, Math.min(100, parsePercentValue(item?.percentValue)));

  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
          {item?.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
        </div>
        <p className={cn("m-0 shrink-0 text-right text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
      </div>
      {item?.percentValue ? <p className={cn("m-0 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--text-muted)]")}>{item.percentValue}</p> : null}
      <div className="h-1 w-full overflow-hidden bg-[color:var(--line)]">
        <div className="h-full bg-[var(--delta-blue)] dark:bg-[#4d91d8]" style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  );
}

function LandingRow({ item }) {
  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
          {item?.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
        </div>
        <p className={cn("m-0 shrink-0 text-right font-semibold", getLandingToneClassName(item?.rawLandingRate), bodySmTextClassName)}>
          {item?.value}
        </p>
      </div>
      {item?.badge ? <p className={cn("m-0 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--text-muted)]")}>{item.badge}</p> : null}
    </div>
  );
}

function AirportRow({ item }) {
  return (
    <div className="grid gap-1.5 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item?.label}</p>
          {item?.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("m-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
          {item?.percentValue ? <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{item.percentValue}</p> : null}
        </div>
      </div>
      <div className="flex gap-2 text-[0.68rem] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        <span>{`DEP ${item?.dep ?? "0"}`}</span>
        <span>{`ARR ${item?.arr ?? "0"}`}</span>
      </div>
    </div>
  );
}

function RecordTile({ item }) {
  const toneClassName =
    item?.tone === "positive"
      ? "border-[#d8eadf] bg-[#f5fbf7] text-[#126835] dark:border-[#1f4730] dark:bg-[#102218] dark:text-[#8ee3a2]"
      : item?.tone === "negative"
        ? "border-[#f5d7dd] bg-[#fff6f8] text-[var(--delta-red)] dark:border-[#4a1d28] dark:bg-[#1c0f15] dark:text-[#ff9d9d]"
        : "border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-heading)]";

  return (
    <div className={cn("grid min-h-0 gap-1 border p-2", toneClassName)}>
      <p className={cn("m-0 truncate text-[0.56rem] font-semibold uppercase tracking-[0.14em]")}>{item?.label}</p>
      <p className={cn("m-0 truncate", bodySmTextClassName)}>{item?.value}</p>
      {item?.meta ? <p className={cn("m-0 truncate opacity-80", bodySmTextClassName)}>{item.meta}</p> : null}
    </div>
  );
}

// Renders the summary cards for the overview dashboard without letting any card scroll.
export default function LogbookPilotStatsSummaryPanel({
  title,
  items,
  onViewAll,
  onChange,
  changeOptions = [],
  selectedChangeKey = "",
  changeMenuLabel = "Change",
  variant = "ranking",
  maxRows = 5,
  autoFitRows = true,
  showProgressBar = true,
  className = ""
}) {
  const rootRef = useRef(null);
  const bodyRef = useRef(null);
  const [isChangeMenuOpen, setIsChangeMenuOpen] = useState(false);
  const [fitRows, setFitRows] = useState(maxRows);
  const rafIdRef = useRef(0);
  const hasChangeOptions = typeof onChange === "function" && Array.isArray(changeOptions) && changeOptions.length > 0;
  const changeMenuId = `pilot-stats-change-${String(selectedChangeKey || title || "card").replace(/\s+/g, "-").toLowerCase()}`;
  const estimatedRowHeight = getEstimatedPilotStatsRowHeight(variant);
  const effectiveMaxRows = autoFitRows ? Math.min(maxRows, fitRows) : maxRows;
  const rows = (Array.isArray(items) ? items : []).slice(0, Math.min(effectiveMaxRows, Array.isArray(items) ? items.length : 0));

  useEffect(() => {
    if (!isChangeMenuOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsChangeMenuOpen(false);
      }
    }

    function handlePointerDown(event) {
      if (!rootRef.current || rootRef.current.contains(event.target)) {
        return;
      }

      setIsChangeMenuOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isChangeMenuOpen]);

  useEffect(() => {
    setIsChangeMenuOpen(false);
  }, [changeOptions, selectedChangeKey]);

  useEffect(() => {
    const node = bodyRef.current;

    if (!node || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const updateFitRows = () => {
      const nextHeight = Math.max(0, Math.floor(node.clientHeight));
      const nextFitRows = Math.max(1, Math.floor(nextHeight / estimatedRowHeight));

      setFitRows((current) => (current === nextFitRows ? current : nextFitRows));
    };

    const scheduleUpdate = () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = 0;
        updateFitRows();
      });
    };

    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(node);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }

      observer.disconnect();
    };
  }, [estimatedRowHeight, variant]);

  function handleSelectChange(nextCardKey) {
    setIsChangeMenuOpen(false);
    onChange?.(nextCardKey);
  }

  return (
    <Panel
      ref={rootRef}
      className={cn(
        "relative flex min-h-0 !overflow-visible flex-col gap-2 border border-[color:var(--line)] bg-[var(--surface-raised)] p-3",
        cardFrameClassName,
        className
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className={cn("m-0 min-w-0 flex-1 truncate text-[var(--text-heading)]", labelTextClassName)}>{title}</p>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {hasChangeOptions ? (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                className={TRANSPARENT_HEADER_ACTION_CLASS_NAME}
                onClick={() => setIsChangeMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={isChangeMenuOpen}
                aria-controls={changeMenuId}
                title={`Change ${title}`}
              >
                {changeMenuLabel}
              </Button>
              {isChangeMenuOpen ? (
                <div
                  id={changeMenuId}
                  className={cn("absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[220px]", CHANGE_MENU_PANEL_CLASS_NAME)}
                  role="menu"
                  aria-label={`${changeMenuLabel} ${title}`}
                >
                  {changeOptions.map((option) => (
                    <Button
                      key={option.key}
                      variant="ghost"
                      size="sm"
                      className={cn("w-full justify-start rounded-none", dropdownOptionRowClassName)}
                      role="menuitem"
                      onClick={() => handleSelectChange(option.key)}
                    >
                      {option.title || option.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {hasChangeOptions && onViewAll ? <span aria-hidden="true" className="h-3 w-px bg-[color:var(--line)]" /> : null}

          {onViewAll ? (
            <Button
              variant="ghost"
              size="sm"
              className={TRANSPARENT_HEADER_ACTION_CLASS_NAME}
              onClick={onViewAll}
            >
              View all
            </Button>
          ) : null}
        </div>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-hidden">
        {rows.length ? (
          variant === "records" ? (
            <div className="grid grid-cols-2 gap-2">
              {rows.map((item, index) => (
                <RecordTile key={`${item?.recordType || item?.label || item?.value || "record"}-${index}`} item={item} />
              ))}
            </div>
          ) : (
            <div className="grid gap-1.5">
              {rows.map((item, index) =>
                variant === "airline" ? (
                  <AirlineRow key={`${item?.label || item?.value || "airline"}-${index}`} item={item} />
                ) : variant === "landing" ? (
                  <LandingRow key={`${item?.label || item?.value || "landing"}-${index}`} item={item} />
                ) : variant === "airport" ? (
                  <AirportRow key={`${item?.label || item?.value || "airport"}-${index}`} item={item} />
                ) : variant === "route" ? (
                  <RouteRow key={`${item?.label || item?.value || "route"}-${index}`} item={item} />
                ) : (
                  <RankingRow
                    key={`${item?.label || item?.value || "ranking"}-${index}`}
                    item={item}
                    showProgressBar={showProgressBar}
                  />
                )
              )}
            </div>
          )
        ) : (
          <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No data available.</p>
        )}
      </div>
    </Panel>
  );
}
