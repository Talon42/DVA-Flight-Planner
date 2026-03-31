import { useEffect, useRef } from "react";
import { FixedSizeList as List } from "react-window";
import {
  formatCompactNumber,
  formatDateTime,
  formatTimeOnly
} from "../lib/formatters";

const COLUMNS = [
  { key: "flightCode", label: "Flight", width: 118 },
  { key: "airlineName", label: "Airline", width: 180 },
  { key: "route", label: "Route", width: 124 },
  { key: "stdLocal", label: "STD Local", width: 110, render: formatDateTime },
  { key: "stdUtc", label: "STD UTC", width: 110, render: formatDateTime },
  { key: "staLocal", label: "STA Local", width: 110, render: formatDateTime },
  { key: "localDepartureClock", label: "Local", width: 72, render: formatTimeOnly },
  { key: "utcDepartureClock", label: "UTC", width: 72 },
  { key: "aircraftProfile", label: "Aircraft", width: 188 },
  { key: "aircraftFamily", label: "Family", width: 84 },
  { key: "maxPax", label: "Pax", width: 78, render: formatCompactNumber },
  { key: "mtow", label: "MTOW", width: 100, render: formatCompactNumber },
  { key: "mlw", label: "MLW", width: 100, render: formatCompactNumber },
  { key: "matchStatus", label: "Status", width: 108 }
];

function SortButton({ label, sortKey, sort, onSort }) {
  const isActive = sort.key === sortKey;
  const direction = isActive ? sort.direction : "none";

  return (
    <button
      className={`table-sort ${isActive ? "table-sort--active" : ""}`}
      type="button"
      onClick={() => onSort(sortKey)}
    >
      <span>{label}</span>
      <span className="table-sort__icon">
        {direction === "asc" ? "^" : direction === "desc" ? "v" : "-"}
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
      <button
        className={`pin-button ${flight.isShortlisted ? "pin-button--active" : ""}`}
        type="button"
        onClick={() => data.onToggleShortlist(flight.flightId)}
        title={flight.isShortlisted ? "Remove from shortlist" : "Add to shortlist"}
      >
        {flight.isShortlisted ? "*" : "o"}
      </button>

      {COLUMNS.map((column) => {
        const value = flight[column.key];
        const content = column.render ? column.render(value) : value;

        return (
          <button
            key={column.key}
            type="button"
            className="table-cell"
            style={{ width: `${column.width}px` }}
            onClick={() => data.onSelectFlight(flight.flightId)}
            title={typeof content === "string" ? content : String(value ?? "")}
          >
            {column.key === "matchStatus" ? (
              <span className={`status-chip status-chip--${flight.matchStatus}`}>
                {flight.matchStatus}
              </span>
            ) : (
              content
            )}
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
  onSort,
  onSelectFlight,
  onToggleShortlist
}) {
  const totalWidth = COLUMNS.reduce((sum, column) => sum + column.width, 64);
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
    flights,
    selectedFlightId,
    onSelectFlight,
    onToggleShortlist
  };

  return (
    <section className="table-shell">
      <div className="table-header-scroll" ref={headerScrollRef}>
        <div className="table-header" style={{ minWidth: `${totalWidth}px` }}>
          <div className="table-header__pin">Pin</div>
          {COLUMNS.map((column) => (
            <div key={column.key} style={{ width: `${column.width}px` }}>
              <SortButton
                label={column.label}
                sortKey={column.key}
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
