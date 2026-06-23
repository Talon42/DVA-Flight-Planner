import { useEffect, useMemo } from "react";
import { buildTourFlightLookupKey } from "../tours/tourIds.model.js";
import { logAppEvent } from "../../services/logging/appLog.client.js";
import {
  DEFAULT_FLIGHT_BOARD_NAME,
  MAX_FLIGHT_BOARDS,
  buildBoardEntryFromFlight,
  buildBoardEntryFromTourFlight,
  createFlightBoard,
  normalizeBoardEntry,
  normalizeFlightBoardName
} from "./flightBoard.model.js";

// Rebuilds stale board entries against the live schedule so repair actions can stay targeted.
function repairBoardEntryAgainstSchedule(entry, flights = []) {
  const normalizedEntry = normalizeBoardEntry(entry);
  if (!normalizedEntry) {
    return null;
  }

  const matches = flights.filter(
    (flight) =>
      String(flight.airline || "").trim() === normalizedEntry.airline &&
      String(flight.from || "").trim().toUpperCase() === normalizedEntry.from &&
      String(flight.to || "").trim().toUpperCase() === normalizedEntry.to
  );

  if (!matches.length) {
    return null;
  }

  const currentDepartureMillis = Number(normalizedEntry.stdUtcMillis) || 0;
  const repairedFlight = [...matches].sort((left, right) => {
    const leftDelta = Math.abs((Number(left.stdUtcMillis) || 0) - currentDepartureMillis);
    const rightDelta = Math.abs((Number(right.stdUtcMillis) || 0) - currentDepartureMillis);
    return leftDelta - rightDelta || left.flightId.localeCompare(right.flightId);
  })[0];

  return buildBoardEntryFromFlight(repairedFlight, {
    boardEntryId: normalizedEntry.boardEntryId,
    selectedAircraft: normalizedEntry.selectedAircraft,
    simbriefPlan: null,
    draftNetwork: normalizedEntry.draftNetwork,
    draftReportId: normalizedEntry.draftReportId,
    draftDeleteRequiresRegenerate: normalizedEntry.draftDeleteRequiresRegenerate,
    isStale: false
  });
}

