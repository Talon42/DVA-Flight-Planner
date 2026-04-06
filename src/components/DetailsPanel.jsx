import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceNm, formatDuration, formatUtc } from "../lib/formatters";
import { getAirlineLogo } from "../lib/airlineBranding";
import { groupSimBriefAircraftTypesByManufacturer } from "../lib/simbrief";
import planeLight from "../data/images/plane_light.png";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import {
  fieldBodyClassName,
  fieldInputClassName,
  fieldTitleClassName,
  gridClassNames
} from "./ui/forms";
import { modalPanelClassName, mutedTextClassName } from "./ui/patterns";
import { Eyebrow } from "./ui/SectionHeader";
import { cn } from "./ui/cn";

function DetailRow({ label, value }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-[color:var(--line)] bg-[var(--input-bg)] px-4 py-3">
      <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </span>
      <strong className="text-[0.88rem] font-semibold text-[var(--text-heading)]">{value}</strong>
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

const ROUTE_LINE_CLASS =
  "route-banner__line h-px w-[clamp(2.25rem,72%,5.25rem)] bg-[var(--delta-red)]";

function FlightBoardAirline({ flight }) {
  const logoSrc = getAirlineLogo({
    airlineName: flight?.airlineName,
    airlineIata: flight?.airline,
    airlineIcao: flight?.airlineIcao
  });

  return (
    <div className="flex min-w-0 items-center gap-2">
      {logoSrc ? (
        <img
          className="h-4 w-4 shrink-0 object-contain"
          src={logoSrc}
          alt=""
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate text-[0.84rem] font-semibold text-[var(--text-primary)] dark:text-white">
        {flight.flightCode}
      </span>
    </div>
  );
}

function SimBriefLink({ href, children }) {
  if (!href) {
    return null;
  }

  return (
    <a
      className="inline-flex min-h-9 items-center justify-center rounded-[14px] border border-[color:var(--button-ghost-border)] bg-[var(--button-ghost-bg)] px-3 py-2 text-[0.78rem] font-semibold text-[var(--button-ghost-text)] no-underline transition-colors duration-150 hover:border-[color:var(--button-ghost-hover-border)] hover:bg-[var(--button-ghost-hover-bg)]"
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
      className="absolute inset-0 z-[60] flex min-h-full w-full items-center justify-center overflow-hidden bg-[rgba(8,20,36,0.42)] p-4 backdrop-blur-md bp-1024:p-3"
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
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === selectedValue) || null,
    [options, selectedValue]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const haystack = `${option.label || ""} ${option.value || ""} ${option.keywords || ""}`.toUpperCase();
      return haystack.includes(normalizedQuery);
    });
  }, [options, query]);

  const selectionLabel = selectedOption?.selectedLabel || selectedOption?.label || "Select aircraft";
  const overlayHost =
    typeof document !== "undefined"
      ? rootRef.current?.closest('[data-docshot="flight-board"]') || null
      : null;

  return (
    <div className="grid gap-3" ref={rootRef}>
      <div className="grid grid-cols-[minmax(110px,max-content)_minmax(0,1fr)] items-center gap-3">
        <span className={fieldTitleClassName}>SIMBRIEF AIRCRAFT</span>
        <button
          className={cn(
            fieldBodyClassName,
            "flex w-full items-center justify-between gap-3 px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-left"
          )}
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="block min-w-0 truncate">{selectionLabel}</span>
          <span
            className={cn(
              "shrink-0 text-[var(--text-muted)] transition-transform duration-150",
              isOpen && "rotate-180"
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
        </button>
      </div>

      {isOpen && overlayHost
        ? createPortal(
            <ModalBackdrop onClick={() => setIsOpen(false)}>
              <Panel
                className={cn(
                  modalPanelClassName,
                  "relative z-[61] w-[min(640px,calc(100%-2rem))] p-5 bp-1024:w-[min(560px,calc(100%-1.5rem))] bp-1024:p-4"
                )}
                role="dialog"
                aria-modal="true"
                aria-label="Select SimBrief aircraft"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className={fieldTitleClassName}>SimBrief aircraft</div>
                    <p className="m-0 text-[0.88rem] text-[var(--text-muted)]">
                      Search and apply one aircraft type to this flight card.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setIsOpen(false)}
                  >
                    Close
                  </Button>
                </div>

                <input
                  className={fieldInputClassName}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={isLoading ? "Loading aircraft..." : "Search aircraft"}
                  autoFocus
                />

                <div className="app-scrollbar grid max-h-[min(58vh,460px)] gap-1 overflow-y-auto pr-1">
                  {filteredOptions.map((option, index) => {
                    const previousOption = index > 0 ? filteredOptions[index - 1] : null;
                    const showGroupLabel =
                      option.groupLabel && option.groupLabel !== previousOption?.groupLabel;
                    const isSelected = option.value === selectedValue;

                    return (
                      <Fragment key={option.value}>
                        {showGroupLabel ? (
                          <div className="px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            {option.groupLabel}
                          </div>
                        ) : null}
                        <button
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-2xl border border-transparent px-3 py-2 text-left text-[0.82rem] font-semibold text-[var(--text-primary)] transition-colors duration-150 hover:border-[color:var(--button-ghost-hover-border)] hover:bg-[var(--surface-option)]",
                            isSelected &&
                              "border-[color:rgba(62,129,191,0.36)] bg-[var(--surface-option-selected)] text-[var(--text-heading)]"
                          )}
                          type="button"
                          onClick={() => {
                            onChange(option.value);
                            setIsOpen(false);
                            setQuery("");
                          }}
                        >
                          <span className="min-w-0 truncate">{option.label}</span>
                          <span className="shrink-0 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                            {isSelected ? "Selected" : "Add"}
                          </span>
                        </button>
                      </Fragment>
                    );
                  })}

                  {!filteredOptions.length ? (
                    <div className="rounded-2xl bg-[var(--surface-option)] px-3 py-4 text-center text-[0.78rem] font-semibold text-[var(--text-muted)]">
                      No matching aircraft
                    </div>
                  ) : null}
                </div>
              </Panel>
            </ModalBackdrop>,
            overlayHost
          )
        : null}
    </div>
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
  onSimBriefTypeChange,
  onSimBriefDispatch
}) {
  const selectedType = String(flight.simbriefSelectedType || "").trim().toUpperCase();
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

  return (
    <div
      className="grid min-w-0 max-w-full gap-3 rounded-[18px] border border-[color:var(--line)] bg-[var(--surface-panel)] p-3"
      data-docshot="simbrief-dispatch-panel"
    >
      <FlightCardAircraftSelector
        options={aircraftTypeOptions}
        selectedValue={selectedType}
        isLoading={isSimBriefAircraftTypesLoading}
        onChange={(value) => onSimBriefTypeChange(flight.boardEntryId, value || "")}
      />

      <div className="grid min-w-0 gap-2 min-[1401px]:grid-cols-3">
        <Button className="min-w-0 w-full" variant="board" size="sm" onClick={onSimBriefDispatch} disabled={dispatchDisabled}>
          {isDispatching ? "Dispatching..." : "SimBrief Dispatch"}
        </Button>
        <Button className="min-w-0 w-full" variant="board" size="sm" disabled>
          Push to ACARS
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
    <div className="grid min-w-0 max-w-full gap-3 rounded-[18px] border border-[color:var(--line)] bg-[var(--surface-panel)] p-3">
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

function FlightBoardCardSummary({ flight }) {
  return (
    <div className="route-banner route-banner--board grid min-w-0 gap-2 rounded-[18px] bg-[var(--route-banner)] px-3 py-2.5 text-[var(--text-primary)] bp-1024:gap-1.5 bp-1024:px-2.5 bp-1024:py-2 dark:text-white">
      <div className="route-banner__meta flex flex-wrap items-center justify-between gap-2 text-[0.78rem] bp-1024:gap-1.5">
        <FlightBoardAirline flight={flight} />
        <small className="text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]">
          {formatUtc(flight.stdUtc)}
        </small>
      </div>
      <div className="grid min-w-0 gap-2 bp-1024:gap-1.5">
        <div className="grid min-w-0 grid-cols-[3.7rem_minmax(0,1fr)_3.7rem] items-center gap-2.5 bp-1024:gap-2" aria-hidden="true">
          <span className="text-left text-[1.1rem] font-semibold tracking-[-0.04em]">
            {flight.from}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn(ROUTE_LINE_CLASS, "min-w-0 flex-1")} />
            <img
              src={planeLight}
              alt=""
              className="route-banner__plane h-[18px] w-[34px] shrink-0 object-contain brightness-0 opacity-80 dark:brightness-100 dark:opacity-100"
            />
            <span className={cn(ROUTE_LINE_CLASS, "min-w-0 flex-1")} />
          </span>
          <span className="text-right text-[1.1rem] font-semibold tracking-[-0.04em]">
            {flight.to}
          </span>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 bp-1024:gap-2">
          <small className="min-w-0 truncate text-[0.82rem] text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]">
            {simplifyAirportName(flight.fromAirport)}
          </small>
          <div className="grid shrink-0 grid-cols-2 items-center gap-4 whitespace-nowrap text-[0.82rem] text-[var(--text-muted)] bp-1024:gap-3 dark:text-[var(--route-banner-muted)]">
            <small>{formatDistanceNm(flight.distanceNm)}</small>
            <small>{formatDuration(flight.blockMinutes)}</small>
          </div>
          <small className="min-w-0 truncate text-right text-[0.82rem] text-[var(--text-muted)] dark:text-[var(--route-banner-muted)]">
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
  const canCreateBoard = flightBoards.length < 4;
  const canDeleteBoard = flightBoards.length > 1;
  const renameOverlayHost = panelRef.current;
  const placeholderIndex = buildPlaceholderIndex(shortlist, dropTarget, draggedBoardEntryId);
  const draggedFlight = shortlist.find((flight) => flight.boardEntryId === draggedBoardEntryId) || null;

  return (
    <aside className="details-panel min-w-0 min-h-0">
      <Panel
        ref={panelRef}
        className="details-card relative isolate flex h-full min-h-0 flex-col rounded-[26px] p-4 bp-1024:rounded-[20px] bp-1024:p-4"
        data-docshot="flight-board"
        data-menu-bounds
      >
        <div className="details-card__header mb-3">
          <Eyebrow>Flight Board</Eyebrow>
          <div className="app-scrollbar mt-2 min-w-0 overflow-x-auto overflow-y-hidden pb-1">
            <div className="inline-flex min-w-full items-center gap-1.5 whitespace-nowrap border-b border-[color:var(--line)] pb-1">
              {flightBoards.map((board) => {
                const isActive = board.id === activeFlightBoardId;
                return (
                  <div
                    key={board.id}
                    className={cn(
                      "grid min-w-[12rem] max-w-[16rem] flex-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 border-b-2 pb-1",
                      isActive
                        ? "border-[var(--delta-red)]"
                        : "border-transparent"
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "min-w-0 w-full rounded-md px-2 py-0.5 text-[0.78rem] font-semibold whitespace-nowrap transition-colors",
                        isActive
                          ? "text-[var(--text-heading)] dark:text-white"
                          : "text-[var(--text-primary)] hover:text-[var(--text-heading)] dark:text-[var(--text-primary)] dark:hover:text-white"
                      )}
                      onClick={() => onSelectFlightBoard?.(board.id)}
                    >
                      <span
                        className={cn(
                          "block min-w-0 truncate"
                        )}
                        title={board.name}
                      >
                        {board.name}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--text-heading)]"
                      aria-label={`Rename ${board.name}`}
                      onClick={() => openRenameModal(board)}
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
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--delta-red)] disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label={`Delete ${board.name}`}
                      onClick={() => onDeleteFlightBoard?.(board.id)}
                      disabled={!canDeleteBoard}
                    >
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                        <path
                          d="M4.5 4.5h7v8.25a.75.75 0 0 1-.75.75h-5.5a.75.75 0 0 1-.75-.75V4.5Zm2-2h3l.5.75H12v1H4v-1h2l.5-.75Z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="inline-flex h-7 w-7 flex-none shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--text-muted)] transition-colors hover:border-[color:var(--line)] hover:text-[var(--text-heading)] disabled:cursor-not-allowed disabled:opacity-45"
                aria-label="Add flight board"
                onClick={() => onCreateFlightBoard?.()}
                disabled={!canCreateBoard}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                  <path d="M8 3.25v9.5M3.25 8h9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
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
                    className="rounded-[20px] border border-dashed border-[color:rgba(62,129,191,0.34)] bg-[rgba(62,129,191,0.08)] transition-[height,opacity] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1.12)]"
                    style={{ height: `${placeholderHeight}px`, opacity: placeholderHeight > 0 ? 1 : 0.55 }}
                    aria-hidden="true"
                  />
                ) : null}
                <div
                  key={flight.boardEntryId}
                  ref={(node) => setItemRef(flight.boardEntryId, node)}
                  className={cn(
                    "shortlist-item relative grid min-w-0 gap-1.5 rounded-[22px] border border-[color:var(--text-muted)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface-raised)_78%,white_22%),color-mix(in_srgb,var(--surface)_82%,var(--delta-blue)_8%))] px-2 py-1.5 text-[var(--text-primary)] transition-[transform,opacity,filter,border-color,background] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1.12)] bp-1024:gap-1 bp-1024:px-1.5 bp-1024:py-1.25 dark:border-[color:var(--line-strong)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--delta-blue-deep)_68%,var(--surface-raised)_32%),color-mix(in_srgb,var(--delta-blue)_30%,var(--surface)_70%))]",
                    expandedBoardFlightId === flight.boardEntryId &&
                      "z-20 border-[color:rgba(62,129,191,0.4)] shadow-[0_14px_30px_rgba(0,58,112,0.14)]",
                    flight.isStale && "border-[color:rgba(200,16,46,0.26)]",
                    draggedBoardEntryId && "opacity-70 saturate-[0.82]"
                  )}
                  style={
                    dragMetrics?.heights?.[flight.boardEntryId]
                      ? { minHeight: `${dragMetrics.heights[flight.boardEntryId]}px` }
                      : undefined
                  }
                >
                  <button
                    className="shortlist-item__handle absolute left-1/2 top-0 z-10 flex h-5 w-12 -translate-x-1/2 -translate-y-px cursor-grab items-end justify-center rounded-b-[14px] border-x border-b border-[color:var(--text-muted)] bg-[color-mix(in_srgb,var(--surface-raised)_84%,white_16%)] pb-1 text-[var(--text-muted)] opacity-85 shadow-none hover:text-[var(--text-heading)] active:cursor-grabbing dark:border-[color:var(--line-strong)] dark:bg-[color-mix(in_srgb,var(--delta-blue-deep)_74%,var(--surface)_26%)] dark:text-[var(--route-banner-muted)] dark:hover:text-white"
                    type="button"
                    aria-label={`Reorder ${flight.flightCode}`}
                    onPointerDown={(event) => handleReorderHandlePointerDown(flight.boardEntryId, event)}
                  >
                    <span className="grid gap-0.5">
                      <span className="block h-0.5 w-4 rounded-full bg-current/75" />
                      <span className="block h-0.5 w-4 rounded-full bg-current/75" />
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
                    <FlightBoardCardSummary flight={flight} />
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
                        onSimBriefTypeChange={onSimBriefTypeChange}
                        onSimBriefDispatch={onSimBriefDispatch}
                      />
                    )
                  ) : null}
                </div>
              </div>
            ))}
            {placeholderIndex === visibleShortlist.length ? (
              <div
                className="rounded-[20px] border border-dashed border-[color:rgba(62,129,191,0.34)] bg-[rgba(62,129,191,0.08)] transition-[height,opacity] duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1.12)]"
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
                    <p className="m-0 text-[0.88rem] text-[var(--text-muted)]">
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
          <div className="relative rounded-[22px] border border-[color:var(--text-muted)] bg-[color:rgba(236,243,250,0.98)] px-2 py-1.5 text-[var(--text-primary)] shadow-[0_28px_60px_rgba(10,24,43,0.28)] ring-1 ring-[rgba(255,255,255,0.08)] [transform:scale(1.02)] dark:border-[color:var(--line-strong)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--delta-blue-deep)_68%,var(--surface-raised)_32%),color-mix(in_srgb,var(--delta-blue)_30%,var(--surface)_70%))] dark:text-white">
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 flex h-5 w-12 -translate-x-1/2 -translate-y-px items-end justify-center rounded-b-[14px] border-x border-b border-[color:var(--text-muted)] bg-[color:rgba(236,243,250,0.98)] pb-1 text-[var(--text-muted)] opacity-85 dark:border-[color:var(--line-strong)] dark:bg-[color-mix(in_srgb,var(--delta-blue-deep)_74%,var(--surface)_26%)] dark:text-[var(--route-banner-muted)]">
              <span className="grid gap-0.5">
                <span className="block h-0.5 w-4 rounded-full bg-current/80" />
                <span className="block h-0.5 w-4 rounded-full bg-current/80" />
              </span>
            </div>
            <FlightBoardCardSummary flight={draggedFlight} />
          </div>
        </div>
      ) : null}
    </aside>
  );
}

