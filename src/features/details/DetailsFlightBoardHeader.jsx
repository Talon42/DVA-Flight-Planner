import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";
import { Eyebrow } from "../../components/ui/SectionHeader";

// Renders the flight board title and tab controls above the shortlist.
export default function DetailsFlightBoardHeader({
  flightBoards,
  activeFlightBoardId,
  onSelectFlightBoard,
  onCreateFlightBoard,
  onRenameFlightBoard,
  onDeleteFlightBoard
}) {
  const activeBoardIndex = Math.max(
    flightBoards.findIndex((board) => board.id === activeFlightBoardId),
    0
  );
  const activeBoard = flightBoards[activeBoardIndex] || null;
  const boardCountLabel = flightBoards.length
    ? `${activeBoardIndex + 1} of ${flightBoards.length}`
    : "0 of 0";
  const hasMultipleBoards = flightBoards.length > 1;
  const canCreateBoard = flightBoards.length < 4;

  function selectAdjacentBoard(delta) {
    if (!flightBoards.length) {
      return;
    }

    const nextIndex = (activeBoardIndex + delta + flightBoards.length) % flightBoards.length;
    onSelectFlightBoard?.(flightBoards[nextIndex].id);
  }

  function openActiveRenameModal() {
    if (activeBoard) {
      onRenameFlightBoard?.(activeBoard);
    }
  }

  function deleteActiveBoard() {
    if (activeBoard) {
      onDeleteFlightBoard?.(activeBoard.id);
    }
  }

  return (
    <div className="details-card__header mb-3">
      <Eyebrow>Flight Board</Eyebrow>
      <div className="mt-2 grid gap-2 border-b border-[color:var(--line)] pb-1">
        <div className="hidden bp-1400:flex items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {flightBoards.slice(0, 4).map((board, index) => {
              const isActive = board.id === activeFlightBoardId;

              if (isActive) {
                return (
                  <button
                    key={board.id}
                    type="button"
                    className={cn(
                      "inline-flex h-10 min-w-0 max-w-[18rem] items-center justify-center rounded-none border-b-2 border-[color:var(--delta-red)] px-6 text-[var(--text-heading)] transition-colors",
                      bodySmTextClassName,
                      "font-medium"
                    )}
                    onClick={() => onSelectFlightBoard?.(board.id)}
                    aria-label={`Select ${board.name}`}
                    aria-current="page"
                    title={board.name}
                  >
                    <span className="min-w-0 truncate">{board.name}</span>
                  </button>
                );
              }

              return (
                <button
                  key={board.id}
                  type="button"
                  className={cn(
                    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-none border border-[color:var(--line)] text-[var(--text-muted)] transition-colors hover:border-[color:var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-heading)]",
                    labelTextClassName,
                    "font-semibold"
                  )}
                  onClick={() => onSelectFlightBoard?.(board.id)}
                  aria-label={`Select ${board.name}`}
                  aria-current={undefined}
                  title={board.name}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="h-6 w-px bg-[color:var(--line)]" />
            <FlightBoardSelectorActions
              activeBoard={activeBoard}
              canCreateBoard={canCreateBoard}
              onCreateFlightBoard={onCreateFlightBoard}
              onRenameFlightBoard={openActiveRenameModal}
              onDeleteFlightBoard={deleteActiveBoard}
            />
          </div>
        </div>

        <div className="grid gap-2 bp-1400:hidden">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <FlightBoardChevronButton
              direction="previous"
              ariaLabel="Previous flight board"
              disabled={!hasMultipleBoards}
              onClick={() => selectAdjacentBoard(-1)}
            />

            <div className="grid min-w-0 justify-items-center">
              {activeBoard ? (
                <FlightBoardTabButton
                  board={activeBoard}
                  onSelectFlightBoard={onSelectFlightBoard}
                  variant="active"
                  align="center"
                  countLabel={boardCountLabel}
                />
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <FlightBoardChevronButton
                direction="next"
                ariaLabel="Next flight board"
                disabled={!hasMultipleBoards}
                onClick={() => selectAdjacentBoard(1)}
              />
              <span aria-hidden="true" className="h-6 w-px bg-[color:var(--line)]" />
              <FlightBoardSelectorActions
                activeBoard={activeBoard}
                canCreateBoard={canCreateBoard}
                onCreateFlightBoard={onCreateFlightBoard}
                onRenameFlightBoard={openActiveRenameModal}
                onDeleteFlightBoard={deleteActiveBoard}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlightBoardChevronButton({ direction, ariaLabel, disabled = false, onClick }) {
  const isPrevious = direction === "previous";

  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-[color:var(--line)] text-[var(--text-muted)] transition-colors hover:border-[color:var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-heading)] disabled:cursor-not-allowed disabled:opacity-45"
      )}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <path
          d={isPrevious ? "M9.5 4.5 6 8l3.5 3.5" : "M6.5 4.5 10 8l-3.5 3.5"}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
      </svg>
    </button>
  );
}

function FlightBoardTabButton({
  board,
  variant = "preview",
  align = "center",
  countLabel = "",
  onSelectFlightBoard
}) {
  const isActive = variant === "active";
  const alignClassName =
    align === "right"
      ? "justify-end text-right"
      : align === "left"
        ? "justify-start text-left"
        : "justify-center text-center";

  return (
    <button
      type="button"
      className={cn(
        "grid min-w-0 rounded-none transition-colors",
        alignClassName,
        isActive
          ? "max-w-[min(18rem,100%)] text-[var(--text-heading)]"
          : "max-w-[min(14rem,100%)] text-[var(--text-muted)] hover:text-[var(--text-heading)]"
      )}
      onClick={() => onSelectFlightBoard?.(board.id)}
      aria-label={`Select ${board.name}`}
      aria-current={isActive ? "page" : undefined}
      title={board.name}
    >
      <span
        className={cn(
          "min-w-0 truncate",
          bodySmTextClassName,
          "font-medium",
          isActive
            ? cn(
                "border-b-2 border-[color:var(--delta-red)] pb-0.5"
              )
            : cn("bp-1400:text-[0.86rem]")
        )}
      >
        {board.name}
      </span>
      {isActive ? (
        <span className="mt-1 text-[0.7rem] font-normal leading-none text-[var(--text-muted)]">
          {countLabel}
        </span>
      ) : null}
    </button>
  );
}

function FlightBoardSelectorActions({
  activeBoard,
  canCreateBoard,
  onCreateFlightBoard,
  onRenameFlightBoard,
  onDeleteFlightBoard
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-heading)] disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={activeBoard ? `Rename ${activeBoard.name}` : "Rename flight board"}
        onClick={onRenameFlightBoard}
        disabled={!activeBoard}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M3 11.75V13h1.25l6.5-6.5-1.25-1.25-6.5 6.5ZM12.2 4.05a.75.75 0 0 0 0-1.06l-.19-.19a.75.75 0 0 0-1.06 0l-.53.53 1.25 1.25.53-.53Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--delta-red)] disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={activeBoard ? `Delete ${activeBoard.name}` : "Delete flight board"}
        onClick={onDeleteFlightBoard}
        disabled={!activeBoard}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M4.5 4.5h7v8.25a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1-.75-.75V4.5Zm2-2h3l.5.75H12v1H4v-1h2l.5-.75Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-heading)] disabled:cursor-not-allowed disabled:opacity-45"
        aria-label="Add flight board"
        onClick={onCreateFlightBoard}
        disabled={!canCreateBoard}
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <path d="M8 3.25v9.5M3.25 8h9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
