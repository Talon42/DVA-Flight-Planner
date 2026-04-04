import { forwardRef, useEffect, useRef, useState } from "react";
import { FixedSizeList as List } from "react-window";
import {
  formatDistanceNm,
  formatDuration,
  formatTimeOnly
} from "../lib/formatters";
import { getAirlineLogo } from "../lib/airlineBranding";
import Panel from "./ui/Panel";
import { Eyebrow } from "./ui/SectionHeader";
import { cn } from "./ui/cn";

const BODY_CELL_CONTENT_CLASS =
  "flex h-full min-h-0 w-full items-center leading-none";

function AddonAirportIndicator({ airportCode, addonAirports, missingInDatabase = false }) {
  const normalizedAirportCode = String(airportCode || "").trim().toUpperCase();
  if (!normalizedAirportCode) {
    return normalizedAirportCode;
  }

  if (missingInDatabase) {
    return (
      <span
        className={cn(BODY_CELL_CONTENT_CLASS, "gap-1 font-semibold text-[var(--text-primary)]")}
        title="Airport does not exist in database."
        aria-label={`${normalizedAirportCode} airport does not exist in database`}
      >
        <span>{normalizedAirportCode}</span>
        <span
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-ambiguous-bg)] px-1 text-[0.62rem] font-bold text-[var(--delta-red)]"
          aria-hidden="true"
        >
          !
        </span>
      </span>
    );
  }

  if (!addonAirports?.has(normalizedAirportCode)) {
    return normalizedAirportCode;
  }

  return (
      <span className={cn(BODY_CELL_CONTENT_CLASS, "gap-1 font-semibold text-[var(--text-primary)]")}>
      <span>{normalizedAirportCode}</span>
      <span
        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-resolved-bg)] px-1 text-[0.62rem] font-bold text-[var(--status-resolved-text)]"
        aria-label={`${normalizedAirportCode} addon airport`}
      >
        ✓
      </span>
    </span>
  );
}

function formatFlightNumber(value) {
  if (typeof value !== "string") {
    return value ?? "";
  }

  const stripped = value.replace(/^[^\d]+/, "");
  return stripped || value;
}

function resolveAirlineColumnWidth(flights) {
  if (!Array.isArray(flights) || !flights.length) {
    return 180;
  }

  let longestLength = 0;

  for (const flight of flights) {
    const nameLength = (flight?.airlineName || "").length;
    if (nameLength > longestLength) {
      longestLength = nameLength;
    }
  }

  return Math.max(180, Math.min(360, longestLength * 9 + 24));
}

