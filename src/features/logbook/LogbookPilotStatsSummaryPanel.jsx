import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";

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

function RankingRow({ item }) {
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
      <div className="h-1 w-full overflow-hidden bg-[color:var(--line)]">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${barWidth}%` }} />
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
  return (
    <div className="grid min-h-0 gap-1 border border-[color:var(--line)] bg-[var(--surface-raised)] p-2">
      <p className={cn("m-0 truncate text-[0.56rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]")}>{item?.label}</p>
      <p className={cn("m-0 truncate text-[var(--text-heading)]", bodySmTextClassName)}>{item?.value}</p>
      {item?.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
    </div>
  );
}

// Renders the summary cards for the overview dashboard without letting any card scroll.
export default function LogbookPilotStatsSummaryPanel({
  title,
  items,
  onViewAll,
  variant = "ranking",
  maxRows = 5,
  className = ""
}) {
  const rows = (Array.isArray(items) ? items : []).slice(0, maxRows);

  return (
    <Panel className={cn("flex min-h-0 flex-col gap-2 overflow-hidden border border-[color:var(--line)] bg-[var(--surface-raised)] p-3", cardFrameClassName, className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className={cn("m-0 truncate text-[var(--text-heading)]", labelTextClassName)}>{title}</p>
        {onViewAll ? (
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            View all
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 overflow-hidden">
        {rows.length ? (
          variant === "records" ? (
            <div className="grid grid-cols-2 gap-2">
              {rows.map((item) => (
                <RecordTile key={`${item?.recordType || item?.label}-${item?.value}`} item={item} />
              ))}
            </div>
          ) : (
            <div className="grid gap-1.5">
              {rows.map((item) =>
                variant === "landing" ? (
                  <LandingRow key={`${item?.label}-${item?.value}`} item={item} />
                ) : variant === "airport" ? (
                  <AirportRow key={`${item?.label}-${item?.value}`} item={item} />
                ) : (
                  <RankingRow key={`${item?.label}-${item?.value}`} item={item} />
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
