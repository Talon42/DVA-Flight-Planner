import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName, sectionTitleTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";

function resolveSortValue(value) {
  const normalized = String(value ?? "");
  const numeric = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(numeric) && normalized !== "" ? numeric : normalized.toLowerCase();
}

function buildColumns(detailView, detailRows) {
  switch (detailView) {
    case "equipment":
      return {
        title: "All Equipment",
        rows: detailRows.equipment || [],
        columns: [
          { key: "rank", label: "Rank" },
          { key: "label", label: "Equipment" },
          { key: "value", label: "Flights" },
          { key: "percentValue", label: "% of Total" }
        ]
      };
    case "recent-landings":
      return {
        title: "Recent Landings",
        rows: detailRows.recentLandings || [],
        columns: [
          { key: "date", label: "Date" },
          { key: "flight", label: "Flight" },
          { key: "airline", label: "Airline" },
          { key: "route", label: "Route" },
          { key: "equipment", label: "Equipment" },
          { key: "landingRate", label: "Landing Rate" },
          { key: "badge", label: "Badge" }
        ]
      };
    case "top-airports":
      return {
        title: "Top Airports",
        rows: detailRows.topAirports || [],
        columns: [
          { key: "rank", label: "Rank" },
          { key: "label", label: "Airport" },
          { key: "value", label: "Total" },
          { key: "dep", label: "DEP" },
          { key: "arr", label: "ARR" },
          { key: "percentValue", label: "% of Total" }
        ]
      };
    case "routes":
      return {
        title: "All Routes",
        rows: detailRows.routes || [],
        columns: [
          { key: "rank", label: "Rank" },
          { key: "label", label: "Route" },
          { key: "value", label: "Flights" },
          { key: "percentValue", label: "% of Total" }
        ]
      };
    case "records":
      return {
        title: "Records Snapshot",
        rows: detailRows.records || [],
        columns: [
          { key: "label", label: "Record" },
          { key: "value", label: "Value" },
          { key: "meta", label: "Detail" }
        ]
      };
    case "departure-airports":
      return {
        title: "All Departure Airports",
        rows: detailRows.departureAirports || [],
        columns: [
          { key: "rank", label: "Rank" },
          { key: "label", label: "Airport" },
          { key: "value", label: "Departures" },
          { key: "percentValue", label: "% of Total" }
        ]
      };
    case "arrival-airports":
      return {
        title: "All Arrival Airports",
        rows: detailRows.arrivalAirports || [],
        columns: [
          { key: "rank", label: "Rank" },
          { key: "label", label: "Airport" },
          { key: "value", label: "Arrivals" },
          { key: "percentValue", label: "% of Total" }
        ]
      };
    case "airlines":
    default:
      return {
        title: "All Airlines",
        rows: detailRows.airlines || [],
        columns: [
          { key: "rank", label: "Rank" },
          { key: "label", label: "Airline" },
          { key: "value", label: "Flights" },
          { key: "percentValue", label: "% of Total" }
        ]
      };
  }
}

// Renders the detail table without the search/count/comparison header chrome.
export default function LogbookPilotStatsDetailView({ detailView, detailRows, onClose }) {
  const [sortKey, setSortKey] = useState("rank");
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    setSortKey(detailView === "recent-landings" ? "date" : "rank");
    setSortDirection(detailView === "recent-landings" ? "desc" : "asc");
  }, [detailView]);

  const config = useMemo(() => buildColumns(detailView, detailRows), [detailRows, detailView]);

  const sortedRows = useMemo(() => {
    const rows = Array.isArray(config.rows) ? config.rows : [];

    return [...rows].sort((left, right) => {
      const leftValue = resolveSortValue(left?.[sortKey]);
      const rightValue = resolveSortValue(right?.[sortKey]);
      const direction = sortDirection === "asc" ? 1 : -1;

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue)) * direction;
    });
  }, [config.rows, sortDirection, sortKey]);

  function handleSort(columnKey) {
    setSortKey((current) => {
      if (current === columnKey) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return current;
      }

      setSortDirection("asc");
      return columnKey;
    });
  }

  return (
    <Panel
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden border border-[color:var(--line)] bg-[var(--surface-raised)] p-3",
        cardFrameClassName
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} className="justify-self-start">
          <span className="inline-flex items-center gap-1 leading-none">
            <span aria-hidden="true" className="text-base leading-none">
              ‹
            </span>
            <span className="leading-none">Pilot Stats</span>
          </span>
        </Button>

        <p className={cn("m-0 min-w-0 justify-self-center text-center text-[var(--text-heading)]", sectionTitleTextClassName)}>
          {config.title}
        </p>

        <div aria-hidden="true" className="justify-self-end" />
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--surface-raised)]">
            <tr className="border-b border-[color:var(--line)]">
              {config.columns.map((column) => (
                <th key={column.key} className="px-3 py-2 text-left">
                  <button
                    type="button"
                    className={cn(
                      "m-0 inline-flex items-center gap-1 rounded-none bg-transparent uppercase tracking-[0.14em] text-[var(--text-muted)] hover:text-[var(--text-heading)]",
                      labelTextClassName,
                      column.key === sortKey && "text-[var(--text-heading)]"
                    )}
                    onClick={() => handleSort(column.key)}
                  >
                    {column.label}
                    {column.key === sortKey ? (
                      <span aria-hidden="true">{sortDirection === "asc" ? "▴" : "▾"}</span>
                    ) : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length ? (
              sortedRows.map((row) => (
                <tr key={row.id || `${row.label}-${row.rank}`} className="border-b border-[color:var(--line)] last:border-b-0">
                  {config.columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-1.5 align-top text-[var(--text-primary)] dark:text-white",
                        bodySmTextClassName,
                        /^(rank|value|percentValue|dep|arr|landingRate)$/.test(column.key) && "tabular-nums"
                      )}
                    >
                      {row[column.key] ?? LOGBOOK_EMPTY_VALUE}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={config.columns.length} className={cn("px-3 py-6 text-center text-[var(--text-muted)]", bodySmTextClassName)}>
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
