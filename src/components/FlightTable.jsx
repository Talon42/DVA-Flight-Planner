import { useEffect, useRef } from "react";
import { FixedSizeList as List } from "react-window";
import {
  formatDistanceNm,
  formatDuration,
  formatTimeOnly
} from "../lib/formatters";

function formatFlightNumber(value) {
  if (typeof value !== "string") {
    return value ?? "";
  }

  const stripped = value.replace(/^[^\d]+/, "");
  return stripped || value;
}

function formatFlightIcao(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.match(/^[^\d]+/)?.[0] || "";
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

function buildColumns(timeDisplayMode, flights) {
  const isLocalMode = timeDisplayMode === "local";
  const airlineColumnWidth = resolveAirlineColumnWidth(flights);

  return [
    { key: "flightIcao", label: "ICAO", width: 82, sortKey: "flightCode", render: (_, flight) => formatFlightIcao(flight?.flightCode) },
    { key: "flightCode", label: "Flight #", width: 118, render: formatFlightNumber },
    { key: "airlineName", label: "Airline", width: airlineColumnWidth },
    { key: "from", label: "Origin", width: 92 },
    { key: "to", label: "Destination", width: 104 },
    {
      key: isLocalMode ? "stdLocal" : "stdUtc",
      label: isLocalMode ? "Departure (Local)" : "Departure (UTC)",
      width: 140,
      render: formatTimeOnly
    },
    {
      key: isLocalMode ? "staLocal" : "staUtc",
      label: isLocalMode ? "Arrival (Local)" : "Arrival (UTC)",
      width: 140,
      render: formatTimeOnly
    },
    { key: "blockMinutes", label: "Block Time", width: 100, render: formatDuration },
    { key: "distanceNm", label: "Distance", width: 110, render: formatDistanceNm }
  ];
}

const RIGHT_ALIGNED_COLUMN_KEYS = new Set([
  "stdUtc",
  "staUtc",
  "stdLocal",
  "staLocal",
  "blockMinutes",
  "distanceNm"
]);

function SortButton({ label, sortKey, sort, onSort }) {
  const isActive = sort.key === sortKey;
  const directionClass = isActive
    ? sort.direction === "asc"
      ? "table-sort__icon--asc"
      : "table-sort__icon--desc"
    : "table-sort__icon--none";

  return (
    <button
      className={`table-sort ${isActive ? "table-sort--active" : ""}`}
      type="button"
      onClick={() => onSort(sortKey)}
    >
      <span>{label}</span>
      <span className={`table-sort__icon ${directionClass}`} aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
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
    </button>
  );
}

function Row({ index, style, data }) {
  const flight = data.flights[index];

  if (!flight) {
    return null;
  }

  return (
    <div
      className={`table-row ${
        data.selectedFlightId === flight.flightId ? "table-row--selected" : ""
      }`}
      style={style}
    >
      {data.columns.map((column) => {
        const value = flight[column.key];
        const content = column.render ? column.render(value, flight) : value;

        return (
          <button
            key={column.key}
            type="button"
            className={`table-cell ${
              RIGHT_ALIGNED_COLUMN_KEYS.has(column.key) ? "table-cell--right" : ""
            }`}
            style={{ width: `${column.width}px` }}
            onClick={() => data.onSelectFlight(flight.flightId)}
            onDoubleClick={() => data.onAddToFlightBoard(flight.flightId)}
            title={typeof content === "string" ? content : String(value ?? "")}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export default function FlightTable({
  flights,
  selectedFlightId,
  sort,
  timeDisplayMode,
  onSort,
  onSelectFlight,
  onAddToFlightBoard
}) {
  const columns = buildColumns(timeDisplayMode, flights);
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const headerScrollRef = useRef(null);
  const listOuterRef = useRef(null);

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

  const itemData = {
    columns,
    flights,
    selectedFlightId,
    onSelectFlight,
    onAddToFlightBoard
  };

  return (
    <section className="table-shell">
      <div className="table-header-scroll" ref={headerScrollRef}>
        <div className="table-header" style={{ minWidth: `${totalWidth}px` }}>
          {columns.map((column) => (
            <div key={column.key} style={{ width: `${column.width}px` }}>
              <SortButton
                label={column.label}
                sortKey={column.sortKey || column.key}
                sort={sort}
                onSort={onSort}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="table-body">
        <List
          className="flight-list"
          height={560}
          itemCount={flights.length}
          itemData={itemData}
          itemSize={46}
          outerRef={listOuterRef}
          width="100%"
        >
          {Row}
        </List>
      </div>
    </section>
  );
}
