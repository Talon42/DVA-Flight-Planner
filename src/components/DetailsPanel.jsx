import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatUtc,
  formatZoneLabel
} from "../lib/formatters";

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function DetailsPanel({
  selectedFlight,
  shortlist,
  onSelectFlight,
  onToggleShortlist,
  onOpenImportErrorLog,
  onOpenImportTraceLog,
  importTracePath,
  importSummary
}) {
  return (
    <aside className="details-panel">
      <section className="details-card">
        <div className="details-card__header">
          <p className="eyebrow">Selected Flight</p>
          <h2>{selectedFlight ? selectedFlight.flightCode : "No flight selected"}</h2>
        </div>

        {selectedFlight ? (
          <>
            <div className="route-banner">
              <div>
                <span>{selectedFlight.from}</span>
                <small>{selectedFlight.fromAirport}</small>
              </div>
              <strong>{selectedFlight.route}</strong>
              <div>
                <span>{selectedFlight.to}</span>
                <small>{selectedFlight.toAirport}</small>
              </div>
            </div>

            <div className="details-grid">
              <DetailRow label="Airline" value={selectedFlight.airlineName} />
              <DetailRow label="Aircraft" value={selectedFlight.aircraftProfile} />
              <DetailRow label="Family" value={selectedFlight.aircraftFamily} />
              <DetailRow label="Match" value={selectedFlight.matchReason} />
              <DetailRow
                label="STD Local"
                value={`${formatDateTime(selectedFlight.stdLocal)} (${formatZoneLabel(
                  selectedFlight.fromTimezone
                )})`}
              />
              <DetailRow
                label="STA Local"
                value={`${formatDateTime(selectedFlight.staLocal)} (${formatZoneLabel(
                  selectedFlight.toTimezone
                )})`}
              />
              <DetailRow label="STD UTC" value={formatUtc(selectedFlight.stdUtc)} />
              <DetailRow label="STA UTC" value={formatUtc(selectedFlight.staUtc)} />
              <DetailRow
                label="Block Time"
                value={formatDuration(selectedFlight.blockMinutes)}
              />
              <DetailRow label="Max Pax" value={formatNumber(selectedFlight.maxPax)} />
              <DetailRow label="MTOW" value={formatNumber(selectedFlight.mtow)} />
              <DetailRow label="MLW" value={formatNumber(selectedFlight.mlw)} />
            </div>

            <button
              className={`primary-button ${
                selectedFlight.isShortlisted ? "primary-button--active" : ""
              }`}
              type="button"
              onClick={() => onToggleShortlist(selectedFlight.flightId)}
            >
              {selectedFlight.isShortlisted
                ? "Remove From Shortlist"
                : "Add To Shortlist"}
            </button>
          </>
        ) : (
          <p className="empty-note">
            Import a schedule and select a row to inspect times, aircraft data, and
            shortlist status.
          </p>
        )}
      </section>

      <section className="details-card">
        <div className="details-card__header">
          <p className="eyebrow">Import Health</p>
          <h2>Validation Summary</h2>
        </div>

        <div className="details-grid">
          <DetailRow label="Source File" value={importSummary?.sourceFileName || "None"} />
          <DetailRow
            label="Imported Rows"
            value={formatNumber(importSummary?.importedRows ?? 0)}
          />
          <DetailRow
            label="Omitted Rows"
            value={formatNumber(importSummary?.omittedRows ?? 0)}
          />
          <DetailRow
            label="Ambiguous Aircraft"
            value={formatNumber(importSummary?.ambiguousAircraftRows ?? 0)}
          />
        </div>

        <div className="details-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={onOpenImportErrorLog}
            disabled={!importSummary?.errorLogPath && !importSummary?.omittedRows}
          >
            Open Import Error Log
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={onOpenImportTraceLog}
            disabled={!importTracePath}
          >
            Open Import Trace Log
          </button>
        </div>
      </section>

      <section className="details-card">
        <div className="details-card__header">
          <p className="eyebrow">Pinned Flights</p>
          <h2>{shortlist.length} in shortlist</h2>
        </div>

        {shortlist.length ? (
          <div className="shortlist">
            {shortlist.map((flight) => (
              <button
                key={flight.flightId}
                className="shortlist-item"
                type="button"
                onClick={() => onSelectFlight(flight.flightId)}
              >
                <span>{flight.flightCode}</span>
                <small>
                  {flight.route} - {formatUtc(flight.stdUtc)}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-note">
            Pin flights from the table to keep a working shortlist for the session.
          </p>
        )}
      </section>
    </aside>
  );
}
