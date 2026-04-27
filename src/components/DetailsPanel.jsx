import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceNm, formatDuration, formatNumber, formatUtc } from "../lib/formatters";
import { getAirlineLogo } from "../lib/airlineBranding";
import { groupSimBriefAircraftTypesByManufacturer } from "../lib/simbrief";
import planeLight from "../data/images/plane_light.png";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import { SearchableMultiSelect } from "./ui/SearchableSelect";
import {
  fieldInputClassName,
  fieldTitleClassName,
  gridClassNames
} from "./ui/forms";
import {
  modalBackdropClassName,
  modalPanelClassName,
  mutedTextClassName
} from "./ui/patterns";
import { Eyebrow } from "./ui/SectionHeader";
import { cn } from "./ui/cn";
import {
  bodySmTextClassName,
  bodyMdTextClassName,
  labelTextClassName,
  supportCopyTextClassName
} from "./ui/typography";

function DetailRow({ label, value }) {
  return (
    <div className="grid gap-1 rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-4 py-3">
      <span className={cn("text-[var(--text-muted)]", labelTextClassName)}>
        {label}
      </span>
      <strong className={cn("text-[var(--text-heading)]", bodyMdTextClassName, "font-semibold")}>{value}</strong>
    </div>
  );
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

function formatBadgeTitleFromPath(path) {
  const fileName = String(path || "").split("/").pop() || "";
  const stem = fileName.replace(/\.json$/i, "");
  return stem
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

const ROUTE_LINE_CLASS =
  "route-banner__line h-[2px] w-[clamp(2.25rem,72%,5.25rem)] bg-[var(--delta-red)]";

function FlightBoardBadge({ label, title }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-none bg-[var(--delta-red)] px-1.5 text-white",
        labelTextClassName
      )}
      aria-label={title}
      title={title}
    >
      {label}
    </span>
  );
}