function AirlineCell({ flight }) {
  const airlineName = flight?.airlineName || "";
  const logoSrc = getAirlineLogo({
    airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });

  return (
    <span className={cn(BODY_CELL_CONTENT_CLASS, "min-w-0 gap-2 whitespace-nowrap")}>
      {logoSrc ? (
        <img
          className="h-5 w-5 shrink-0 object-contain"
          src={logoSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <span className="min-w-0 truncate">{airlineName}</span>
    </span>
  );
}

function buildScheduleColumnWidths(baseColumnSpecs, availableTableWidth, airlineFloorWidth) {
  if (!(availableTableWidth > 0)) {
    return null;
  }

  const widths = Object.fromEntries(
    baseColumnSpecs.map((spec) => [spec.key, spec.fallbackWidth])
  );
  const airlineSpec = baseColumnSpecs.find((spec) => spec.key === "airlineName");

  if (!airlineSpec) {
    return buildAdaptiveColumnWidths(
      baseColumnSpecs.map((spec) => ({
        key: spec.key,
        minWidth: spec.minWidth,
        weight: spec.weight
      })),
      availableTableWidth
    );
  }

  const totalFallbackWidth = baseColumnSpecs.reduce((sum, spec) => sum + spec.fallbackWidth, 0);

  if (totalFallbackWidth <= availableTableWidth) {
    return buildAdaptiveColumnWidths(
      baseColumnSpecs.map((spec) => ({
        key: spec.key,
        minWidth: spec.fallbackWidth,
        weight: spec.weight
      })),
      availableTableWidth
    );
  }

  let remainingOverflow = totalFallbackWidth - availableTableWidth;
  const airlineMinimumWidth = Math.max(airlineFloorWidth, 1);
  const airlineShrinkCapacity = Math.max(0, widths.airlineName - airlineMinimumWidth);
  const airlineShrink = Math.min(remainingOverflow, airlineShrinkCapacity);
  widths.airlineName -= airlineShrink;
  remainingOverflow -= airlineShrink;

  if (remainingOverflow <= 0) {
    return widths;
  }

  const nonAirlineSpecs = baseColumnSpecs.filter((spec) => spec.key !== "airlineName");
  const fallbackDelta = nonAirlineSpecs.reduce(
    (sum, spec) => sum + Math.max(0, spec.fallbackWidth - spec.minWidth),
    0
  );

  if (fallbackDelta > 0) {
    for (const spec of nonAirlineSpecs) {
      const shrinkCapacity = Math.max(0, spec.fallbackWidth - spec.minWidth);
      if (shrinkCapacity <= 0) {
        continue;
      }

      const proportionalShrink = Math.min(
        shrinkCapacity,
        Math.floor((remainingOverflow * shrinkCapacity) / fallbackDelta)
      );
      widths[spec.key] -= proportionalShrink;
      remainingOverflow -= proportionalShrink;
    }

    for (const spec of nonAirlineSpecs) {
      if (remainingOverflow <= 0) {
        break;
      }

      const additionalShrink = Math.min(
        remainingOverflow,
        Math.max(0, widths[spec.key] - spec.minWidth)
      );
      widths[spec.key] -= additionalShrink;
      remainingOverflow -= additionalShrink;
    }
  }

  return remainingOverflow <= 0
    ? widths
    : fitWidthsToTarget(
        baseColumnSpecs.map((spec) => ({
          key: spec.key,
          width: widths[spec.key]
        })),
        availableTableWidth
      );
}

function getTableDensityConfig(layoutBucket) {
  if (layoutBucket === "compact") {
    return {
      rowHeight: 36,
      columnScale: 0.82,
      airlineMinWidth: 140,
      airlineMaxWidth: 250,
      timeColumnWidth: 126
    };
  }

  if (layoutBucket === "standard") {
    return {
      rowHeight: 42,
      columnScale: 0.94,
      airlineMinWidth: 164,
      airlineMaxWidth: 320,
      timeColumnWidth: 140
    };
  }

  return {
    rowHeight: 46,
    columnScale: 1,
    airlineMinWidth: 180,
    airlineMaxWidth: 360,
    timeColumnWidth: 150
  };
}

function scaleColumnWidth(width, columnScale) {
  return Math.round(width * columnScale);
}

function fitWidthsToTarget(widthSpecs, targetWidth) {
  if (!Array.isArray(widthSpecs) || !widthSpecs.length || !(targetWidth > 0)) {
    return null;
  }

  const target = Math.max(widthSpecs.length, Math.floor(targetWidth));
  const totalBasisWidth = widthSpecs.reduce((sum, spec) => sum + Math.max(1, Number(spec.width) || 1), 0);

  if (!(totalBasisWidth > 0)) {
    return null;
  }

  const provisional = widthSpecs.map((spec) => {
    const scaledWidth = (Math.max(1, Number(spec.width) || 1) * target) / totalBasisWidth;
    const baseWidth = Math.max(1, Math.floor(scaledWidth));

    return {
      key: spec.key,
      width: baseWidth,
      remainder: scaledWidth - baseWidth
    };
  });

  let assignedWidth = provisional.reduce((sum, spec) => sum + spec.width, 0);
  let remainingWidth = target - assignedWidth;

  if (remainingWidth > 0) {
    const byLargestRemainder = [...provisional].sort((left, right) => right.remainder - left.remainder);
    for (let index = 0; index < remainingWidth; index += 1) {
      byLargestRemainder[index % byLargestRemainder.length].width += 1;
    }
  } else if (remainingWidth < 0) {
    const byLargestWidth = [...provisional].sort((left, right) => right.width - left.width);
    let removeCount = Math.abs(remainingWidth);
    let cursor = 0;
    while (removeCount > 0 && byLargestWidth.length) {
      const entry = byLargestWidth[cursor % byLargestWidth.length];
      if (entry.width > 1) {
        entry.width -= 1;
        removeCount -= 1;
      }
      cursor += 1;
      if (cursor > byLargestWidth.length * target) {
        break;
      }
    }
  }

  assignedWidth = provisional.reduce((sum, spec) => sum + spec.width, 0);
  if (assignedWidth !== target) {
    const firstSpec = provisional[0];
    firstSpec.width += target - assignedWidth;
  }

  return Object.fromEntries(provisional.map((spec) => [spec.key, spec.width]));
}

function buildAdaptiveColumnWidths(specs, availableTableWidth) {
  if (!(availableTableWidth > 0)) {
    return null;
  }

  const totalMinWidth = specs.reduce((sum, spec) => sum + spec.minWidth, 0);

  if (availableTableWidth <= totalMinWidth) {
    return fitWidthsToTarget(
      specs.map((spec) => ({ key: spec.key, width: spec.minWidth })),
      availableTableWidth
    );
  }

  const extraWidth = availableTableWidth - totalMinWidth;
  const totalWeight = specs.reduce((sum, spec) => sum + spec.weight, 0);
  const widths = {};
  let assignedWidth = 0;

  for (const spec of specs) {
    const width = Math.floor(spec.minWidth + (extraWidth * spec.weight) / totalWeight);
    widths[spec.key] = width;
    assignedWidth += width;
  }

  const leftoverWidth = availableTableWidth - assignedWidth;
  for (let index = 0; index < leftoverWidth; index += 1) {
    const spec = specs[index % specs.length];
    widths[spec.key] += 1;
  }

  return widths;
}

function buildColumns(
  timeDisplayMode,
  flights,
  addonAirports,
  layoutBucket,
  useNarrowDesktopColumns,
  availableTableWidth
) {
  const isLocalMode = timeDisplayMode === "local";
  const useShortFlightLabel = layoutBucket !== "expanded";
  const useMinimalFlightLabel = layoutBucket === "compact";
  const useCompactDistanceLabel = layoutBucket === "compact";
  const useShortRouteLabels = useNarrowDesktopColumns || layoutBucket === "expanded";
  const useShortBlockTimeLabel = useNarrowDesktopColumns || layoutBucket === "expanded";
  const densityConfig = getTableDensityConfig(layoutBucket);
  const airlineColumnWidth = Math.max(
    scaleColumnWidth(136, densityConfig.columnScale),
    Math.min(
      densityConfig.airlineMaxWidth,
      Math.round(resolveAirlineColumnWidth(flights) * densityConfig.columnScale)
    )
  );
  const baseColumnSpecs = [
    {
      key: "flightCode",
      label: useMinimalFlightLabel ? "#" : useShortFlightLabel ? "Flight" : "Flight #",
      fallbackWidth: scaleColumnWidth(useNarrowDesktopColumns ? 88 : 102, densityConfig.columnScale),
      minWidth: scaleColumnWidth(useNarrowDesktopColumns ? 70 : 78, densityConfig.columnScale),
      weight: 1,
      render: formatFlightNumber
    },
    {
      key: "airlineName",
      label: "Airline",
      fallbackWidth: airlineColumnWidth,
      minWidth: scaleColumnWidth(useNarrowDesktopColumns ? 134 : 150, densityConfig.columnScale),
      weight: 3.25,
      render: (_, flight) => <AirlineCell flight={flight} />
    },
    {
      key: "from",
      label: useShortRouteLabels ? "DEP" : "Origin",
      fallbackWidth: scaleColumnWidth(useNarrowDesktopColumns ? 94 : 104, densityConfig.columnScale),
      minWidth: scaleColumnWidth(useNarrowDesktopColumns ? 70 : 76, densityConfig.columnScale),
      weight: 1.1,
      render: (value, flight) => (
        <AddonAirportIndicator
          airportCode={value}
          addonAirports={addonAirports}
          missingInDatabase={Array.isArray(flight?.missingAirportIcaos) && flight.missingAirportIcaos.includes(value)}
        />
      )
    },
    {
      key: "to",
      label: useShortRouteLabels ? "ARR" : "Destination",
      fallbackWidth: scaleColumnWidth(useNarrowDesktopColumns ? 94 : 108, densityConfig.columnScale),
      minWidth: scaleColumnWidth(useNarrowDesktopColumns ? 70 : 76, densityConfig.columnScale),
      weight: 1.1,
      render: (value, flight) => (
        <AddonAirportIndicator
          airportCode={value}
          addonAirports={addonAirports}
          missingInDatabase={Array.isArray(flight?.missingAirportIcaos) && flight.missingAirportIcaos.includes(value)}
        />
      )
    }
  ];

  if (!useNarrowDesktopColumns) {
    baseColumnSpecs.push(
      {
        key: isLocalMode ? "stdLocal" : "stdUtc",
        label: isLocalMode ? "DEP (Local)" : "DEP (UTC)",
        fallbackWidth: densityConfig.timeColumnWidth,
        minWidth: scaleColumnWidth(92, densityConfig.columnScale),
        weight: 1.15,
        isTimeColumn: true,
        render: formatTimeOnly
      },
      {
        key: isLocalMode ? "staLocal" : "staUtc",
        label: isLocalMode ? "ARR (Local)" : "ARR (UTC)",
        fallbackWidth: densityConfig.timeColumnWidth,
        minWidth: scaleColumnWidth(92, densityConfig.columnScale),
        weight: 1.15,
        isTimeColumn: true,
        render: formatTimeOnly
      }
    );
  }

  baseColumnSpecs.push(
    {
      key: "blockMinutes",
      label: useNarrowDesktopColumns ? "ETE" : useShortBlockTimeLabel ? "Time" : "Block Time",
      fallbackWidth: scaleColumnWidth(useNarrowDesktopColumns ? 96 : 108, densityConfig.columnScale),
      minWidth: scaleColumnWidth(useNarrowDesktopColumns ? 74 : 82, densityConfig.columnScale),
      weight: 1.2,
      render: formatDuration
    },
    {
      key: "distanceNm",
      label: useCompactDistanceLabel ? "Dist" : "Distance",
      fallbackWidth: scaleColumnWidth(useNarrowDesktopColumns ? 104 : 114, densityConfig.columnScale),
      minWidth: scaleColumnWidth(useNarrowDesktopColumns ? 84 : 92, densityConfig.columnScale),
      weight: 1.35,
      render: formatDistanceNm
    }
  );

  const adaptiveWidths = buildScheduleColumnWidths(
    baseColumnSpecs,
    availableTableWidth,
    scaleColumnWidth(useNarrowDesktopColumns ? 78 : 92, densityConfig.columnScale)
  );

  const columns = baseColumnSpecs.map((spec) => ({
    key: spec.key,
    label: spec.label,
    width: adaptiveWidths?.[spec.key] || spec.fallbackWidth,
    isTimeColumn: spec.isTimeColumn,
    render: spec.render
  }));

  return columns;
}

const INITIAL_VISIBLE_FLIGHTS = 50;
const VISIBLE_FLIGHT_PAGE = 50;
const VISIBLE_FLIGHT_THRESHOLD = 10;

const TableListOuter = forwardRef(function TableListOuter(props, ref) {
  const { style, ...rest } = props;
  return (
    <div
      {...rest}
      ref={ref}
      style={{
        ...style,
        overflowX: "hidden",
        overflowY: "auto"
      }}
    />
  );
});

function SortButton({ label, sortKey, sort, onSort, isTimeColumn, timeDisplayMode, onToggleTimeDisplayMode }) {
  const isActive = sort.key === sortKey;
  const directionClass = isActive
    ? sort.direction === "asc"
      ? "table-sort__icon--asc"
      : "table-sort__icon--desc"
    : "table-sort__icon--none";
  const timeColumnLabel = String(label || "");
  const timeColumnTitle = isTimeColumn ? timeColumnLabel.split(" (")[0] : "";
  const timeColumnModeLabel = timeDisplayMode === "local" ? "Local" : "UTC";

  return (
    <button
      className={cn(
        "flex h-full w-full items-center gap-2 overflow-hidden border-b border-[color:transparent] px-3 py-2 text-left text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] transition-colors duration-150 hover:text-[var(--text-heading)] bp-1024:px-2",
        isActive && "border-b-[color:var(--delta-red)] text-[var(--text-heading)]"
      )}
      type="button"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex min-w-0 max-w-full items-center gap-2">
        {isTimeColumn ? (
          <span className="inline-flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap">
            <span className="min-w-0 truncate">{timeColumnTitle}</span>
            <span className="flex shrink-0 items-center gap-2 text-[0.74rem] tracking-[0.12em]">
              <span className="whitespace-nowrap">{timeColumnModeLabel}</span>
              <span
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[var(--text-muted)] transition-colors duration-150 hover:border-[color:var(--button-ghost-hover-border)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-heading)]",
                  timeDisplayMode === "local"
                    ? "border-[color:rgba(62,129,191,0.48)] bg-[var(--chip-bg)] text-[var(--text-heading)]"
                    : "border-[color:var(--line)] bg-[var(--input-bg)]"
                )}
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTimeDisplayMode();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggleTimeDisplayMode();
                  }
                }}
                aria-label={timeDisplayMode === "local" ? "Switch to UTC time" : "Switch to local time"}
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" focusable="false" aria-hidden="true">
                  <path
                    d="M2.5 8a5.5 5.5 0 0 1 9.4-3.9M13.5 8a5.5 5.5 0 0 1-9.4 3.9"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M11.3 2.8v2.6H8.7M4.7 13.2V10.6h2.6"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </span>
            </span>
          </span>
        ) : (
          <span className="block min-w-0 truncate whitespace-nowrap">{label}</span>
        )}
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center text-[var(--text-muted)] transition-transform duration-150",
            directionClass === "table-sort__icon--asc" && "rotate-180",
            directionClass === "table-sort__icon--none" && "opacity-35"
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
      </span>
    </button>
  );
}