// Owns the active flight-board derivations and mutations without pulling SimBrief workflow logic in with it.
export function useFlightBoards({
  activeFlightBoardId = "",
  activeTourRows = [],
  clearSimBriefDispatchStateRef = null,
  expandedBoardFlightId = null,
  flightBoards = [],
  isDevToolsEnabled = false,
  isScheduleCurrent = true,
  schedule = null,
  scheduleView = "flights",
  onOpenStaleScheduleBlocked = null,
  setActiveFlightBoardId,
  setExpandedBoardFlightId,
  setFlightBoards,
  setStatusMessage,
  setTourProgress,
  simBriefDispatchStateRef = null,
  tourFlightsByKey = new Map()
} = {}) {
  const activeFlightBoard = useMemo(() => {
    if (!flightBoards.length) {
      return null;
    }

    return (
      flightBoards.find((board) => board.id === activeFlightBoardId) ||
      flightBoards[0] ||
      null
    );
  }, [activeFlightBoardId, flightBoards]);
  const flightBoard = activeFlightBoard?.entries || [];

  const shortlist = useMemo(
    () =>
      flightBoard.map((entry) => {
        if (!entry?.isTourFlight) {
          return entry;
        }

        const sourceFlight = tourFlightsByKey.get(
          buildTourFlightLookupKey(entry.tourPath, entry.tourRowId)
        );
        if (!sourceFlight) {
          return entry;
        }

        return buildBoardEntryFromTourFlight(sourceFlight, {
          boardEntryId: entry.boardEntryId,
          selectedAircraft: entry.selectedAircraft,
          simbriefPlan: entry.simbriefPlan,
          draftNetwork: entry.draftNetwork,
          draftReportId: entry.draftReportId,
          isCompleted: sourceFlight.isCompleted,
          completionOrder: sourceFlight.completionOrder
        });
      }),
    [flightBoard, tourFlightsByKey]
  );
  const selectedShortlistFlight =
    shortlist.find((flight) => flight.boardEntryId === expandedBoardFlightId) || null;

  useEffect(() => {
    if (!flightBoards.length) {
      return;
    }

    if (!activeFlightBoardId || !flightBoards.some((board) => board.id === activeFlightBoardId)) {
      setActiveFlightBoardId?.(flightBoards[0].id);
    }
  }, [activeFlightBoardId, flightBoards, setActiveFlightBoardId]);

  useEffect(() => {
    if (
      !expandedBoardFlightId ||
      flightBoard.some((entry) => entry.boardEntryId === expandedBoardFlightId)
    ) {
      return;
    }

    setExpandedBoardFlightId?.(null);
  }, [expandedBoardFlightId, flightBoard, setExpandedBoardFlightId]);

  function clearSimBriefDispatchState() {
    clearSimBriefDispatchStateRef?.current?.();
  }

  function updateActiveFlightBoardEntries(nextEntriesOrUpdater) {
    let resolvedEntries = null;
    setFlightBoards((current) => {
      const activeId =
        activeFlightBoardId && current.some((board) => board.id === activeFlightBoardId)
          ? activeFlightBoardId
          : current[0]?.id;

      if (!activeId) {
        const fallbackBoard = createFlightBoard(DEFAULT_FLIGHT_BOARD_NAME, []);
        resolvedEntries = [];
        return [fallbackBoard];
      }

      return current.map((board) => {
        if (board.id !== activeId) {
          return board;
        }

        const nextEntries =
          typeof nextEntriesOrUpdater === "function"
            ? nextEntriesOrUpdater(board.entries || [])
            : nextEntriesOrUpdater;
        resolvedEntries = Array.isArray(nextEntries) ? nextEntries : [];
        return {
          ...board,
          entries: resolvedEntries
        };
      });
    });
    return resolvedEntries;
  }

  function replaceFlightBoard(flightIds, boardName = DEFAULT_FLIGHT_BOARD_NAME, options = {}) {
    // Build one lookup map so replacement stays linear even for large schedules.
    const flightsById = new Map((schedule?.flights || []).map((flight) => [flight.flightId, flight]));
    const selectedFlights = flightIds.map((flightId) => flightsById.get(flightId)).filter(Boolean);
    const nextFlightBoard = selectedFlights.map((flight) => buildBoardEntryFromFlight(flight));
    const targetBoardId = String(options.targetBoardId || "").trim();
    const targetBoardExists = targetBoardId
      ? flightBoards.some((board) => board.id === targetBoardId)
      : false;

    if (targetBoardId) {
      if (!targetBoardExists) {
        return "";
      }

      setFlightBoards((current) =>
        current.map((board) =>
          board.id === targetBoardId
            ? {
                ...board,
                name: normalizeFlightBoardName(boardName, board.name),
                entries: nextFlightBoard
              }
            : board
        )
      );
      setActiveFlightBoardId?.(targetBoardId);
      setExpandedBoardFlightId?.(null);
      clearSimBriefDispatchState();
      return targetBoardId;
    }

    if (flightBoards.length >= MAX_FLIGHT_BOARDS) {
      return "";
    }

    const nextBoard = createFlightBoard(boardName, nextFlightBoard);
    setFlightBoards((current) => [...current, nextBoard]);
    setActiveFlightBoardId?.(nextBoard.id);
    setExpandedBoardFlightId?.(null);
    clearSimBriefDispatchState();
    return nextBoard.id;
  }

  function handleToggleBoardFlight(boardEntryId) {
    setExpandedBoardFlightId?.((current) => (current === boardEntryId ? null : boardEntryId));
  }

  function handleAddToFlightBoard(flightId, clickedRow = null) {
    if (!isScheduleCurrent) {
      // Block new board entries until the active schedule has been refreshed.
      onOpenStaleScheduleBlocked?.();
      return false;
    }

    if (scheduleView === "tours") {
      const normalizedFlightId = String(flightId || "").trim();
      const matchedTourFlight =
        clickedRow?.isTourFlight === true
          ? clickedRow
          : activeTourRows.find(
              (flight) =>
                flight.tourRowId === normalizedFlightId ||
                flight.flightId === normalizedFlightId ||
                flight.linkedFlightId === normalizedFlightId
            );
      if (!matchedTourFlight) {
        return;
      }

      // Keep DVA-synced completed tour legs off the board while allowing manually
      // completed legs to be re-added when the user explicitly toggled them.
      if (
        matchedTourFlight.isCompleted &&
        String(matchedTourFlight.completionSource || "").trim().toLowerCase() ===
          "deltava-logbook"
      ) {
        return false;
      }

      const nextBoardEntry = buildBoardEntryFromTourFlight(matchedTourFlight);
      const nextTourBoardName = normalizeFlightBoardName(
        matchedTourFlight?.tourLabel || matchedTourFlight?.tourName || matchedTourFlight?.route || "",
        DEFAULT_FLIGHT_BOARD_NAME
      );
      if (isDevToolsEnabled) {
        logAppEvent("tour-row-add-requested", {
          clickedTourRowId: String(flightId || "").trim(),
          clickedTourPath: String(clickedRow?.tourPath || "").trim(),
          clickedTourRoute: String(matchedTourFlight?.route || "").trim(),
          clickedTourFlight: String(
            matchedTourFlight?.flightCode || matchedTourFlight?.flightNumber || ""
          ).trim(),
          clickedTourLeg: Number.isFinite(matchedTourFlight?.tourLeg)
            ? matchedTourFlight.tourLeg
            : Number.isFinite(matchedTourFlight?.leg)
              ? matchedTourFlight.leg
              : null
        }).catch(() => {});
      }

      let didAddTourRow = false;
      setFlightBoards((current) => {
        const activeId =
          activeFlightBoardId && current.some((board) => board.id === activeFlightBoardId)
            ? activeFlightBoardId
            : current[0]?.id;

        if (!activeId) {
          return current;
        }

        return current.map((board) => {
          if (board.id !== activeId) {
            return board;
          }

          const currentEntries = Array.isArray(board.entries) ? board.entries : [];
          if (
            currentEntries.some(
              (entry) =>
                entry.isTourFlight &&
                String(entry.tourPath || "").trim() ===
                  String(nextBoardEntry.tourPath || "").trim() &&
                String(entry.tourRowId || "").trim() ===
                  String(nextBoardEntry.tourRowId || "").trim()
            )
          ) {
            return board;
          }

          didAddTourRow = true;
          return {
            ...board,
            name: currentEntries.length === 0 ? nextTourBoardName : board.name,
            entries: [...currentEntries, nextBoardEntry]
          };
        });
      });
      if (didAddTourRow && isDevToolsEnabled) {
        logAppEvent("tour-row-added-to-board", {
          boardEntryId: nextBoardEntry.boardEntryId,
          tourRowId: nextBoardEntry.tourRowId,
          route: nextBoardEntry.route,
          flightCode: nextBoardEntry.flightCode,
          flightNumber: nextBoardEntry.flightNumber,
          airline: nextBoardEntry.airline,
          airlineName: nextBoardEntry.airlineName,
          from: nextBoardEntry.from,
          to: nextBoardEntry.to
        }).catch(() => {});
      }

      if (!didAddTourRow) {
        return false;
      }

      return true;
    }

    const matchedFlight = schedule?.flights.find((flight) => flight.flightId === flightId);
    if (!matchedFlight) {
      return false;
    }

    let didAddFlightRow = false;
    updateActiveFlightBoardEntries((current) => {
      if (current.some((entry) => entry.linkedFlightId === flightId)) {
        return current;
      }

      didAddFlightRow = true;
      return [...current, buildBoardEntryFromFlight(matchedFlight)];
    });

    return didAddFlightRow;
  }

  function handleCompleteTourFlight(boardEntryId) {
    const entry = flightBoard.find((item) => item.boardEntryId === boardEntryId);
    if (!entry) {
      return;
    }

    const isCurrentlyCompleted = Boolean(entry.isCompleted);
    let nextCompletionOrder = null;

    updateActiveFlightBoardEntries((current) => {
      if (!current.length) {
        return current;
      }

      if (!isCurrentlyCompleted) {
        nextCompletionOrder =
          current.reduce((maxOrder, currentEntry) => {
            const order = Number(currentEntry?.completionOrder);
            return currentEntry?.isCompleted && Number.isFinite(order)
              ? Math.max(maxOrder, order)
              : maxOrder;
          }, 0) + 1;
      }

      return current.map((currentEntry) =>
        currentEntry.boardEntryId === boardEntryId
          ? {
              ...currentEntry,
              isCompleted: !isCurrentlyCompleted,
              completedAt: !isCurrentlyCompleted ? new Date().toISOString() : null,
              completionOrder: !isCurrentlyCompleted ? nextCompletionOrder : null
            }
          : currentEntry
      );
    });

    if (!entry.isTourFlight || !entry.tourPath || !entry.tourRowId) {
      return;
    }

    setTourProgress?.((current) => {
      const currentTourProgress = current?.[entry.tourPath]?.rows || {};
      if (isCurrentlyCompleted) {
        const nextTourProgress = { ...(current || {}) };
        const nextRows = { ...currentTourProgress };
        delete nextRows[entry.tourRowId];

        // Keep the in-memory shape aligned with persisted state by removing empty tour paths.
        if (!Object.keys(nextRows).length) {
          delete nextTourProgress[entry.tourPath];
          return nextTourProgress;
        }

        nextTourProgress[entry.tourPath] = {
          rows: nextRows
        };
        return nextTourProgress;
      }

      const nextTourCompletionOrder =
        Object.values(currentTourProgress).reduce((maxOrder, progressEntry) => {
          const order = Number(progressEntry?.completionOrder);
          return Number.isFinite(order) ? Math.max(maxOrder, order) : maxOrder;
        }, 0) + 1;

      return {
        ...current,
        [entry.tourPath]: {
          rows: {
            ...currentTourProgress,
            [entry.tourRowId]: {
              completed: true,
              completedAt: new Date().toISOString(),
              completionOrder: nextTourCompletionOrder,
              source: "manual"
            }
          }
        }
      };
    });
  }

  function handleRemoveFromFlightBoard(boardEntryId) {
    const entryToRemove = flightBoard.find((entry) => entry.boardEntryId === boardEntryId) || null;

    updateActiveFlightBoardEntries((current) =>
      current.filter((entry) => entry.boardEntryId !== boardEntryId)
    );
    setExpandedBoardFlightId?.((current) => (current === boardEntryId ? null : current));

    if (entryToRemove?.isTourFlight && entryToRemove.tourPath && entryToRemove.tourRowId) {
      const sourceFlight = tourFlightsByKey.get(
        buildTourFlightLookupKey(entryToRemove.tourPath, entryToRemove.tourRowId)
      );

      if (String(sourceFlight?.completionSource || "").trim().toLowerCase() === "manual") {
        setTourProgress?.((current) => {
          const currentTourProgress = current?.[entryToRemove.tourPath]?.rows || {};
          if (!currentTourProgress[entryToRemove.tourRowId]) {
            return current;
          }

          const nextTourProgress = { ...(current || {}) };
          const nextRows = { ...currentTourProgress };
          delete nextRows[entryToRemove.tourRowId];

          // Keep manual progress aligned with visible board state by removing
          // the manual completion entry when its leg leaves the board.
          if (!Object.keys(nextRows).length) {
            delete nextTourProgress[entryToRemove.tourPath];
            return nextTourProgress;
          }

          nextTourProgress[entryToRemove.tourPath] = {
            rows: nextRows
          };
          return nextTourProgress;
        });
      }
    }

    if (String(simBriefDispatchStateRef?.current?.flightId || "").trim() === boardEntryId) {
      clearSimBriefDispatchState();
    }
  }

  function handleReorderFlightBoard(sourceBoardEntryId, targetBoardEntryId, position = "before") {
    if (!sourceBoardEntryId || !targetBoardEntryId || sourceBoardEntryId === targetBoardEntryId) {
      return;
    }

    updateActiveFlightBoardEntries((current) => {
      const sourceIndex = current.findIndex((entry) => entry.boardEntryId === sourceBoardEntryId);
      const targetIndex = current.findIndex((entry) => entry.boardEntryId === targetBoardEntryId);

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return current;
      }

      const nextFlightBoard = [...current];
      const [movedEntry] = nextFlightBoard.splice(sourceIndex, 1);
      const adjustedTargetIndex =
        position === "after"
          ? targetIndex > sourceIndex
            ? targetIndex
            : targetIndex + 1
          : targetIndex > sourceIndex
            ? targetIndex - 1
            : targetIndex;
      nextFlightBoard.splice(adjustedTargetIndex, 0, movedEntry);
      return nextFlightBoard;
    });
  }

  async function handleRepairFlightBoardEntry(boardEntryId) {
    const entry = flightBoard.find((item) => item.boardEntryId === boardEntryId);
    if (!entry || !schedule?.flights?.length) {
      return;
    }

    const repairedEntry = repairBoardEntryAgainstSchedule(entry, schedule.flights);
    if (!repairedEntry) {
      setStatusMessage?.(
        `No matching flight was found for ${entry.airline} ${entry.from}-${entry.to} in the current schedule.`
      );
      await logAppEvent("flight-board-repair-missed", {
        boardEntryId,
        airline: entry.airline,
        from: entry.from,
        to: entry.to
      });
      return;
    }

    const nextFlightBoard = flightBoard.map((item) =>
      item.boardEntryId === boardEntryId ? repairedEntry : item
    );
    updateActiveFlightBoardEntries(nextFlightBoard);
    setStatusMessage?.(
      `Repaired ${repairedEntry.flightCode} ${repairedEntry.from}-${repairedEntry.to} from the current schedule.`
    );
    await logAppEvent("flight-board-repaired", {
      boardEntryId,
      linkedFlightId: repairedEntry.linkedFlightId,
      flightCode: repairedEntry.flightCode
    });
  }

  function handleSelectFlightBoard(boardId) {
    const normalizedBoardId = String(boardId || "").trim();
    if (!normalizedBoardId) {
      return;
    }

    setActiveFlightBoardId?.(normalizedBoardId);
    setExpandedBoardFlightId?.(null);
    clearSimBriefDispatchState();
  }

  function handleCreateFlightBoard() {
    if (flightBoards.length >= MAX_FLIGHT_BOARDS) {
      return;
    }

    const nextBoard = createFlightBoard(`Board ${flightBoards.length + 1}`, []);
    setFlightBoards((current) => [...current, nextBoard].slice(0, MAX_FLIGHT_BOARDS));
    setActiveFlightBoardId?.(nextBoard.id);
    setExpandedBoardFlightId?.(null);
    clearSimBriefDispatchState();
  }

  function handleRenameFlightBoard(boardId, nextName) {
    const normalizedBoardId = String(boardId || "").trim();
    if (!normalizedBoardId) {
      return;
    }

    const targetBoard = flightBoards.find((board) => board.id === normalizedBoardId);
    if (!targetBoard) {
      return;
    }

    const normalizedName = normalizeFlightBoardName(nextName, targetBoard.name);
    if (normalizedName === targetBoard.name) {
      return;
    }

    setFlightBoards((current) =>
      current.map((board) =>
        board.id === normalizedBoardId
          ? {
              ...board,
              name: normalizedName
            }
          : board
      )
    );
  }

  function handleDeleteFlightBoard(boardId) {
    const normalizedBoardId = String(boardId || "").trim();
    if (!normalizedBoardId) {
      return;
    }

    const boardIndex = flightBoards.findIndex((board) => board.id === normalizedBoardId);
    if (boardIndex < 0) {
      return;
    }

    if (flightBoards.length <= 1) {
      setFlightBoards((current) =>
        current.map((board) =>
          board.id === normalizedBoardId
            ? {
                ...board,
                name: DEFAULT_FLIGHT_BOARD_NAME,
                entries: []
              }
            : board
        )
      );
      setActiveFlightBoardId?.(normalizedBoardId);
      setExpandedBoardFlightId?.(null);
      clearSimBriefDispatchState();
      return;
    }

    const nextFlightBoards = flightBoards.filter((board) => board.id !== normalizedBoardId);
    const nextActiveBoard =
      activeFlightBoardId === normalizedBoardId
        ? nextFlightBoards[Math.max(0, boardIndex - 1)] || nextFlightBoards[0] || null
        : nextFlightBoards.find((board) => board.id === activeFlightBoardId) ||
          nextFlightBoards[0] ||
          null;

    setFlightBoards(nextFlightBoards);
    setActiveFlightBoardId?.(nextActiveBoard?.id || "");
    setExpandedBoardFlightId?.(null);
    clearSimBriefDispatchState();
  }

  return {
    activeFlightBoard,
    flightBoard,
    shortlist,
    selectedShortlistFlight,
    updateActiveFlightBoardEntries,
    replaceFlightBoard,
    handleToggleBoardFlight,
    handleAddToFlightBoard,
    handleCompleteTourFlight,
    handleRemoveFromFlightBoard,
    handleReorderFlightBoard,
    handleRepairFlightBoardEntry,
    handleSelectFlightBoard,
    handleCreateFlightBoard,
    handleRenameFlightBoard,
    handleDeleteFlightBoard
  };
}