function FlightBoardAirline({ flight, selectedAccomplishment }) {
  const logoSrc = getAirlineLogo({
    airlineName: flight?.airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });
  const flightLabel = flight?.isTourFlight
    ? String(flight?.flightCode || flight?.tourFlightNumber || flight?.flightNumber || "").trim()
    : String(flight?.flightCode || "").trim();
  const accomplishmentAirports = Array.isArray(selectedAccomplishment?.airports)
    ? selectedAccomplishment.airports
    : [];
  const accomplishmentRequirement = String(selectedAccomplishment?.requirement || "").trim().toLowerCase();
  const isAccomplishmentFlight =
    Boolean(accomplishmentAirports.length) &&
    (accomplishmentRequirement === "arrival airports"
      ? accomplishmentAirports.includes(String(flight?.to || "").trim().toUpperCase())
      : accomplishmentAirports.some((airport) =>
          [flight?.from, flight?.to].some(
            (side) => String(side || "").trim().toUpperCase() === airport
          )
        ));

  const flightBadges = [];
  if (flight?.isTourFlight) {
    flightBadges.push({
      label: "T",
      title: `Tour: ${formatBadgeTitleFromPath(flight?.tourPath) || "Tour flight"}`
    });
  }

  if (isAccomplishmentFlight) {
    flightBadges.push({
      label: "A",
      title: `Accomplishment: ${String(selectedAccomplishment?.name || "").trim() || "Selected accomplishment"}`
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {logoSrc ? (
        <img
          className="h-6 w-6 shrink-0 object-contain"
          src={logoSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn("truncate text-[var(--text-primary)] dark:text-white", bodyMdTextClassName, "font-semibold")}>
          {flightLabel}
        </span>
        {flightBadges.length ? (
          <span className="flex min-w-0 items-center gap-1">
            {flightBadges.map((badge) => (
              <FlightBoardBadge
                key={`${badge.label}:${badge.title}`}
                label={badge.label}
                title={badge.title}
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SimBriefLink({ href, children }) {
  if (!href) {
    return null;
  }

  return (
    <a
      className={cn("inline-flex min-h-9 items-center justify-center rounded-none border border-transparent bg-[var(--button-ghost-bg)] px-3 py-2 text-[var(--button-ghost-text)] no-underline transition-colors duration-150 hover:bg-[var(--button-ghost-hover-bg)]", bodySmTextClassName, "font-medium")}
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
    return <p className={mutedTextClassName}>No SimBrief plan has been loaded for this flight yet.</p>;
  }

  return (
    <div className="grid gap-4">
      <div className={gridClassNames.detailSummary}>
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

      <div className="flex flex-wrap gap-2">
        <SimBriefLink href={simbriefPlan.ofpUrl}>Open OFP</SimBriefLink>
        <SimBriefLink href={simbriefPlan.pdfUrl}>Open PDF</SimBriefLink>
      </div>
    </div>
  );
}

function ModalBackdrop({ children, onClick }) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-[60] flex min-h-full w-full items-center justify-center overflow-hidden p-4 bp-1024:p-3",
        modalBackdropClassName
      )}
      role="presentation"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function FlightCardAircraftSelector({
  options,
  selectedValue,
  isLoading,
  onChange
}) {
  return (
    <SearchableMultiSelect
      label="SimBrief Aircraft"
      labelPlacement="inline"
      placeholder={isLoading ? "Loading aircraft..." : "Search aircraft"}
      emptyLabel="No matching aircraft"
      allLabel="Select aircraft"
      allowMultiple={false}
      hideChips
      showClearAction={false}
      showOptionMark={false}
      showSingleSelectedLabel
      options={options}
      selectedValues={selectedValue ? [selectedValue] : [""]}
      onChange={(values) => onChange(values[0] || "")}
    />
  );
}

function SimBriefInlinePanel({
  flight,
  simBriefDispatchState,
  simBriefCredentialsConfigured,
  isDesktopSimBriefAvailable,
  simBriefAircraftTypes,
  isSimBriefAircraftTypesLoading,
  simBriefAircraftTypesError,
  onRemoveFromFlightBoard,
  onCompleteTourFlight,
  onSimBriefTypeChange,
  onSimBriefDispatch,
  onOpenSimBriefFlight
}) {
  const selectedType = String(flight.simbriefSelectedType || "").trim().toUpperCase();
  const simBriefStaticId = String(flight?.simbriefPlan?.staticId || "").trim();
  const hasSimBriefPlan = Boolean(simBriefStaticId);
  const availableAircraftTypes = Array.isArray(simBriefAircraftTypes) ? simBriefAircraftTypes : [];
  const aircraftTypeOptions = useMemo(
    () => {
      const groupedTypes = groupSimBriefAircraftTypesByManufacturer(availableAircraftTypes);
      const groupedOptions = groupedTypes.flatMap((group) =>
        group.items.map((type) => ({
          value: String(type.code || "").trim().toUpperCase(),
          label: String(type.name || type.code || "").trim(),
          selectedLabel: String(type.name || type.code || "").trim(),
          groupLabel: group.manufacturer,
          keywords: `${type.code || ""} ${type.name || ""} ${group.manufacturer || ""}`.trim()
        }))
      );

      return groupedOptions;
    },
    [availableAircraftTypes]
  );
  const selectedTypeSupported =
    !selectedType || availableAircraftTypes.some((type) => type.code === selectedType);
  const isDispatching =
    simBriefDispatchState.flightId === flight.boardEntryId && simBriefDispatchState.isDispatching;
  const dispatchDisabled =
    !isDesktopSimBriefAvailable ||
    isDispatching ||
    (!availableAircraftTypes.length && isSimBriefAircraftTypesLoading) ||
    (!availableAircraftTypes.length && Boolean(simBriefAircraftTypesError)) ||
    !selectedType ||
    !selectedTypeSupported ||
    !simBriefCredentialsConfigured;
  const dispatchLabel = isDispatching
    ? hasSimBriefPlan
      ? "Regenerating..."
      : "Dispatching..."
    : hasSimBriefPlan
      ? "Regenerate"
      : "SimBrief Dispatch";
  const actionGridClassName = gridClassNames.boardActionsQuad;

  return (
    <div
      className="grid min-w-0 max-w-full gap-3 rounded-none border border-[color:transparent] bg-[var(--surface-panel)] p-3"
    >
      <FlightCardAircraftSelector
        options={aircraftTypeOptions}
        selectedValue={selectedType}
        isLoading={isSimBriefAircraftTypesLoading}
        onChange={(value) => onSimBriefTypeChange(flight.boardEntryId, value || "")}
      />

      <div className={actionGridClassName}>
        <Button className="min-w-0 w-full" variant="board" size="sm" onClick={onSimBriefDispatch} disabled={dispatchDisabled}>
          {dispatchLabel}
        </Button>
        {hasSimBriefPlan && (
          <Button
            className="min-w-0 w-full"
            variant="board"
            size="sm"
            onClick={() => onOpenSimBriefFlight(simBriefStaticId)}
          >
            Open in Simbrief
          </Button>
        )}
        <Button className="min-w-0 w-full" variant="board" size="sm" disabled>
          Push to ACARS
        </Button>
        <Button
          className="min-w-0 w-full !bg-[#2D8C5A] !text-white hover:!bg-[#25774C] dark:!bg-[#1F7A4D] dark:hover:!bg-[#25945D]"
          variant={flight.isCompleted ? "ghost" : "success"}
          size="sm"
          onClick={() => onCompleteTourFlight(flight.boardEntryId)}
        >
          {flight.isCompleted ? "Click to Revert Status" : "Complete Flight"}
        </Button>
        <Button
          className="min-w-0 w-full"
          variant="danger"
          size="sm"
          onClick={() => onRemoveFromFlightBoard(flight.boardEntryId)}
        >
          Remove from Flight Board
        </Button>
      </div>
    </div>
  );
}

function RepairInlinePanel({ flight, onRemoveFromFlightBoard, onRepairFlightBoardEntry }) {
  return (
    <div className="grid min-w-0 max-w-full gap-3 rounded-none border border-[color:transparent] bg-[var(--surface-panel)] p-3">
      <p className={mutedTextClassName}>
        This flight board entry is from a previous schedule and needs repair.
      </p>
      <div className={gridClassNames.boardActionsDual}>
        <Button className="min-w-0 w-full" variant="board" size="sm" onClick={() => onRepairFlightBoardEntry(flight.boardEntryId)}>
          Repair
        </Button>
        <Button
          className="min-w-0 w-full"
          variant="danger"
          size="sm"
          onClick={() => onRemoveFromFlightBoard(flight.boardEntryId)}
        >
          Remove from Flight Board
        </Button>
      </div>
    </div>
  );
}

// Keeps the flight board selector centered around the active board while preserving the existing callbacks.
function FlightBoardSelectorStrip({
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
    <div className="grid gap-2 border-b border-[color:var(--line)] pb-1">
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

function FlightBoardCardSummary({ flight, selectedAccomplishment = null }) {
  const isCompletedFlight = Boolean(flight?.isCompleted);
  const boardDistanceLabel = flight?.isTourFlight
    ? Number.isFinite(flight?.distanceMi)
      ? `${formatNumber(flight.distanceMi)} mi`
      : "N/A"
    : formatDistanceNm(flight.distanceNm);
  const boardTimeLabel = flight?.isTourFlight
    ? String(flight?.blockTimeLabel || "").trim() || formatDuration(flight.blockMinutes)
    : formatDuration(flight.blockMinutes);
  const boardMetaTimeLabel = flight?.isTourFlight
    ? String(flight?.departureTimeLabel || "").trim() || "N/A"
    : formatUtc(flight.stdUtc);

  return (
    <div
      className={cn(
        "route-banner route-banner--board grid min-w-0 gap-2 rounded-none bg-[var(--route-banner)] px-3 py-2.5 text-[var(--text-primary)] bp-1024:gap-1.5 bp-1024:px-2.5 bp-1024:py-2 dark:text-white",
        isCompletedFlight && "opacity-45"
      )}
    >
      <div className={cn("route-banner__meta flex flex-wrap items-center justify-between gap-2 bp-1024:gap-1.5", bodySmTextClassName)}>
        <FlightBoardAirline flight={flight} selectedAccomplishment={selectedAccomplishment} />
        <small className="text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]">
          {boardMetaTimeLabel}
        </small>
      </div>
      <div className="grid min-w-0 gap-2 bp-1024:gap-1.5">
        <div className="grid min-w-0 grid-cols-[3.7rem_minmax(0,1fr)_3.7rem] items-center gap-2.5 bp-1024:gap-2" aria-hidden="true">
          <span className={cn("text-left text-[1.1rem] font-semibold tracking-[-0.03em]")}>
            {flight.from}
          </span>
          {isCompletedFlight ? (
            <span className="flex min-w-0 items-center justify-center">
              <span className={cn("rounded-none bg-[var(--status-resolved-bg)] px-3 py-1 text-[var(--status-resolved-text)]", labelTextClassName)}>
                Completed
              </span>
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn(ROUTE_LINE_CLASS, "min-w-0 flex-1")} />
              <img
                src={planeLight}
                alt=""
                className="route-banner__plane h-[18px] w-[34px] shrink-0 object-contain brightness-0 opacity-80 dark:brightness-100 dark:opacity-100"
              />
              <span className={cn(ROUTE_LINE_CLASS, "min-w-0 flex-1")} />
            </span>
          )}
          <span className={cn("text-right text-[1.1rem] font-semibold tracking-[-0.03em]")}>
            {flight.to}
          </span>
        </div>
        <div className="grid min-w-0 grid-cols-[3.7rem_minmax(0,1fr)_3.7rem] items-start gap-2.5 bp-1024:gap-2 bp-1400:hidden">
          <span aria-hidden="true" />
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_34px_minmax(0,1fr)] items-start gap-2">
            <small
              className={cn(
                "min-w-0 text-center text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]",
                bodySmTextClassName
              )}
            >
              {boardDistanceLabel}
            </small>
            <span aria-hidden="true" />
            <small
              className={cn(
                "min-w-0 text-center text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]",
                bodySmTextClassName
              )}
            >
              {boardTimeLabel}
            </small>
          </div>
          <span aria-hidden="true" />
        </div>
        <div className="hidden min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 bp-1400:grid">
          <small className={cn("min-w-0 truncate text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]", bodySmTextClassName)}>
            {simplifyAirportName(flight.fromAirport)}
          </small>
          <div className={cn("grid shrink-0 grid-cols-2 items-center gap-4 whitespace-nowrap text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]", bodySmTextClassName)}>
            <small>{boardDistanceLabel}</small>
            <small>{boardTimeLabel}</small>
          </div>
          <small className={cn("min-w-0 truncate text-right text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]", bodySmTextClassName)}>
            {simplifyAirportName(flight.toAirport)}
          </small>
        </div>
      </div>
    </div>
  );
}

function buildPlaceholderIndex(shortlist, dropTarget, draggedBoardEntryId) {
  if (!dropTarget.boardEntryId) {
    return -1;
  }

  const visibleEntries = shortlist.filter((flight) => flight.boardEntryId !== draggedBoardEntryId);
  const targetIndex = visibleEntries.findIndex((flight) => flight.boardEntryId === dropTarget.boardEntryId);
  if (targetIndex === -1) {
    return -1;
  }

  return dropTarget.position === "after" ? targetIndex + 1 : targetIndex;
}

export default function DetailsPanel({
  shortlist,
  flightBoards = [],
  activeFlightBoardId = "",
  expandedBoardFlightId,
  selectedAccomplishment = null,
  simBriefDispatchState,
  simBriefCredentialsConfigured,
  isDesktopSimBriefAvailable,
  simBriefAircraftTypes,
  isSimBriefAircraftTypesLoading,
  simBriefAircraftTypesError,
  onToggleBoardFlight,
  onRemoveFromFlightBoard,
  onRepairFlightBoardEntry,
  onReorderFlightBoard,
  onSelectFlightBoard,
  onCreateFlightBoard,
  onRenameFlightBoard,
  onDeleteFlightBoard,
  onSimBriefTypeChange,
  onSimBriefDispatch,
  onOpenSimBriefFlight = () => {},
  onCompleteTourFlight,
  showFlightBoard = true
}) {
  const panelRef = useRef(null);
  const shortlistRef = useRef(null);
  const renameInputRef = useRef(null);
  const itemRefs = useRef(new Map());
  const pointerDragStateRef = useRef(null);
  const dropTargetRef = useRef({ boardEntryId: "", position: "before" });
  const suppressClickRef = useRef(false);
  const [draggedBoardEntryId, setDraggedBoardEntryId] = useState("");
  const [dropTarget, setDropTarget] = useState({ boardEntryId: "", position: "before" });
  const [dragOverlay, setDragOverlay] = useState(null);
  const [dragMetrics, setDragMetrics] = useState(null);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [renamingBoardId, setRenamingBoardId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");

  const renamingBoard = useMemo(
    () => flightBoards.find((board) => board.id === renamingBoardId) || null,
    [flightBoards, renamingBoardId]
  );
  const isRenameModalOpen = Boolean(renamingBoard);

  useEffect(() => {
    if (!shortlistRef.current) {
      return;
    }

    shortlistRef.current.scrollTop = 0;
  }, [shortlist]);

  useEffect(() => {
    if (!isRenameModalOpen) {
      return undefined;
    }

    renameInputRef.current?.focus();
    renameInputRef.current?.select();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setRenamingBoardId("");
        setRenameDraft("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRenameModalOpen]);

  useEffect(() => {
    dropTargetRef.current = dropTarget;
  }, [dropTarget]);

  function setItemRef(boardEntryId, node) {
    if (!node) {
      itemRefs.current.delete(boardEntryId);
      return;
    }

    itemRefs.current.set(boardEntryId, node);
  }

  function resolveDropTarget(clientY, activeBoardEntryId) {
    const boardEntryIds = shortlist.map((flight) => flight.boardEntryId);
    let fallbackTarget = null;

    for (const boardEntryId of boardEntryIds) {
      if (boardEntryId === activeBoardEntryId) {
        continue;
      }

      const node = itemRefs.current.get(boardEntryId);
      if (!node) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;

      if (clientY < midpoint) {
        return { boardEntryId, position: "before" };
      }

      fallbackTarget = { boardEntryId, position: "after" };
    }

    return fallbackTarget || { boardEntryId: "", position: "before" };
  }

  function handlePointerMove(event) {
    const dragState = pointerDragStateRef.current;
    if (!dragState) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.hasMoved && Math.hypot(deltaX, deltaY) < 4) {
      return;
    }

    if (!dragState.hasMoved) {
      document.body.classList.add("flight-board-reordering");
      setDraggedBoardEntryId(dragState.boardEntryId);
      const sourceNode = itemRefs.current.get(dragState.boardEntryId);
      const sourceRect = sourceNode?.getBoundingClientRect();
      const measuredHeights = Object.fromEntries(
        shortlist.map((flight) => {
          const node = itemRefs.current.get(flight.boardEntryId);
          const rect = node?.getBoundingClientRect();
          return [flight.boardEntryId, rect?.height || 0];
        })
      );

      if (sourceRect) {
        setDragMetrics({
          heights: measuredHeights
        });
        setDragOverlay({
          boardEntryId: dragState.boardEntryId,
          width: sourceRect.width,
          height: sourceRect.height,
          left: sourceRect.left,
          top: sourceRect.top,
          offsetX: event.clientX - sourceRect.left,
          offsetY: event.clientY - sourceRect.top
        });
        setPlaceholderHeight(0);
        window.requestAnimationFrame(() => {
          setPlaceholderHeight(sourceRect.height);
        });
      }
    }

    dragState.hasMoved = true;
    suppressClickRef.current = true;
    setDraggedBoardEntryId(dragState.boardEntryId);
    setDropTarget(resolveDropTarget(event.clientY, dragState.boardEntryId));
    setDragOverlay((current) =>
      current
        ? {
            ...current,
            left: event.clientX - current.offsetX,
            top: event.clientY - current.offsetY
          }
        : current
    );
  }

  function finishPointerDrag(applyReorder) {
    const dragState = pointerDragStateRef.current;
    pointerDragStateRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);
    document.body.classList.remove("flight-board-reordering");

    if (dragState?.handleElement?.releasePointerCapture && dragState.pointerId !== undefined) {
      try {
        dragState.handleElement.releasePointerCapture(dragState.pointerId);
      } catch {}
    }

    const activeDropTarget = dropTargetRef.current;
    const shouldReorder =
      applyReorder &&
      dragState?.hasMoved &&
      activeDropTarget.boardEntryId &&
      activeDropTarget.boardEntryId !== dragState.boardEntryId;

    setDraggedBoardEntryId("");
    setDropTarget({ boardEntryId: "", position: "before" });
    setDragOverlay(null);
    setDragMetrics(null);
    setPlaceholderHeight(0);

    if (shouldReorder) {
      onReorderFlightBoard?.(
        dragState.boardEntryId,
        activeDropTarget.boardEntryId,
        activeDropTarget.position
      );
    }

    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function handlePointerUp() {
    finishPointerDrag(true);
  }

  function handlePointerCancel() {
    finishPointerDrag(false);
  }

  function handleReorderHandlePointerDown(boardEntryId, event) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget?.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
    }
    pointerDragStateRef.current = {
      boardEntryId,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
      pointerId: event.pointerId,
      handleElement: event.currentTarget
    };
    setDropTarget({ boardEntryId: "", position: "before" });
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function openRenameModal(board) {
    setRenamingBoardId(board.id);
    setRenameDraft(String(board.name || "").trim());
  }

  function closeRenameModal() {
    setRenamingBoardId("");
    setRenameDraft("");
  }

  function handleRenameSubmit(event) {
    event.preventDefault();
    if (!renamingBoard) {
      return;
    }
    onRenameFlightBoard?.(renamingBoard.id, renameDraft);
    closeRenameModal();
  }

  if (!showFlightBoard) {
    return null;
  }

  const visibleShortlist = draggedBoardEntryId
    ? shortlist.filter((flight) => flight.boardEntryId !== draggedBoardEntryId)
    : shortlist;
  const renameOverlayHost = panelRef.current;
  const placeholderIndex = buildPlaceholderIndex(shortlist, dropTarget, draggedBoardEntryId);
  const draggedFlight = shortlist.find((flight) => flight.boardEntryId === draggedBoardEntryId) || null;

  return (
    <aside className="details-panel min-w-0 min-h-0">
      <Panel
        ref={panelRef}
        className="details-card relative isolate flex h-full min-h-0 flex-col rounded-none border-2 border-[rgba(160,180,202,0.52)] dark:border-[color:var(--surface-border)] p-4 bp-1024:p-4"
        data-flight-board="true"
        data-menu-bounds
      >
        <div className="details-card__header mb-3">
          <Eyebrow>Flight Board</Eyebrow>
          <div className="mt-2">
            <FlightBoardSelectorStrip
              flightBoards={flightBoards}
              activeFlightBoardId={activeFlightBoardId}
              onSelectFlightBoard={onSelectFlightBoard}
              onCreateFlightBoard={onCreateFlightBoard}
              onRenameFlightBoard={openRenameModal}
              onDeleteFlightBoard={onDeleteFlightBoard}
            />
          </div>
        </div>

        {shortlist.length ? (
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
                    expandedBoardFlightId === flight.boardEntryId &&
                      "z-20 bg-[var(--surface-soft)]",
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
                    onPointerDown={(event) => handleReorderHandlePointerDown(flight.boardEntryId, event)}
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
                    <FlightBoardCardSummary
                      flight={flight}
                      selectedAccomplishment={selectedAccomplishment}
                    />
                  </div>
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
                        simBriefAircraftTypes={simBriefAircraftTypes}
                        isSimBriefAircraftTypesLoading={isSimBriefAircraftTypesLoading}
                        simBriefAircraftTypesError={simBriefAircraftTypesError}
                        onRemoveFromFlightBoard={onRemoveFromFlightBoard}
                        onCompleteTourFlight={onCompleteTourFlight}
                        onSimBriefTypeChange={onSimBriefTypeChange}
                        onSimBriefDispatch={onSimBriefDispatch}
                        onOpenSimBriefFlight={onOpenSimBriefFlight}
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
        ) : (
          <p className={mutedTextClassName}>Double-click a flight in the table to add it to the Flight Board.</p>
        )}

      </Panel>
      {isRenameModalOpen && renameOverlayHost
        ? createPortal(
            <ModalBackdrop onClick={closeRenameModal}>
              <Panel
                className={cn(
                  modalPanelClassName,
                  "relative z-[61] w-[min(520px,calc(100%-2rem))] p-5 bp-1024:w-[min(500px,calc(100%-1.5rem))] bp-1024:p-4"
                )}
                role="dialog"
                aria-modal="true"
                aria-label="Rename flight board"
                onClick={(event) => event.stopPropagation()}
              >
                <form className="grid gap-4" onSubmit={handleRenameSubmit}>
                  <div className="min-w-0">
                    <div className={fieldTitleClassName}>Rename flight board</div>
                    <p className={cn("m-0 text-[var(--text-muted)]", supportCopyTextClassName)}>
                      Update the tab name shown in the flight board card.
                    </p>
                  </div>
                  <input
                    ref={renameInputRef}
                    className={fieldInputClassName}
                    type="text"
                    value={renameDraft}
                    maxLength={40}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    placeholder="Board name"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={closeRenameModal} type="button">
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" type="submit">
                      Save
                    </Button>
                  </div>
                </form>
              </Panel>
            </ModalBackdrop>,
            renameOverlayHost
          )
        : null}
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
            <FlightBoardCardSummary
              flight={draggedFlight}
              selectedAccomplishment={selectedAccomplishment}
            />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

