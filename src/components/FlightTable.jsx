import { useEffect, useRef, useState } from "react";
import { FixedSizeList as List } from "react-window";
import {
  formatDistanceNm,
  formatDuration,
  formatTimeOnly
} from "../lib/formatters";
import { getAirlineLogo } from "../lib/airlineBranding";

function AddonAirportIndicator({ airportCode, addonAirports }) {
  const normalizedAirportCode = String(airportCode || "").trim().toUpperCase();
  if (!normalizedAirportCode || !addonAirports?.has(normalizedAirportCode)) {
    return normalizedAirportCode;
  }

  return (
      <span className="airport-code-with-addon">
      <span>{normalizedAirportCode}</span>
      <span className="addon-airport-badge" aria-label={`${normalizedAirportCode} addon airport`}>
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

function AirlineCell({ flight }) {
  const airlineName = flight?.airlineName || "";
  const logoSrc = getAirlineLogo({
    airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });

  return (
    <span className="airline-cell">
      {logoSrc ? (
        <img
          className="airline-cell__logo"
          src={logoSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <span className="airline-cell__name">{airlineName}</span>
    </span>
  );
}

function buildColumns(timeDisplayMode, flights, addonAirports) {
  const isLocalMode = timeDisplayMode === "local";
  const airlineColumnWidth = resolveAirlineColumnWidth(flights);

  return [
    { key: "flightIcao", label: "ICAO", width: 82, sortKey: "flightCode", render: (_, flight) => formatFlightIcao(flight?.flightCode) },
    { key: "flightCode", label: "Flight #", width: 118, render: formatFlightNumber },
    {
      key: "airlineName",
      label: "Airline",
      width: airlineColumnWidth,
      render: (_, flight) => <AirlineCell flight={flight} />
    },
    { key: "from", label: "Origin", width: 124, render: (value) => <AddonAirportIndicator airportCode={value} addonAirports={addonAirports} /> },
    { key: "to", label: "Destination", width: 136, render: (value) => <AddonAirportIndicator airportCode={value} addonAirports={addonAirports} /> },
    {
      key: isLocalMode ? "stdLocal" : "stdUtc",
      label: isLocalMode ? "DEP (Local)" : "DEP (UTC)",
      width: 150,
      isTimeColumn: true,
      render: formatTimeOnly
    },
    {
      key: isLocalMode ? "staLocal" : "staUtc",
      label: isLocalMode ? "ARR (Local)" : "ARR (UTC)",
      width: 150,
      isTimeColumn: true,
      render: formatTimeOnly
    },
    { key: "blockMinutes", label: "Block Time", width: 124, render: formatDuration },
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

const INITIAL_VISIBLE_FLIGHTS = 50;
const VISIBLE_FLIGHT_PAGE = 50;
const VISIBLE_FLIGHT_THRESHOLD = 10;

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
      className={`table-sort ${isActive ? "table-sort--active" : ""} ${
        isTimeColumn ? "table-sort--time-column" : ""
      }`}
      type="button"
      onClick={() => onSort(sortKey)}
    >
      <span className="table-sort__label">
        {isTimeColumn ? (
          <span className="table-sort__time-label">
            <span>{timeColumnTitle}</span>
            <span className="table-sort__time-mode-row">
              <span>{timeColumnModeLabel}</span>
              <span
                className={`time-mode-toggle ${
                  timeDisplayMode === "local" ? "time-mode-toggle--local" : "time-mode-toggle--utc"
                }`}
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
                title={timeDisplayMode === "local" ? "Switch to UTC time" : "Switch to local time"}
                aria-label={timeDisplayMode === "local" ? "Switch to UTC time" : "Switch to local time"}
              >
                <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
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
          <span>{label}</span>
        )}
      </span>
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
  addonAirports,
  onSort,
  onToggleTimeDisplayMode,
  onSelectFlight,
  onAddToFlightBoard
}) {
  const columns = buildColumns(timeDisplayMode, flights, addonAirports);
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const headerScrollRef = useRef(null);
  const listOuterRef = useRef(null);
  const firstFlightId = flights[0]?.flightId || "";
  const lastFlightId = flights[flights.length - 1]?.flightId || "";
  const [visibleFlightCount, setVisibleFlightCount] = useState(() =>
    Math.min(flights.length, INITIAL_VISIBLE_FLIGHTS)
  );

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
    flights: flights.slice(0, visibleFlightCount),
    selectedFlightId,
    onSelectFlight,
    onAddToFlightBoard
  };

  return (
    <section className="table-shell">
      <div className="table-shell__header">
        <p className="eyebrow">Schedule</p>
      </div>
      <div className="table-header-scroll" ref={headerScrollRef}>
        <div className="table-header" style={{ minWidth: `${totalWidth}px` }}>
          {columns.map((column) => (
            <div key={column.key} style={{ width: `${column.width}px` }}>
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

      <div className="table-body">
        <List
          className="flight-list"
          height={560}
          itemCount={visibleFlightCount}
          itemData={itemData}
          itemSize={46}
          onItemsRendered={handleItemsRendered}
          outerRef={listOuterRef}
          width="100%"
        >
          {Row}
        </List>
      </div>
    </section>
  );
}
