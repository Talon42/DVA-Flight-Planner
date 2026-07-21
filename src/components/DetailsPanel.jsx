import { useEffect, useMemo, useRef, useState } from "react";
import Panel from "./ui/Panel";
import DetailsFlightBoardHeader from "../features/details/DetailsFlightBoardHeader.jsx";
import DetailsFlightBoardList from "../features/details/DetailsFlightBoardList.jsx";
import DetailsFlightBoardRenameModal from "../features/details/DetailsFlightBoardRenameModal.jsx";

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
  deltaDraftSubmitState = {
    boardEntryId: "",
    isSubmitting: false,
    error: "",
    result: null
  },
  deltaDraftDeleteState = {
    boardEntryId: "",
    isDeleting: false,
    error: "",
    result: null
  },
  deltaDraftReportUrlState = {
    boardEntryId: "",
    url: ""
  },
  simBriefCredentialsConfigured,
  isDesktopSimBriefAvailable,
  simBriefAircraftTypes,
  simBriefCustomAirframes = [],
  onToggleBoardFlight,
  onRemoveFromFlightBoard,
  onRepairFlightBoardEntry,
  onReorderFlightBoard,
  onSelectFlightBoard,
  onCreateFlightBoard,
  onRenameFlightBoard,
  onDeleteFlightBoard,
  onSimBriefTypeChange,
  onDraftNetworkChange,
  onDispatchWorkflow,
  onRegenerateDispatch,
  onOpenSimBriefFlight = () => {},
  onDraftOnlySubmit = () => {},
  onDeleteDeltaVirtualDraftReport = () => {},
  onCompleteTourFlight,
  showFlightBoard = true,
  isCollapsed = false
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
      } catch {
        // Pointer capture may already be released when the browser cancels a drag.
      }
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
      } catch {
        // Dragging still works when this browser cannot acquire pointer capture.
      }
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

  if (!showFlightBoard || isCollapsed) {
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
        <DetailsFlightBoardHeader
          flightBoards={flightBoards}
          activeFlightBoardId={activeFlightBoardId}
          onSelectFlightBoard={onSelectFlightBoard}
          onCreateFlightBoard={onCreateFlightBoard}
          onRenameFlightBoard={openRenameModal}
          onDeleteFlightBoard={onDeleteFlightBoard}
        />

        <DetailsFlightBoardList
          hasFlights={shortlist.length > 0}
          shortlistRef={shortlistRef}
          visibleShortlist={visibleShortlist}
          placeholderIndex={placeholderIndex}
          placeholderHeight={placeholderHeight}
          draggedBoardEntryId={draggedBoardEntryId}
          dragOverlay={dragOverlay}
          draggedFlight={draggedFlight}
          dragMetrics={dragMetrics}
          expandedBoardFlightId={expandedBoardFlightId}
          selectedAccomplishment={selectedAccomplishment}
          simBriefDispatchState={simBriefDispatchState}
          deltaDraftSubmitState={deltaDraftSubmitState}
          deltaDraftDeleteState={deltaDraftDeleteState}
          deltaDraftReportUrlState={deltaDraftReportUrlState}
          simBriefCredentialsConfigured={simBriefCredentialsConfigured}
          isDesktopSimBriefAvailable={isDesktopSimBriefAvailable}
          simBriefAircraftTypes={simBriefAircraftTypes}
          simBriefCustomAirframes={simBriefCustomAirframes}
          onToggleBoardFlight={onToggleBoardFlight}
          onRemoveFromFlightBoard={onRemoveFromFlightBoard}
          onRepairFlightBoardEntry={onRepairFlightBoardEntry}
          onReorderHandlePointerDown={handleReorderHandlePointerDown}
          onSimBriefTypeChange={onSimBriefTypeChange}
          onDraftNetworkChange={onDraftNetworkChange}
          onDispatchWorkflow={onDispatchWorkflow}
          onRegenerateDispatch={onRegenerateDispatch}
          onOpenSimBriefFlight={onOpenSimBriefFlight}
          onDraftOnlySubmit={onDraftOnlySubmit}
          onDeleteDeltaVirtualDraftReport={onDeleteDeltaVirtualDraftReport}
          onCompleteTourFlight={onCompleteTourFlight}
          setItemRef={setItemRef}
          suppressClickRef={suppressClickRef}
        />
      </Panel>
      <DetailsFlightBoardRenameModal
        isOpen={isRenameModalOpen}
        overlayHost={renameOverlayHost}
        renamingBoard={renamingBoard}
        renameDraft={renameDraft}
        renameInputRef={renameInputRef}
        onRenameDraftChange={setRenameDraft}
        onClose={closeRenameModal}
        onSubmit={handleRenameSubmit}
      />
    </aside>
  );
}

