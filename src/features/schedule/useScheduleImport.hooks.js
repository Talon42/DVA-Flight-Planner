import { startTransition, useCallback, useState } from "react";
import { formatNumber } from "../../domain/formatting/formatters.js";
import { DEFAULT_FILTERS, DEFAULT_SORT } from "./schedule.constants.js";
import { buildFilterBounds, normalizeFilters } from "./scheduleFilters.model.js";
import { buildDefaultDutyFilters } from "../../logic/dutySchedule/dutyFilters.js";
import { logAppError, logAppEvent } from "../../services/logging/appLog.client.js";
import {
  appendImportLog,
  readSavedSchedule,
  writeSavedSchedule
} from "../../services/storage/storage.js";
import { runScheduleImport } from "../../services/workers/import.client.js";
import {
  DEFAULT_FLIGHT_BOARD_NAME,
  buildBoardEntryFromFlight,
  createFlightBoard,
  normalizeBoardEntry
} from "../flightBoard/flightBoard.model.js";

// Rebuilds active-board entries against a fresh flight list so saved shortlist state stays valid.
function reconcileBoardWithSchedule(currentBoard, nextFlights) {
  const flightsById = new Map((nextFlights || []).map((flight) => [flight.flightId, flight]));

  return (currentBoard || [])
    .map((entry) => {
      const normalizedEntry = normalizeBoardEntry(entry);
      if (!normalizedEntry) {
        return null;
      }

      if (normalizedEntry.isTourFlight) {
        return normalizedEntry;
      }

      const matchedFlight = normalizedEntry.linkedFlightId
        ? flightsById.get(normalizedEntry.linkedFlightId)
        : null;

      if (!matchedFlight) {
        return {
          ...normalizedEntry,
          linkedFlightId: null,
          isStale: true
        };
      }

      return buildBoardEntryFromFlight(matchedFlight, {
        boardEntryId: normalizedEntry.boardEntryId,
        selectedAircraft: normalizedEntry.selectedAircraft,
        simbriefPlan: normalizedEntry.simbriefPlan,
        draftNetwork: normalizedEntry.draftNetwork,
        draftReportId: normalizedEntry.draftReportId,
        dvaDraftReportId: normalizedEntry.dvaDraftReportId,
        draftDeleteRequiresRegenerate: normalizedEntry.draftDeleteRequiresRegenerate,
        isStale: false,
        isCompleted: normalizedEntry.isCompleted,
        completedAt: normalizedEntry.completedAt,
        completionOrder: normalizedEntry.completionOrder
      });
    })
    .filter(Boolean);
}

// Persists the imported schedule together with the current planner UI state.
function buildSavedSchedule(schedule, uiState) {
  const persistedBoards = Array.isArray(uiState?.flightBoards) ? uiState.flightBoards : [];
  const persistedActiveBoardId = String(uiState?.activeFlightBoardId || "").trim();
  const activeBoard =
    persistedBoards.find((board) => String(board?.id || "").trim() === persistedActiveBoardId) ||
    persistedBoards[0] ||
    null;
  const activeBoardEntries = Array.isArray(activeBoard?.entries)
    ? activeBoard.entries
    : Array.isArray(uiState?.flightBoard)
      ? uiState.flightBoard
      : [];

  return {
    importedAt: schedule.importedAt,
    sourceFileName: schedule.importSummary?.sourceFileName || null,
    importSummary: schedule.importSummary,
    flights: schedule.flights,
    shortlist: activeBoardEntries.map((entry) => entry.linkedFlightId).filter(Boolean),
    uiState
  };
}

