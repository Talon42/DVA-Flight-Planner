import { useCallback, useEffect, useRef } from "react";
import { normalizeMapOptions } from "../components/map/mapOptions.model.js";
import { logAppEvent } from "../services/logging/appLog.client.js";
import { saveUiState, saveUiStateImmediate } from "../services/storage/uiState.storage.js";
import { useDebouncedEffect } from "./useDebouncedEffect.hooks.js";

function buildFlightBoardCacheSignature(boards = []) {
  return JSON.stringify(
    (Array.isArray(boards) ? boards : []).map((board) => ({
      id: String(board?.id || "").trim(),
      entries: (Array.isArray(board?.entries) ? board.entries : []).map((entry) => ({
        boardEntryId: String(entry?.boardEntryId || "").trim(),
        flightCode: String(entry?.flightCode || "").trim(),
        staticId: String(entry?.simbriefPlan?.staticId || entry?.simbriefPlan?.static_id || "").trim(),
        ofpXmlId: String(entry?.simbriefPlan?.ofpXmlId || entry?.simbriefPlan?.ofp_xml_id || "").trim(),
        draftReportId: String(entry?.draftReportId || "").trim(),
        dvaDraftReportId: String(entry?.dvaDraftReportId || "").trim(),
        draftDeleteRequiresRegenerate: Boolean(entry?.draftDeleteRequiresRegenerate)
      }))
    }))
  );
}

// Owns complete UI snapshots, hydration gating, debounced writes, and immediate map/board writes.
export function useAppUiStatePersistence({
  snapshot,
  isHydrating,
  flightBoards,
  setMapOptions,
  onError
}) {
  const snapshotRef = useRef(snapshot);
  const flightBoardCacheSignatureRef = useRef("");
  snapshotRef.current = snapshot;

  const buildCurrentPayload = useCallback((overrides = {}) => ({
    ...snapshotRef.current,
    ...overrides,
    mapOptions: normalizeMapOptions(
      overrides.mapOptions !== undefined ? overrides.mapOptions : snapshotRef.current.mapOptions
    )
  }), []);

  const handleSetMapOptions = useCallback((updater) => {
    const previousMapOptions = normalizeMapOptions(snapshotRef.current.mapOptions);
    const nextMapOptions = normalizeMapOptions(
      typeof updater === "function" ? updater(previousMapOptions) : updater
    );
    snapshotRef.current = { ...snapshotRef.current, mapOptions: nextMapOptions };
    setMapOptions(nextMapOptions);
    void logAppEvent("map-options-changed", { previousMapOptions, nextMapOptions }).catch(() => {});
    void saveUiStateImmediate(buildCurrentPayload({ mapOptions: nextMapOptions })).catch(onError);
  }, [buildCurrentPayload, onError, setMapOptions]);

  const currentBoardSignature = buildFlightBoardCacheSignature(flightBoards);
  useEffect(() => {
    if (isHydrating) {
      flightBoardCacheSignatureRef.current = currentBoardSignature;
      return;
    }
    if (flightBoardCacheSignatureRef.current === currentBoardSignature) return;
    flightBoardCacheSignatureRef.current = currentBoardSignature;

    const entries = (Array.isArray(flightBoards) ? flightBoards : []).flatMap((board) =>
      Array.isArray(board?.entries) ? board.entries : []
    );
    void logAppEvent("persist-flight-board-cache-started", {
      reason: "flight-board-cache",
      boardCount: flightBoards.length,
      entryCount: entries.length,
      cachedEntryCount: entries.filter((entry) => entry?.simbriefPlan || entry?.draftReportId || entry?.dvaDraftReportId).length
    });
    void saveUiStateImmediate(buildCurrentPayload({ flightBoards })).catch(onError);
  }, [buildCurrentPayload, currentBoardSignature, flightBoards, isHydrating, onError]);

  useDebouncedEffect(() => {
    if (!isHydrating) void saveUiState(buildCurrentPayload()).catch(onError);
  }, [snapshot, isHydrating, buildCurrentPayload, onError], 350);

  return { handleSetMapOptions };
}