function TableBodyCell({ width, truncate = false, children, onClick, onDoubleClick }) {
  return (
    <div className="schedule-body-cell flex self-stretch shrink-0" style={{ width: `${width}px` }}>
      <button
        type="button"
        className={cn(
          "schedule-body-cell__button block h-full w-full appearance-none border-0 bg-transparent p-0 text-left text-[0.84rem] font-medium text-[var(--text-primary)] outline-none transition-colors duration-150 hover:bg-[rgba(255,255,255,0.18)]"
        )}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <span
          className={cn(
            "schedule-body-cell__content flex h-full min-h-0 w-full items-center overflow-hidden whitespace-nowrap px-3 leading-none bp-1024:px-2",
            truncate && "truncate"
          )}
        >
          {children}
        </span>
      </button>
    </div>
  );
}

function normalizeBodyCellContent(content, truncate = false) {
  if (typeof content === "string" || typeof content === "number") {
    return (
      <span
        className={cn(
          "block min-w-0 overflow-hidden leading-none",
          truncate ? "truncate" : "whitespace-nowrap"
        )}
      >
        {content}
      </span>
    );
  }

  return content;
}

function Row({ index, style, data }) {
  const flight = data.flights[index];

  if (!flight) {
    return null;
  }

  const rowStyle = {
    ...style,
    width: `${data.totalWidth}px`,
    minWidth: `${data.totalWidth}px`
  };

  return (
    <div
      className={cn(
        "schedule-body-row flex h-full items-stretch border-b border-[color:var(--line)] bg-[var(--surface-table-row)] even:bg-[var(--surface-table-row-alt)]",
        data.selectedFlightId === flight.flightId && "bg-[var(--surface-table-row-selected)]"
      )}
      style={rowStyle}
    >
      {data.columns.map((column) => {
        const value = flight[column.key];
        const content = column.render ? column.render(value, flight) : value;
        const shouldTruncate = column.key === "airlineName";
        const normalizedContent = normalizeBodyCellContent(content, shouldTruncate);

        return (
          <TableBodyCell
            key={column.key}
            width={column.width}
            truncate={shouldTruncate}
            onClick={() => data.onSelectFlight(flight.flightId)}
            onDoubleClick={() => data.onAddToFlightBoard(flight.flightId)}
          >
            {normalizedContent}
          </TableBodyCell>
        );
      })}
    </div>
  );
}

