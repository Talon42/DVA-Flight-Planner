import { useEffect, useMemo, useState } from "react";
import {
  findCustomAirframeByInternalId,
  getAircraftDisplayName,
  getSelectedAircraftForFlight,
  resolveSimBriefDispatchAircraft
} from "../../domain/aircraft/aircraftIdentity.js";
import { buildTourFlightLookupKey } from "../tours/tourIds.model.js";
import { deriveFlightNumber } from "../../domain/flights/flightIdentity.js";
import { logAppEvent } from "../../services/logging/appLog.client.js";
import {
  DEFAULT_FLIGHT_BOARD_NAME,
  MAX_FLIGHT_BOARDS,
  buildBoardEntryFromFlight,
  buildBoardEntryFromTourFlight,
  createFlightBoard,
  normalizeBoardEntry,
  normalizeDraftNetwork,
  normalizeFlightBoardName
} from "./flightBoard.model.js";

function normalizeRepairMatchValue(value) {
  return String(value || "").trim().toUpperCase();
}

function findClosestDeparture(flights, departureMillis) {
  return (
    [...flights].sort((left, right) => {
      const leftDelta = Math.abs((Number(left.stdUtcMillis) || 0) - departureMillis);
      const rightDelta = Math.abs((Number(right.stdUtcMillis) || 0) - departureMillis);
      return (
        leftDelta - rightDelta ||
        String(left.flightId || "").localeCompare(String(right.flightId || ""))
      );
    })[0] || null
  );
}

// Resolves the repair hierarchy without applying alternate-airline matches automatically.
function findRepairMatch(entry, flights = []) {
  const normalizedEntry = normalizeBoardEntry(entry);
  if (!normalizedEntry) {
    return { type: "missing-route", entry: null, flight: null };
  }

  const routeMatches = flights.filter(
    (flight) =>
      normalizeRepairMatchValue(flight.from) === normalizedEntry.from &&
      normalizeRepairMatchValue(flight.to) === normalizedEntry.to
  );

  if (!routeMatches.length) {
    return { type: "missing-route", entry: normalizedEntry, flight: null };
  }

  const departureMillis = Number(normalizedEntry.stdUtcMillis) || 0;
  const airlineMatches = routeMatches.filter(
    (flight) =>
      normalizeRepairMatchValue(flight.airline) ===
      normalizeRepairMatchValue(normalizedEntry.airline)
  );
  if (!airlineMatches.length) {
    return {
      type: "alternate-airline",
      entry: normalizedEntry,
      flight: findClosestDeparture(routeMatches, departureMillis)
    };
  }

  const flightNumber = normalizeRepairMatchValue(deriveFlightNumber(normalizedEntry));
  const numberMatches = airlineMatches.filter(
    (flight) => normalizeRepairMatchValue(deriveFlightNumber(flight)) === flightNumber
  );
  return {
    type: "direct",
    entry: normalizedEntry,
    flight: findClosestDeparture(numberMatches.length ? numberMatches : airlineMatches, departureMillis)
  };
}

function buildRepairedBoardEntry(entry, repairedFlight) {
  const normalizedEntry = normalizeBoardEntry(entry);
  if (!normalizedEntry || !repairedFlight) return null;

  return buildBoardEntryFromFlight(repairedFlight, {
    boardEntryId: normalizedEntry.boardEntryId,
    selectedAircraft: normalizedEntry.selectedAircraft,
    simbriefPlan: normalizedEntry.simbriefPlan,
    draftNetwork: normalizedEntry.draftNetwork,
    draftReportId: normalizedEntry.draftReportId,
    dvaDraftReportId: normalizedEntry.dvaDraftReportId,
    draftDeleteRequiresRegenerate: normalizedEntry.draftDeleteRequiresRegenerate,
    isCompleted: normalizedEntry.isCompleted,
    completedAt: normalizedEntry.completedAt,
    completionOrder: normalizedEntry.completionOrder,
    isStale: false
  });
}

