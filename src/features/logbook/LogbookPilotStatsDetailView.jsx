import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName, labelTextClassName, sectionTitleTextClassName } from "../../components/ui/typography";
import { cardFrameClassName } from "../../components/ui/patterns";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";
import { buildDvaPirepId, LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";
import { LandingGradeBadge } from "./logbookLandingGrade.jsx";
import LogbookEquipmentGlyph from "./LogbookEquipmentGlyph.jsx";
import { openDesktopUrl } from "../../services/tauri/desktopShell.client.js";

function resolveNumericSortValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === LOGBOOK_EMPTY_VALUE) {
    return null;
  }

  const match = normalized.replace(/,/g, "").match(/^[-+]?\d*\.?\d+/);
  const numeric = match ? Number(match[0]) : Number(normalized.replace(/%$/, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveTextSortValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function formatCompactDashDate(dateSortKey) {
  const normalized = String(dateSortKey ?? "").trim();
  if (!normalized || !/^\d{8}$/.test(normalized)) {
    return LOGBOOK_EMPTY_VALUE;
  }

  const month = normalized.slice(4, 6);
  const day = normalized.slice(6, 8);
  const year = normalized.slice(2, 4);
  return `${month}-${day}-${year}`;
}

// Builds the Delta Virtual PIREP URL for a recent landing row so the flight label can open the report page.
function getRecentLandingPirepUrl(row) {
  const pirepId = buildDvaPirepId(row?.dvaPirepId || row?.rawLogbookId || row?.id);
  return pirepId ? `https://www.deltava.org/pirep.do?id=${pirepId}` : "";
}

// Splits the recent-landing route into fixed-width airport codes so the arrow stays aligned.
function getRecentLandingRouteSegments(routeValue) {
  const normalizedRoute = String(routeValue ?? "").trim();
  if (!normalizedRoute) {
    return { departure: LOGBOOK_EMPTY_VALUE, arrival: LOGBOOK_EMPTY_VALUE };
  }

  const [departure = "", arrival = ""] = normalizedRoute.split(/\s*(?:->|→)\s*/);
  return {
    departure: departure.trim() || LOGBOOK_EMPTY_VALUE,
    arrival: arrival.trim() || LOGBOOK_EMPTY_VALUE
  };
}

// Resolves the airport display name from the shared catalog so the detail table can show ICAO and name separately.
function getAirportActualName(icao) {
  const airport = getAirportByIcao(icao);
  return String(airport?.actualName || airport?.name || icao || "").trim();
}

// Picks the underlying sort value for each detail column so formatting does not affect ordering.
function getDetailSortValue(detailView, columnKey, row) {
  switch (detailView) {
    case "recent-landings":
      switch (columnKey) {
        case "date":
          return resolveNumericSortValue(row?.dateSortKey);
        case "landingRate":
          return resolveNumericSortValue(row?.rawLandingRate ?? row?.landingRate);
        case "grade":
          return resolveTextSortValue(row?.grade);
        case "flight":
        case "airline":
        case "dep":
        case "arr":
        case "equipment":
          return resolveTextSortValue(row?.[columnKey]);
        default:
          return resolveNumericSortValue(row?.[columnKey]) ?? resolveTextSortValue(row?.[columnKey]);
      }

    case "top-airports":
      switch (columnKey) {
        case "rank":
          return resolveNumericSortValue(row?.rank);
        case "label":
          return resolveTextSortValue(row?.label);
        case "actualName":
          return resolveTextSortValue(row?.actualName);
        case "value":
          return resolveNumericSortValue(row?.valueRaw ?? row?.value);
        case "dep":
          return resolveNumericSortValue(row?.depRaw ?? row?.dep);
        case "arr":
          return resolveNumericSortValue(row?.arrRaw ?? row?.arr);
        case "percentValue":
          return resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue);
        default:
          return resolveNumericSortValue(row?.[columnKey]) ?? resolveTextSortValue(row?.[columnKey]);
      }

    case "equipment":
    case "routes":
    case "departure-airports":
    case "arrival-airports":
    case "airlines":
      switch (columnKey) {
        case "rank":
          return resolveNumericSortValue(row?.rank);
        case "label":
          return resolveTextSortValue(row?.label);
        case "value":
          return resolveNumericSortValue(row?.valueRaw ?? row?.count ?? row?.value);
        case "percentValue":
          return resolveNumericSortValue(row?.percentValueRaw ?? row?.percentValue);
        default:
          return resolveNumericSortValue(row?.[columnKey]) ?? resolveTextSortValue(row?.[columnKey]);
      }

    case "records":
      if (columnKey === "label" || columnKey === "meta") {
        return resolveTextSortValue(row?.[columnKey]);
      }

      if (columnKey === "value") {
        return resolveNumericSortValue(row?.valueRaw ?? row?.value) ?? resolveTextSortValue(row?.value);
      }

      return resolveNumericSortValue(row?.[columnKey]) ?? resolveTextSortValue(row?.[columnKey]);

    default:
      return resolveNumericSortValue(row?.[columnKey]) ?? resolveTextSortValue(row?.[columnKey]);
  }
}

// Matches the shared table sort chevron so the detail view uses the same visual cue.
function SortChevron({ direction, active }) {
  return (
    <span
      className={cn(
        "pointer-events-none flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)] transition-transform duration-150",
        active ? "" : "opacity-35",
        active && direction === "asc" && "rotate-180"
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" focusable="false">
        <path
          d="M4 6.5 8 10.5 12 6.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
      </svg>
    </span>
  );
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
        rows: (detailRows.recentLandings || []).map((row) => ({
          ...row,
          date: formatCompactDashDate(row?.dateSortKey),
          dep: getRecentLandingRouteSegments(row?.route).departure,
          arr: getRecentLandingRouteSegments(row?.route).arrival,
          landingRate: Number.isFinite(row?.rawLandingRate) ? `${row.rawLandingRate} fpm` : LOGBOOK_EMPTY_VALUE,
          grade: row?.badge || LOGBOOK_EMPTY_VALUE
        })),
        columns: [
          { key: "date", label: "Date" },
          { key: "flight", label: "Flight" },
          { key: "airline", label: "Airline" },
          { key: "dep", label: "DEP" },
          { key: "arr", label: "ARR" },
          { key: "equipment", label: "Equipment" },
          { key: "landingRate", label: "Landing Rate" },
          { key: "grade", label: "Grade" }
        ]
      };
    case "top-airports":
      return {
        title: "Top Airports",
        rows: (detailRows.topAirports || []).map((row) => ({
          ...row,
          actualName: getAirportActualName(row?.label)
        })),
        columns: [
          { key: "rank", label: "Rank" },
          { key: "label", label: "ICAO" },
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
  const textCollator = useMemo(() => new Intl.Collator("en", { numeric: true, sensitivity: "base" }), []);

  useEffect(() => {
    setSortKey(detailView === "recent-landings" ? "date" : "rank");
    setSortDirection(detailView === "recent-landings" ? "desc" : "asc");
  }, [detailView]);

  const config = useMemo(() => buildColumns(detailView, detailRows), [detailRows, detailView]);

  const sortedRows = useMemo(() => {
    const rows = Array.isArray(config.rows) ? config.rows : [];

    return [...rows].sort((left, right) => {
      const leftValue = getDetailSortValue(detailView, sortKey, left);
      const rightValue = getDetailSortValue(detailView, sortKey, right);
      const direction = sortDirection === "asc" ? 1 : -1;

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }

      return textCollator.compare(String(leftValue), String(rightValue)) * direction;
    });
  }, [config.rows, detailView, sortDirection, sortKey, textCollator]);

  function handleSort(columnKey) {
    if (sortKey === columnKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(columnKey);
    setSortDirection("asc");
  }

  function handleOpenPirep(event, pirepUrl) {
    event.stopPropagation();

    if (!pirepUrl) {
      return;
    }

    void openDesktopUrl(pirepUrl).catch((error) => {
      console.error("Unable to open DVA PIREP page.", error);
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="justify-self-start text-[0.88rem] bp-1024:text-[0.82rem]"
        >
          <span className="inline-flex items-center gap-1">
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5L7 10l5 5" />
            </svg>
            <span>Back</span>
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
                    <SortChevron direction={sortDirection} active={column.key === sortKey} />
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
                        "px-3 py-1.5 align-middle text-[var(--text-primary)] dark:text-white",
                        bodyMdTextClassName,
                        /^(rank|value|percentValue|dep|arr|landingRate)$/.test(column.key) && "tabular-nums"
                      )}
                    >
                      {detailView === "recent-landings" && column.key === "grade" ? (
                        <LandingGradeBadge grade={row.grade} />
                      ) : detailView === "recent-landings" && column.key === "flight" ? (
                        (() => {
                          const pirepUrl = getRecentLandingPirepUrl(row);
                          const flightValue = row[column.key] ?? LOGBOOK_EMPTY_VALUE;

                          if (!pirepUrl) {
                            return flightValue;
                          }

                          return (
                            <button
                              type="button"
                              title={`Open DVA PIREP ${String(row?.dvaPirepId || row?.rawLogbookId || row?.id || "").trim()}`}
                              className="m-0 inline-flex min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left font-inherit text-[length:inherit] font-normal leading-none tracking-[inherit] text-inherit hover:underline focus-visible:underline focus-visible:outline-none"
                              onClick={(event) => handleOpenPirep(event, pirepUrl)}
                            >
                              <span className="min-w-0 truncate">{flightValue}</span>
                            </button>
                          );
                        })()
                      ) : detailView === "recent-landings" && (column.key === "dep" || column.key === "arr") ? (
                        (() => {
                          const departure = String(row.dep || LOGBOOK_EMPTY_VALUE).trim();
                          const arrival = String(row.arr || LOGBOOK_EMPTY_VALUE).trim();
                          const routeValue = String(row.route || "").trim();

                          if (column.key === "dep") {
                            return (
                              <span className="whitespace-nowrap text-left tabular-nums" title={routeValue || undefined}>
                                {departure}
                              </span>
                            );
                          }

                          return (
                            <span className="whitespace-nowrap text-left tabular-nums" title={routeValue || undefined}>
                              {arrival}
                            </span>
                          );
                        })()
                      ) : detailView === "equipment" && column.key === "label" ? (
                        <span className={cn("inline-flex min-w-0 items-center gap-2", bodyMdTextClassName)}>
                          <LogbookEquipmentGlyph equipment={row[column.key]} className="h-10 w-10" />
                          <span className="min-w-0 truncate">{row[column.key] ?? LOGBOOK_EMPTY_VALUE}</span>
                        </span>
                      ) : detailView === "top-airports" && column.key === "label" ? (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[var(--text-primary)] dark:text-white">
                            {row[column.key] ?? LOGBOOK_EMPTY_VALUE}
                          </span>
                          {row?.actualName ? (
                            <span className="truncate text-[var(--text-muted)]">{row.actualName}</span>
                          ) : null}
                        </span>
                      ) : detailView === "airlines" && column.key === "label" && row.row?.airlineLogoSrc ? (
                        <span className={cn("inline-flex min-w-0 items-center gap-2", bodyMdTextClassName)}>
                          <img
                            src={row.row.airlineLogoSrc}
                            alt=""
                            aria-hidden="true"
                            className={cn("h-5 w-5 shrink-0 object-contain", row.row.airlineLogoClassName)}
                            loading="lazy"
                          />
                          <span className="min-w-0 truncate">{row[column.key] ?? LOGBOOK_EMPTY_VALUE}</span>
                        </span>
                      ) : (
                        row[column.key] ?? LOGBOOK_EMPTY_VALUE
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={config.columns.length} className={cn("px-3 py-6 text-center text-[var(--text-muted)]", bodyMdTextClassName)}>
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