export default function FlightTable({
  flights,
  selectedFlightId,
  sort,
  layoutBucket,
  useNarrowDesktopColumns = false,
  timeDisplayMode,
  addonAirports,
  onSort,
  onToggleTimeDisplayMode,
  onSelectFlight,
  onAddToFlightBoard
}) {
  const [availableTableWidth, setAvailableTableWidth] = useState(0);
  const columns = buildColumns(
    timeDisplayMode,
    flights,
    addonAirports,
    layoutBucket,
    useNarrowDesktopColumns,
    availableTableWidth
  );
  const densityConfig = getTableDensityConfig(layoutBucket);
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const tableShellRef = useRef(null);
  const headerScrollRef = useRef(null);
  const listOuterRef = useRef(null);
  const tableBodyRef = useRef(null);
  const firstFlightId = flights[0]?.flightId || "";
  const lastFlightId = flights[flights.length - 1]?.flightId || "";
  const [visibleFlightCount, setVisibleFlightCount] = useState(() =>
    Math.min(flights.length, INITIAL_VISIBLE_FLIGHTS)
  );
  const [listHeight, setListHeight] = useState(320);

  useEffect(() => {
    setVisibleFlightCount(Math.min(flights.length, INITIAL_VISIBLE_FLIGHTS));
  }, [flights.length, firstFlightId, lastFlightId]);

  useEffect(() => {
    const outerNode = listOuterRef.current;

    if (!outerNode) {
      return undefined;
    }

    const syncHeader = () => {
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = outerNode.scrollLeft;
      }
    };

    syncHeader();
    outerNode.addEventListener("scroll", syncHeader);

    return () => {
      outerNode.removeEventListener("scroll", syncHeader);
    };
  }, [flights.length]);

  useEffect(() => {
    const tableBodyNode = tableBodyRef.current;

    if (!tableBodyNode) {
      return undefined;
    }

    const updateListHeight = () => {
      setListHeight(Math.max(140, Math.floor(tableBodyNode.clientHeight)));
    };

    updateListHeight();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(() => {
        updateListHeight();
      });
      resizeObserver.observe(tableBodyNode);
      return () => {
        resizeObserver.disconnect();
      };
    }

    window.addEventListener("resize", updateListHeight);
    return () => {
      window.removeEventListener("resize", updateListHeight);
    };
  }, [layoutBucket, flights.length]);

  useEffect(() => {
    const tableBodyNode = tableBodyRef.current;
    const headerScrollNode = headerScrollRef.current;
    const tableShellNode = tableShellRef.current;
    const listOuterNode = listOuterRef.current;

    if (!tableBodyNode && !headerScrollNode && !tableShellNode && !listOuterNode) {
      return undefined;
    }

    const updateAvailableTableWidth = () => {
      const measuredWidths = [
        listOuterNode?.clientWidth || 0,
        headerScrollNode?.clientWidth || 0,
        tableBodyNode?.clientWidth || 0,
        tableShellNode?.clientWidth || 0
      ].filter((width) => width > 0);
      const measuredWidth = measuredWidths.length ? Math.min(...measuredWidths) : 0;
      setAvailableTableWidth(Math.max(0, Math.floor(measuredWidth)));
    };

    updateAvailableTableWidth();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(() => {
        updateAvailableTableWidth();
      });
      if (listOuterNode) {
        resizeObserver.observe(listOuterNode);
      }
      if (tableBodyNode) {
        resizeObserver.observe(tableBodyNode);
      }
      if (headerScrollNode) {
        resizeObserver.observe(headerScrollNode);
      }
      if (tableShellNode) {
        resizeObserver.observe(tableShellNode);
      }
      return () => {
        resizeObserver.disconnect();
      };
    }

    window.addEventListener("resize", updateAvailableTableWidth);
    return () => {
      window.removeEventListener("resize", updateAvailableTableWidth);
    };
  }, []);

  function handleItemsRendered({ visibleStopIndex }) {
    if (
      visibleStopIndex < visibleFlightCount - VISIBLE_FLIGHT_THRESHOLD ||
      visibleFlightCount >= flights.length
    ) {
      return;
    }

    setVisibleFlightCount((current) =>
      Math.min(flights.length, current + VISIBLE_FLIGHT_PAGE)
    );
  }

  const itemData = {
    columns,
    totalWidth,
    flights: flights.slice(0, visibleFlightCount),
    selectedFlightId,
    onSelectFlight,
    onAddToFlightBoard
  };

  return (
    <Panel
      as="section"
      ref={tableShellRef}
      padding="none"
      data-docshot="schedule-table"
      className={cn(
        "table-shell flex min-h-0 flex-col overflow-hidden rounded-[26px] bp-1024:rounded-[20px]",
        useNarrowDesktopColumns && "table-shell--narrow-columns"
      )}
    >
      <div className="px-5 pb-0 pt-5 bp-1024:px-4 bp-1024:pt-4">
        <Eyebrow>Schedule</Eyebrow>
      </div>
      <div className="app-scrollbar overflow-x-auto overflow-y-hidden px-5 bp-1024:px-4" ref={headerScrollRef}>
        <div
          className="table-header border-b border-[color:var(--line)]"
          style={{ width: `${totalWidth}px`, minWidth: `${totalWidth}px` }}
        >
          {columns.map((column) => (
            <div key={column.key} className="inline-flex shrink-0" style={{ width: `${column.width}px` }}>
              <SortButton
                label={column.label}
                sortKey={column.sortKey || column.key}
                sort={sort}
                onSort={onSort}
                isTimeColumn={column.isTimeColumn}
                timeDisplayMode={timeDisplayMode}
                onToggleTimeDisplayMode={onToggleTimeDisplayMode}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 px-5 pb-5 bp-1024:px-4 bp-1024:pb-4" ref={tableBodyRef}>
        <List
          className="flight-list app-scrollbar"
          height={listHeight}
          itemCount={visibleFlightCount}
          itemData={itemData}
          itemSize={densityConfig.rowHeight}
          onItemsRendered={handleItemsRendered}
          outerRef={listOuterRef}
          outerElementType={TableListOuter}
          width="100%"
        >
          {Row}
        </List>
      </div>
    </Panel>
  );
}
