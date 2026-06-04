import DetailsFlightBoardCardSummary from "./DetailsFlightBoardCardSummary.jsx";
import DetailsFlightBoardRepairPanel from "./DetailsFlightBoardRepairPanel.jsx";
import SimBriefInlinePanel from "./DetailsSimBriefInlinePanel.jsx";
import { cn } from "../../components/ui/cn";
import { mutedTextClassName } from "../../components/ui/patterns";

// Renders the flight-board list and the active drag overlay without owning drag state.
export default function DetailsFlightBoardList({
  hasFlights,
  shortlistRef,
  visibleShortlist,
  placeholderIndex,
  placeholderHeight,
  draggedBoardEntryId,
  dragOverlay,
  draggedFlight,
  dragMetrics,
  expandedBoardFlightId,
  selectedAccomplishment,
  simBriefDispatchState,
  deltaDraftSubmitState,
  deltaDraftReportUrlState,
  simBriefCredentialsConfigured,
  isDesktopSimBriefAvailable,
  simBriefAircraftTypes,
  simBriefCustomAirframes,
  onToggleBoardFlight,
  onRemoveFromFlightBoard,
  onRepairFlightBoardEntry,
  onReorderHandlePointerDown,
  onSimBriefTypeChange,
  onDraftNetworkChange,
  onDispatchWorkflow,
  onRegenerateDispatch,
  onOpenSimBriefFlight,
  onDraftOnlySubmit,
  onCompleteTourFlight,
  setItemRef,
  suppressClickRef
}) {
  if (!hasFlights) {
    return (
      <p className={mutedTextClassName}>Double-click a flight in the table to add it to the Flight Board.</p>
    );
  }

  return (
    <>
      <div
        className="shortlist app-scrollbar grid min-h-0 gap-3 overflow-x-hidden overflow-y-auto pr-1"
        ref={shortlistRef}
      >
        {visibleShortlist.map((flight, index) => (
          <div key={`slot-${flight.boardEntryId}`} className="grid gap-3">
            {placeholderIndex === index ? (
              <div
                className="rounded-none border border-dashed border-[color:rgba(62,129,191,0.18)] bg-[rgba(62,129,191,0.06)] transition-[height,opacity] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1.12)]"
                style={{ height: `${placeholderHeight}px`, opacity: placeholderHeight > 0 ? 1 : 0.55 }}
                aria-hidden="true"
              />
            ) : null}
            <div
              key={flight.boardEntryId}
              ref={(node) => setItemRef(flight.boardEntryId, node)}
              className={cn(
                "shortlist-item relative grid min-w-0 gap-1.5 rounded-none border-2 border-[rgba(160,180,202,0.52)] bg-[var(--surface-raised)] px-2 py-1.5 text-[var(--text-primary)] transition-[transform,opacity,filter,background] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1.12)] dark:border-[color:var(--surface-border)] bp-1024:gap-1 bp-1024:px-1.5 bp-1024:py-1.25 dark:bg-[var(--surface-raised)]",
                expandedBoardFlightId === flight.boardEntryId && "z-20 bg-[var(--surface-soft)]",
                flight.isStale && "bg-[color:rgba(200,16,46,0.08)]",
                draggedBoardEntryId && "opacity-70 saturate-[0.82]"
              )}
              style={
                dragMetrics?.heights?.[flight.boardEntryId]
                  ? { minHeight: `${dragMetrics.heights[flight.boardEntryId]}px` }
                  : undefined
              }
            >
              <button
                className="shortlist-item__handle absolute left-1/2 top-0 z-10 flex h-4 w-10 -translate-x-1/2 -translate-y-[2px] cursor-grab items-center justify-center rounded-b-[2px] border-x-2 border-b-2 border-[rgba(160,180,202,0.52)] bg-[var(--surface-raised)] text-[var(--text-muted)] opacity-95 shadow-none transition-colors hover:text-[var(--text-heading)] active:cursor-grabbing dark:border-[color:var(--surface-border)] dark:bg-[var(--surface-raised)] dark:text-[var(--route-banner-muted)] dark:hover:text-white"
                type="button"
                aria-label={`Reorder ${flight.flightCode}`}
                onPointerDown={(event) => onReorderHandlePointerDown(flight.boardEntryId, event)}
              >
                <span className="grid gap-0.5">
                  <span className="block h-px w-3 rounded-none bg-current/70" />
                  <span className="block h-px w-3 rounded-none bg-current/70" />
                </span>
              </button>
              <div
                className="shortlist-item__trigger min-w-0"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }

                  onToggleBoardFlight(flight.boardEntryId);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }

                  event.preventDefault();
                  onToggleBoardFlight(flight.boardEntryId);
                }}
                aria-expanded={expandedBoardFlightId === flight.boardEntryId}
              >
                <DetailsFlightBoardCardSummary
                  flight={flight}
                  selectedAccomplishment={selectedAccomplishment}
                />
              </div>
              {expandedBoardFlightId === flight.boardEntryId ? (
                flight.isStale ? (
                  <DetailsFlightBoardRepairPanel
                    flight={flight}
                    onRemoveFromFlightBoard={onRemoveFromFlightBoard}
                    onRepairFlightBoardEntry={onRepairFlightBoardEntry}
                  />
                ) : (
                  <SimBriefInlinePanel
                    flight={flight}
                    simBriefDispatchState={simBriefDispatchState}
                    deltaDraftSubmitState={deltaDraftSubmitState}
                    deltaDraftReportUrlState={deltaDraftReportUrlState}
                    simBriefCredentialsConfigured={simBriefCredentialsConfigured}
                    isDesktopSimBriefAvailable={isDesktopSimBriefAvailable}
                    simBriefAircraftTypes={simBriefAircraftTypes}
                    simBriefCustomAirframes={simBriefCustomAirframes}
                    onRemoveFromFlightBoard={onRemoveFromFlightBoard}
                    onCompleteTourFlight={onCompleteTourFlight}
                    onSimBriefTypeChange={onSimBriefTypeChange}
                    onDraftNetworkChange={onDraftNetworkChange}
                    onDispatchWorkflow={onDispatchWorkflow}
                    onRegenerateDispatch={onRegenerateDispatch}
                    onOpenSimBriefFlight={onOpenSimBriefFlight}
                    onDraftOnlySubmit={onDraftOnlySubmit}
                  />
                )
              ) : null}
            </div>
          </div>
        ))}
        {placeholderIndex === visibleShortlist.length ? (
          <div
            className="rounded-none border border-dashed border-[color:rgba(62,129,191,0.18)] bg-[rgba(62,129,191,0.06)] transition-[height,opacity] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1.12)]"
            style={{ height: `${placeholderHeight}px`, opacity: placeholderHeight > 0 ? 1 : 0.55 }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      {dragOverlay && draggedFlight ? (
        <div
          className="pointer-events-none fixed z-[80] cursor-grabbing"
          style={{
            left: `${dragOverlay.left}px`,
            top: `${dragOverlay.top}px`,
            width: `${dragOverlay.width}px`
          }}
          aria-hidden="true"
        >
          <div className="relative rounded-none border border-[color:transparent] bg-[var(--surface-raised)] px-2 py-1.5 text-[var(--text-primary)] shadow-none ring-0 [transform:scale(1.02)] dark:bg-[var(--surface-raised)] dark:text-white">
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 flex h-5 w-12 -translate-x-1/2 -translate-y-px items-end justify-center rounded-none border-x border-b border-[color:transparent] bg-[var(--surface-soft)] pb-1 text-[var(--text-muted)] opacity-85 dark:bg-[var(--surface-soft)] dark:text-[var(--route-banner-muted)]">
              <span className="grid gap-0.5">
                <span className="block h-0.5 w-4 rounded-none bg-current/80" />
                <span className="block h-0.5 w-4 rounded-none bg-current/80" />
              </span>
            </div>
            <DetailsFlightBoardCardSummary
              flight={draggedFlight}
              selectedAccomplishment={selectedAccomplishment}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