// Owns the import workflow so App.jsx can keep sync and startup orchestration separate.
export function useScheduleImport({
  activeFlightBoardId = "",
  basicAdvancedFiltersOpen = false,
  basicAddonFiltersOpen = false,
  filters,
  flightBoard = [],
  flightBoards = [],
  plannerControlsCollapsed = false,
  plannerMode = "basic",
  scheduleTableTimeDisplayMode = "local",
  scheduleView = "flights",
  selectedAccomplishmentName = "",
  selectedFlightId = null,
  selectedTourPath = "",
  setActiveFlightBoardId,
  setDutyFilters,
  setExpandedBoardFlightId,
  setFilterUiVersion,
  setFilters,
  setFlightBoards,
  setPlannerMode,
  setSchedule,
  setSelectedFlightId,
  setSort,
  setStatusMessage,
  sort,
  tourProgress,
  dutyFilters,
  onScheduleImported = null
} = {}) {
  const [isImporting, setIsImporting] = useState(false);

  const persistScheduleSnapshot = useCallback(
    async (nextSchedule, overrides = {}) => {
      if (!nextSchedule) {
        return false;
      }

      const savedSchedule = buildSavedSchedule(nextSchedule, {
        plannerMode: overrides.plannerMode ?? plannerMode,
        filters: overrides.filters ?? filters,
        dutyFilters: overrides.dutyFilters ?? dutyFilters,
        flightBoards: overrides.flightBoards ?? flightBoards,
        activeFlightBoardId: overrides.activeFlightBoardId ?? activeFlightBoardId,
        flightBoard: overrides.flightBoard ?? flightBoard,
        plannerControlsCollapsed:
          overrides.plannerControlsCollapsed ?? plannerControlsCollapsed,
        basicAdvancedFiltersOpen:
          overrides.basicAdvancedFiltersOpen ?? basicAdvancedFiltersOpen,
        basicAddonFiltersOpen: overrides.basicAddonFiltersOpen ?? basicAddonFiltersOpen,
        scheduleTableTimeDisplayMode:
          overrides.scheduleTableTimeDisplayMode ?? scheduleTableTimeDisplayMode,
        sort: overrides.sort ?? sort,
        selectedFlightId: overrides.selectedFlightId ?? selectedFlightId,
        scheduleView: overrides.scheduleView ?? scheduleView,
        selectedTourPath: overrides.selectedTourPath ?? selectedTourPath,
        selectedAccomplishmentName:
          overrides.selectedAccomplishmentName ?? selectedAccomplishmentName,
        tourProgress: overrides.tourProgress ?? tourProgress
      });

      try {
        await writeSavedSchedule(savedSchedule);

        const persistedSchedule = await readSavedSchedule();
        if (!persistedSchedule?.flights?.length) {
          setStatusMessage?.(
            "Imported schedule, but it could not be saved for next launch. Check the app log."
          );
          await logAppError("persist-schedule-verify-failed", new Error("Saved schedule read-back missing flights."), {
            flightCount: Array.isArray(savedSchedule?.flights) ? savedSchedule.flights.length : 0,
            sourceFileName: savedSchedule?.sourceFileName || null
          });
          return false;
        }

        await logAppEvent("persist-schedule-succeeded", {
          flightCount: Array.isArray(savedSchedule?.flights) ? savedSchedule.flights.length : 0,
          sourceFileName: savedSchedule?.sourceFileName || null
        });
        return true;
      } catch (error) {
        setStatusMessage?.(
          "Imported schedule, but it could not be saved for next launch. Check the app log."
        );
        await logAppError("persist-schedule-failed", error, {
          flightCount: Array.isArray(savedSchedule?.flights) ? savedSchedule.flights.length : 0,
          sourceFileName: savedSchedule?.sourceFileName || null
        }).catch(() => {});
        return false;
      }
    },
    [
      activeFlightBoardId,
      basicAdvancedFiltersOpen,
      basicAddonFiltersOpen,
      dutyFilters,
      filters,
      flightBoard,
      flightBoards,
      plannerControlsCollapsed,
      plannerMode,
      scheduleTableTimeDisplayMode,
      scheduleView,
      selectedAccomplishmentName,
      selectedFlightId,
      selectedTourPath,
      setStatusMessage,
      sort,
      tourProgress
    ]
  );

  const processImportedSchedule = useCallback(
    async (scheduleFile, sourceLabel) => {
      const logStartedAt = new Date().toISOString();
      const startedAtMs = Date.now();
      let importIssuesText = "";
      const importerErrors = [];
      const appendDebug = (message) => {
        const text = String(message || "");
        const normalized = text.toLowerCase();
        if (
          normalized.includes("error") ||
          normalized.includes("crash") ||
          normalized.includes("fallback")
        ) {
          importerErrors.push(text);
        }
      };

      setIsImporting(true);
      setStatusMessage?.(`Importing ${scheduleFile.fileName}...`);
      await logAppEvent("import-start", {
        source: sourceLabel,
        file: scheduleFile.fileName
      });

      try {
        const imported = await runScheduleImport(
          scheduleFile.fileName,
          scheduleFile.xmlText,
          appendDebug
        );
        importIssuesText = imported.importLog || "";
        const nextBounds = buildFilterBounds(imported.flights);
        const nextFlightBoard = reconcileBoardWithSchedule(flightBoard, imported.flights);
        const effectiveActiveBoardId =
          activeFlightBoardId && flightBoards.some((board) => board.id === activeFlightBoardId)
            ? activeFlightBoardId
            : flightBoards[0]?.id;
        const baseFlightBoards = flightBoards.length
          ? flightBoards
          : [createFlightBoard(DEFAULT_FLIGHT_BOARD_NAME, [])];
        const nextFlightBoards = baseFlightBoards.map((board) =>
          board.id === effectiveActiveBoardId
            ? {
                ...board,
                entries: nextFlightBoard
              }
            : {
                ...board,
                entries: reconcileBoardWithSchedule(board.entries || [], imported.flights)
              }
        );
        const nextSchedule = {
          importedAt: imported.importedAt,
          flights: imported.flights,
          importSummary: {
            ...imported.importSummary,
            source: sourceLabel
          }
        };

        startTransition(() => {
          setSchedule?.(nextSchedule);
          setFlightBoards?.(nextFlightBoards);
          if (effectiveActiveBoardId) {
            setActiveFlightBoardId?.(effectiveActiveBoardId);
          }
          setPlannerMode?.("basic");
          setFilters?.(normalizeFilters(DEFAULT_FILTERS, nextBounds));
          setDutyFilters?.(buildDefaultDutyFilters(nextBounds));
          setSort?.(DEFAULT_SORT);
          setSelectedFlightId?.(imported.flights[0]?.flightId || null);
          setExpandedBoardFlightId?.((current) =>
            nextFlightBoard.some((entry) => entry.boardEntryId === current) ? current : null
          );
          setFilterUiVersion?.((current) => current + 1);
        });

        const persistedSuccessfully = await persistScheduleSnapshot(nextSchedule, {
          plannerMode: "basic",
          filters: normalizeFilters(DEFAULT_FILTERS, nextBounds),
          dutyFilters: buildDefaultDutyFilters(nextBounds),
          flightBoards: nextFlightBoards,
          activeFlightBoardId: effectiveActiveBoardId || nextFlightBoards[0]?.id || "",
          flightBoard: nextFlightBoard,
          sort: DEFAULT_SORT,
          selectedFlightId: imported.flights[0]?.flightId || null
        });

        const staleBoardEntries = nextFlightBoard.filter((entry) => entry.isStale).length;
        setStatusMessage?.(
          persistedSuccessfully
            ? staleBoardEntries
              ? `Imported ${formatNumber(imported.flights.length)} flights from ${scheduleFile.fileName}. ${formatNumber(staleBoardEntries)} board flights need repair.`
              : `Imported ${formatNumber(imported.flights.length)} flights from ${scheduleFile.fileName}.`
            : "Imported schedule, but it could not be saved for next launch. Check the app log."
        );
        await logAppEvent("import-success", {
          source: sourceLabel,
          file: scheduleFile.fileName,
          importedRows: imported.importSummary?.importedRows ?? imported.flights.length,
          omittedRows: imported.importSummary?.omittedRows ?? 0,
          incompatibleRoutes: imported.importSummary?.incompatibleRoutes ?? 0,
          durationMs: Date.now() - startedAtMs
        });
        onScheduleImported?.(imported, nextSchedule);
        return { ok: true, imported, schedule: nextSchedule };
      } catch (error) {
        setStatusMessage?.(error.message || "Import failed.");
        await logAppError("import-failed", error, {
          source: sourceLabel,
          file: scheduleFile.fileName,
          durationMs: Date.now() - startedAtMs
        });
        return { ok: false, error };
      } finally {
        try {
          const sessionEndedAt = new Date().toISOString();
          const logSections = [
            `=== Import Session (${sourceLabel}) ===\nStart: ${logStartedAt}\nEnd: ${sessionEndedAt}\nSource: ${scheduleFile.fileName}`
          ];
          if (importIssuesText) {
            logSections.push(`--- Import Issues ---\n${importIssuesText.trim()}`);
          }
          if (importerErrors.length) {
            logSections.push(`--- Import Diagnostics ---\n${importerErrors.join("\n")}`);
          }
          await appendImportLog(logSections.join("\n\n"));
        } catch (error) {
          setStatusMessage?.(error.message || "Unable to persist the log file.");
        }
        setIsImporting(false);
      }
    },
    [
      activeFlightBoardId,
      flightBoard,
      flightBoards,
      onScheduleImported,
      persistScheduleSnapshot,
      setActiveFlightBoardId,
      setDutyFilters,
      setExpandedBoardFlightId,
      setFilterUiVersion,
      setFilters,
      setFlightBoards,
      setPlannerMode,
      setSchedule,
      setSelectedFlightId,
      setSort,
      setStatusMessage
    ]
  );

  return {
    isImporting,
    processImportedSchedule
  };
}
