import {
  formatNumber,
  formatUtc,
} from "../lib/formatters";
import { getAirlineLogo } from "../lib/airlineBranding";
import planeLight from "../data/images/plane_light.png";

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FlightBoardAirline({ flight }) {
  const logoSrc = getAirlineLogo({
    airlineName: flight?.airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });

  return (
    <div className="flight-board-airline">
      {logoSrc ? (
        <img
          className="flight-board-airline__logo"
          src={logoSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <span className="flight-board-airline__code">{flight.flightCode}</span>
    </div>
  );
}

export default function DetailsPanel({
  shortlist,
  onSelectFlight,
  onRemoveFromFlightBoard,
  onOpenLogFile,
  importSummary,
  showImportHealth = true,
  showFlightBoard = true
}) {
  if (!showImportHealth && !showFlightBoard) {
    return null;
  }

  return (
    <aside className="details-panel">
      {showImportHealth ? (
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
              label="No Compatible Equipment"
              value={formatNumber(importSummary?.incompatibleRoutes ?? 0)}
            />
          </div>

          <div className="details-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={onOpenLogFile}
            >
              Open Log File
            </button>
          </div>
        </section>
      ) : null}

      {showFlightBoard ? (
        <section className="details-card">
          <div className="details-card__header">
            <p className="eyebrow">Flight Board</p>
            <h2>{shortlist.length} on board</h2>
          </div>

          {shortlist.length ? (
            <div className="shortlist">
            {shortlist.map((flight) => (
              <button
                key={flight.flightId}
                className="shortlist-item"
                type="button"
                onClick={() => onSelectFlight(flight.flightId)}
                onDoubleClick={() => onRemoveFromFlightBoard(flight.flightId)}
              >
                <div className="route-banner route-banner--compact">
                  <div className="route-banner__meta">
                    <FlightBoardAirline flight={flight} />
                    <small>{formatUtc(flight.stdUtc)}</small>
                  </div>
                  <div>
                    <span>{flight.from}</span>
                    <small>{flight.fromAirport}</small>
                  </div>
                    <span className="route-banner__direction" aria-hidden="true">
                      <img src={planeLight} alt="" className="route-banner__plane" />
                    </span>
                    <div>
                      <span>{flight.to}</span>
                      <small>{flight.toAirport}</small>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty-note">
              Double-click flights in the table to add them to the Flight Board.
            </p>
          )}
        </section>
      ) : null}
    </aside>
  );
}
