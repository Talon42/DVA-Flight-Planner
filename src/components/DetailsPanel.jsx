import { formatDistanceNm, formatDuration, formatUtc } from "../lib/formatters";
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

function truncateLabel(value, maxLength) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function simplifyAirportName(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/\b(international|regional|municipal|airport|airfield|field|intl)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
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

function SimBriefLink({ href, children }) {
  if (!href) {
    return null;
  }

  return (
    <a
      className="ghost-button simbrief-link-button"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

function SimBriefSummary({ flight }) {
  const simbriefPlan = flight?.simbriefPlan;
  if (!simbriefPlan) {
    return <p className="empty-note">No SimBrief plan has been loaded for this flight yet.</p>;
  }

  return (
    <div className="simbrief-summary">
      <div className="details-grid">
        <DetailRow label="Generated" value={formatUtc(simbriefPlan.generatedAtUtc)} />
        <DetailRow label="Status" value={simbriefPlan.status || "Ready"} />
        <DetailRow label="Type" value={simbriefPlan.aircraftType || "N/A"} />
        <DetailRow label="Callsign" value={simbriefPlan.callsign || "N/A"} />
        <DetailRow label="Route" value={simbriefPlan.route || "Recommended by SimBrief"} />
        <DetailRow label="Cruise" value={simbriefPlan.cruiseAltitude || "N/A"} />
        <DetailRow label="Alternate" value={simbriefPlan.alternate || "N/A"} />
        <DetailRow label="ETE" value={simbriefPlan.ete || "N/A"} />
        <DetailRow label="Block Fuel" value={simbriefPlan.blockFuel || "N/A"} />
        <DetailRow label="Static ID" value={simbriefPlan.staticId || "N/A"} />
      </div>

      <div className="details-actions">
        <SimBriefLink href={simbriefPlan.ofpUrl}>Open OFP</SimBriefLink>
        <SimBriefLink href={simbriefPlan.pdfUrl}>Open PDF</SimBriefLink>
      </div>
    </div>
  );
}

function SimBriefInlinePanel({
  flight,
  simBriefDispatchState,
  simBriefCredentialsConfigured,
  isDesktopSimBriefAvailable,
  onRemoveFromFlightBoard,
  onSimBriefTypeChange,
  onSimBriefDispatch
}) {
  const selectedType = String(flight.simbriefSelectedType || "").trim().toUpperCase();
  const dispatchMessage =
    simBriefDispatchState.flightId === flight.boardEntryId ? simBriefDispatchState.message : "";
  const isDispatching =
    simBriefDispatchState.flightId === flight.boardEntryId && simBriefDispatchState.isDispatching;
  const dispatchDisabled =
    !isDesktopSimBriefAvailable || isDispatching || !selectedType || !simBriefCredentialsConfigured;

  return (
    <div className="simbrief-inline-panel">
      <div className="filter-grid simbrief-controls">
        <label className="filter-block">
          <span>Aircraft Type</span>
          <select
            value={selectedType}
            onChange={(event) => onSimBriefTypeChange(flight.boardEntryId, event.target.value)}
          >
            <option value="">Select a SimBrief profile</option>
            {(flight.compatibleEquipment || []).map((equipment) => (
              <option key={equipment} value={equipment}>
                {equipment}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isDesktopSimBriefAvailable ? (
        <p className="simbrief-status">SimBrief dispatch is available only in the desktop Tauri app.</p>
      ) : null}

      {isDesktopSimBriefAvailable && !simBriefCredentialsConfigured ? (
        <p className="simbrief-status">
          Save a SimBrief Navigraph Alias or Pilot ID in Settings before dispatching.
        </p>
      ) : null}

      {dispatchMessage ? <p className="simbrief-status">{dispatchMessage}</p> : null}

      <div className="details-actions details-actions--board-item">
        <button
          className="primary-button primary-button--board"
          type="button"
          onClick={onSimBriefDispatch}
          disabled={dispatchDisabled}
        >
          {isDispatching ? "Dispatching..." : "SimBrief Dispatch"}
        </button>
        <button className="primary-button primary-button--board" type="button" disabled>
          Push to ACARS
        </button>
        <button
          className="primary-button primary-button--danger"
          type="button"
          onClick={() => onRemoveFromFlightBoard(flight.boardEntryId)}
        >
          Remove from Flight Board
        </button>
      </div>

      <SimBriefSummary flight={flight} />
    </div>
  );
}

function RepairInlinePanel({ flight, onRemoveFromFlightBoard, onRepairFlightBoardEntry }) {
  return (
    <div className="simbrief-inline-panel simbrief-inline-panel--repair">
      <p className="simbrief-status">
        This flight board entry is from a previous schedule and needs repair.
      </p>
      <div className="details-actions details-actions--board-item details-actions--board-item-repair">
        <button
          className="primary-button primary-button--board"
          type="button"
          onClick={() => onRepairFlightBoardEntry(flight.boardEntryId)}
        >
          Repair
        </button>
        <button
          className="primary-button primary-button--danger"
          type="button"
          onClick={() => onRemoveFromFlightBoard(flight.boardEntryId)}
        >
          Remove from Flight Board
        </button>
      </div>
    </div>
  );
}

export default function DetailsPanel({
  shortlist,
  expandedBoardFlightId,
  simBriefDispatchState,
  simBriefCredentialsConfigured,
  isDesktopSimBriefAvailable,
  onToggleBoardFlight,
  onRemoveFromFlightBoard,
  onRepairFlightBoardEntry,
  onSimBriefTypeChange,
  onSimBriefDispatch,
  showFlightBoard = true
}) {
  if (!showFlightBoard) {
    return null;
  }

  return (
    <aside className="details-panel">
      <section className="details-card">
        <div className="details-card__header">
          <p className="eyebrow">Flight Board</p>
        </div>

        {shortlist.length ? (
          <div className="shortlist">
            {shortlist.map((flight) => (
              <div
                key={flight.boardEntryId}
                className={`shortlist-item ${
                  expandedBoardFlightId === flight.boardEntryId ? "shortlist-item--selected" : ""
                } ${flight.isStale ? "shortlist-item--stale" : ""}`}
              >
                <button
                  className="shortlist-item__trigger"
                  type="button"
                  onClick={() => onToggleBoardFlight(flight.boardEntryId)}
                  aria-expanded={expandedBoardFlightId === flight.boardEntryId}
                >
                  <div className="route-banner route-banner--compact">
                    <div className="route-banner__meta">
                      <FlightBoardAirline flight={flight} />
                      <small>{formatUtc(flight.stdUtc)}</small>
                    </div>
                    <div>
                      <span>{flight.from}</span>
                      <small>{truncateLabel(simplifyAirportName(flight.fromAirport), 16)}</small>
                    </div>
                    <div className="route-banner__center" aria-hidden="true">
                      <div className="route-banner__center-top">
                        <span className="route-banner__line" />
                        <span className="route-banner__direction">
                          <img src={planeLight} alt="" className="route-banner__plane" />
                        </span>
                        <span className="route-banner__line" />
                      </div>
                      <div className="route-banner__center-bottom">
                        <small className="route-banner__metric route-banner__metric--left">
                          {formatDistanceNm(flight.distanceNm)}
                        </small>
                        <small className="route-banner__metric route-banner__metric--right">
                          {formatDuration(flight.blockMinutes)}
                        </small>
                      </div>
                    </div>
                    <div>
                      <span>{flight.to}</span>
                      <small>{truncateLabel(simplifyAirportName(flight.toAirport), 16)}</small>
                    </div>
                  </div>
                </button>
                {expandedBoardFlightId === flight.boardEntryId ? (
                  flight.isStale ? (
                    <RepairInlinePanel
                      flight={flight}
                      onRemoveFromFlightBoard={onRemoveFromFlightBoard}
                      onRepairFlightBoardEntry={onRepairFlightBoardEntry}
                    />
                  ) : (
                    <SimBriefInlinePanel
                      flight={flight}
                      simBriefDispatchState={simBriefDispatchState}
                      simBriefCredentialsConfigured={simBriefCredentialsConfigured}
                      isDesktopSimBriefAvailable={isDesktopSimBriefAvailable}
                      onRemoveFromFlightBoard={onRemoveFromFlightBoard}
                      onSimBriefTypeChange={onSimBriefTypeChange}
                      onSimBriefDispatch={onSimBriefDispatch}
                    />
                  )
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-note">Double-click a flight in the table to add it to the Flight Board.</p>
        )}
      </section>
    </aside>
  );
}