function getRepairDepartureLabel(flight) {
  return String(
    flight?.departureTimeLabel || flight?.stdLocal || flight?.stdUtc || "the scheduled departure"
  ).trim();
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
  onCloseSimBriefDispatchBlocked = null,
  schedule = null,
  scheduleView = "flights",
  onOpenSimBriefDispatchBlocked = null,
  onOpenStaleScheduleBlocked = null,
  setActiveFlightBoardId,
  setExpandedBoardFlightId,
  setFlightBoards,
  setStatusMessage,
  setTourProgress,
  simBriefCustomAirframes = [],
  simBriefDispatchStateRef = null,
  tourFlightsByKey = new Map()
} = {}) {
  const [repairPrompt, setRepairPrompt] = useState(null);
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
  const flightBoard = useMemo(() => activeFlightBoard?.entries || [], [activeFlightBoard]);

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
          dvaDraftReportId: entry.dvaDraftReportId,
          draftDeleteRequiresRegenerate: entry.draftDeleteRequiresRegenerate,
          isCompleted: entry.isCompleted,
          completedAt: entry.completedAt,
          completionOrder: entry.completionOrder
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

  function handleSimBriefTypeChange(boardEntryId, nextType) {
    const rawSelection = String(nextType || "").trim();
    const selectedCustomAirframe = findCustomAirframeByInternalId(
      rawSelection,
      simBriefCustomAirframes
    );
    const selectedAircraft = selectedCustomAirframe?.internalId
      ? rawSelection
      : getAircraftDisplayName(rawSelection);
    const nextFlightBoard = flightBoard.map((entry) =>
      entry.boardEntryId === boardEntryId
        ? {
            ...entry,
            selectedAircraft,
            simbriefSelectedType: ""
          }
        : entry
    );
    updateActiveFlightBoardEntries(nextFlightBoard);

    const updatedEntry =
      nextFlightBoard.find((entry) => entry.boardEntryId === boardEntryId) || null;
    if (!updatedEntry || !selectedAircraft) {
      onCloseSimBriefDispatchBlocked?.();
      return;
    }

    const dispatchResolution = resolveSimBriefDispatchAircraft(
      {
        ...updatedEntry,
        selectedAircraft
      },
      simBriefCustomAirframes
    );

    if (dispatchResolution.ok) {
      onCloseSimBriefDispatchBlocked?.();
      return;
    }

    onOpenSimBriefDispatchBlocked?.(dispatchResolution.reason);
  }

  // Updates the board entry's draft network without disturbing the aircraft selection.
  function handleDraftNetworkChange(boardEntryId, nextNetwork) {
    const normalizedDraftNetwork = normalizeDraftNetwork(nextNetwork);

    updateActiveFlightBoardEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.boardEntryId === boardEntryId
          ? {
              ...entry,
              draftNetwork: normalizedDraftNetwork
            }
          : entry
      )
    );
  }

  function normalizeSimBriefPlanForBoardEntry(plan, fallbackStaticId = "") {
    if (!plan || typeof plan !== "object") {
      return null;
    }

    const routePointsSource = Array.isArray(plan.routePoints)
      ? plan.routePoints
      : Array.isArray(plan.route_points)
        ? plan.route_points
        : [];
    const routePoints = routePointsSource
      .map((point) => {
        if (!point || typeof point !== "object") {
          return null;
        }

        const latitude = Number(point.latitude);
        const longitude = Number(point.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          return null;
        }

        return {
          ident: String(point.ident || "").trim(),
          latitude,
          longitude
        };
      })
      .filter(Boolean);
    const aircraftType = String(
      plan.aircraftType ||
        plan.aircraft_type ||
        plan.aircraft?.icao ||
        plan.aircraft?.type ||
        plan.aircraft?.code ||
        plan.aircraft?.name ||
        plan.aircraft ||
        ""
    )
      .trim()
      .toUpperCase();
    const staticId = String(plan.staticId || plan.static_id || fallbackStaticId || "").trim();
    const ofpXmlId = String(plan.ofpXmlId || plan.ofp_xml_id || plan.dvaSimBriefId || "")
      .trim()
      .toUpperCase();
    const aircraft =
      plan.aircraft && typeof plan.aircraft === "object"
        ? { ...plan.aircraft }
        : aircraftType
          ? {
              code: aircraftType,
              icao: aircraftType,
              type: aircraftType,
              name: aircraftType
            }
          : null;

    return {
      status: String(plan.status || "").trim(),
      generatedAtUtc: String(plan.generatedAtUtc || plan.generated_at_utc || "").trim(),
      generated_at_utc: String(plan.generatedAtUtc || plan.generated_at_utc || "").trim(),
      staticId,
      static_id: staticId,
      ofpXmlId,
      ofp_xml_id: ofpXmlId,
      aircraftType,
      aircraft_type: aircraftType,
      aircraft,
      callsign: String(plan.callsign || "").trim(),
      route: String(plan.route || "").trim(),
      cruiseAltitude: String(plan.cruiseAltitude || plan.cruise_altitude || "").trim(),
      alternate: String(plan.alternate || "").trim(),
      ete: String(plan.ete || "").trim(),
      blockFuel: String(plan.blockFuel || plan.block_fuel || "").trim(),
      pax: Number.isInteger(plan.pax)
        ? plan.pax
        : Number.isInteger(Number(plan.pax))
          ? Number(plan.pax)
          : null,
      ofpUrl: String(plan.ofpUrl || plan.ofp_url || "").trim(),
      pdfUrl: String(plan.pdfUrl || plan.pdf_url || "").trim(),
      routePoints,
      route_points: routePoints
    };
  }

  // Builds the board-entry shape used by both the live board state and the draft submit payload.
  function buildBoardEntryWithSimBriefPlan(boardEntry, simBriefPlan) {
    const normalizedBoardEntry = normalizeBoardEntry(boardEntry);
    if (!normalizedBoardEntry) {
      return null;
    }

    const normalizedPlan = normalizeSimBriefPlanForBoardEntry(
      simBriefPlan,
      normalizedBoardEntry.simbriefPlan?.staticId ||
        normalizedBoardEntry.simbriefPlan?.static_id ||
        ""
    );
    const existingSelectedAircraft =
      getSelectedAircraftForFlight(normalizedBoardEntry, simBriefCustomAirframes) || "";
    const selectedCustomAirframe = findCustomAirframeByInternalId(
      normalizedBoardEntry.selectedAircraft,
      simBriefCustomAirframes
    );
    const refreshedSelectedAircraft =
      getAircraftDisplayName(normalizedPlan?.aircraftType) ||
      String(normalizedPlan?.aircraftType || "").trim();
    // Always sync the stored selection to the aircraft that SimBrief returned for the plan.
    const resolvedSelectedAircraft = refreshedSelectedAircraft || existingSelectedAircraft;
    const resolvedPlan = normalizedPlan
      ? {
          ...normalizedPlan,
          aircraftType: resolvedSelectedAircraft,
          aircraft_type: resolvedSelectedAircraft,
          aircraft: resolvedSelectedAircraft
            ? normalizedPlan.aircraft ||
              {
                code: resolvedSelectedAircraft,
                icao: resolvedSelectedAircraft,
                type: resolvedSelectedAircraft,
                name: resolvedSelectedAircraft
              }
            : null
        }
      : null;

    return {
      ...normalizedBoardEntry,
      simbriefPlan: resolvedPlan,
      // Keep the custom ID so its explicit DVA equipment link survives SimBrief's returned name.
      selectedAircraft: selectedCustomAirframe?.internalId || resolvedSelectedAircraft,
      simbriefSelectedType: ""
    };
  }

  // Keeps the stored aircraft selection aligned with the latest imported SimBrief plan.
  function applySimBriefPlanToBoardEntry(boardEntryId, simBriefPlan) {
    const currentBoardEntry =
      flightBoard.find((entry) => entry.boardEntryId === boardEntryId) ||
      selectedShortlistFlight ||
      null;
    const nextBoardEntry = buildBoardEntryWithSimBriefPlan(currentBoardEntry, simBriefPlan);

    if (!nextBoardEntry) {
      return null;
    }

    updateActiveFlightBoardEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.boardEntryId === boardEntryId ? nextBoardEntry : entry
      )
    );

    return nextBoardEntry;
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

  async function applyRepairMatch(boardEntryId, repairedFlight) {
    const currentEntry = flightBoard.find((item) => item.boardEntryId === boardEntryId);
    const repairedEntry = buildRepairedBoardEntry(currentEntry, repairedFlight);
    if (!repairedEntry) return;

    updateActiveFlightBoardEntries((currentEntries) =>
      currentEntries.map((item) => (item.boardEntryId === boardEntryId ? repairedEntry : item))
    );

    setStatusMessage?.(
      `Repaired ${repairedEntry.flightCode} ${repairedEntry.from}-${repairedEntry.to} from the current schedule.`
    );
    await logAppEvent("flight-board-repaired", {
      boardEntryId,
      linkedFlightId: repairedEntry.linkedFlightId,
      flightCode: repairedEntry.flightCode
    });
  }

  async function handleRepairFlightBoardEntry(boardEntryId) {
    const entry = flightBoard.find((item) => item.boardEntryId === boardEntryId);
    if (!entry) return;

    const match = findRepairMatch(entry, schedule?.flights || []);
    if (match.type === "missing-route") {
      setRepairPrompt({
        type: "missing-route",
        boardEntryId,
        airline: entry.airline,
        from: entry.from,
        to: entry.to
      });
      await logAppEvent("flight-board-repair-missed", {
        boardEntryId,
        airline: entry.airline,
        from: entry.from,
        to: entry.to
      });
      return;
    }

    if (match.type === "alternate-airline") {
      setRepairPrompt({
        type: "alternate-airline",
        boardEntryId,
        airline: entry.airline,
        from: entry.from,
        to: entry.to,
        candidateFlight: match.flight,
        candidateAirline: String(match.flight?.airline || "").trim(),
        candidateFlightCode: String(match.flight?.flightCode || "").trim(),
        candidateDepartureLabel: getRepairDepartureLabel(match.flight)
      });
      await logAppEvent("flight-board-repair-alternate-airline-prompted", {
        boardEntryId,
        airline: entry.airline,
        alternateAirline: match.flight?.airline,
        from: entry.from,
        to: entry.to
      });
      return;
    }

    await applyRepairMatch(boardEntryId, match.flight);
  }

  async function handleResolveRepairPrompt(confirmed) {
    const prompt = repairPrompt;
    setRepairPrompt(null);
    if (!prompt || prompt.type !== "alternate-airline") return;

    if (!confirmed) {
      await logAppEvent("flight-board-repair-alternate-airline-declined", {
        boardEntryId: prompt.boardEntryId,
        airline: prompt.airline,
        alternateAirline: prompt.candidateAirline,
        from: prompt.from,
        to: prompt.to
      });
      return;
    }

    await applyRepairMatch(prompt.boardEntryId, prompt.candidateFlight);
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
    repairPrompt,
    updateActiveFlightBoardEntries,
    applySimBriefPlanToBoardEntry,
    replaceFlightBoard,
    handleToggleBoardFlight,
    handleAddToFlightBoard,
    handleCompleteTourFlight,
    handleRemoveFromFlightBoard,
    handleReorderFlightBoard,
    handleRepairFlightBoardEntry,
    handleResolveRepairPrompt,
    handleSelectFlightBoard,
    handleCreateFlightBoard,
    handleRenameFlightBoard,
    handleDeleteFlightBoard,
    handleSimBriefTypeChange,
    handleDraftNetworkChange
  };
}
