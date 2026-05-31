import { useEffect, useRef, useState } from "react";
import { buildVatsimAirportCoverage } from "../../domain/vatsim/vatsimCoverage.model.js";
import { logAppError, logAppEvent } from "../../services/logging/appLog.client.js";
import { fetchVatsimNetworkData } from "../../services/vatsim/vatsimNetwork.client.js";

export const VATSIM_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const EMPTY_VATSIM_NETWORK = {
  updateTimestamp: "",
  controllers: [],
  regionalControllers: [],
  renderedRegionalControllers: [],
  unmatchedRegionalControllers: [],
  ambiguousRegionalControllers: [],
  diagnostics: {
    rawControllerCount: 0,
    normalizedControllerCount: 0,
    unsupportedAirportControllerCount: 0,
    unsupportedControllerCount: 0,
    missingAirportControllerCount: 0,
    missingAirportControllerSamples: [],
    icaoResolvedControllerCount: 0,
    iataResolvedControllerCount: 0,
    airportCount: 0,
    regionalControllerCount: 0,
    rawRegionalCoverageFeatureCount: 0,
    regionalCoverageFeatureCount: 0,
    groupedRegionalCoverageFeatureCount: 0,
    logicalRegionalDisplayGroupCount: 0,
    groupedRegionalComponentCount: 0,
    dissolvedRegionalCoverageFeatureCount: 0,
    failedRegionalDissolveFeatureCount: 0,
    dissolvedRegionalPolygonPartReductionCount: 0,
    regionalCoverageOutlineFeatureCount: 0,
    renderedRegionalControllerCount: 0,
    unmatchedRegionalControllerCount: 0,
    ambiguousRegionalControllerCount: 0,
    resolvedAmbiguousRegionalControllerCount: 0,
    unresolvedAmbiguousRegionalControllerCount: 0,
    terminalRegionalControllerCount: 0,
    centerRegionalControllerCount: 0,
    terminalRegionalCoverageFeatureCount: 0,
    centerRegionalCoverageFeatureCount: 0,
    renderedRegionalControllerSamples: [],
    unmatchedRegionalControllerSamples: [],
    ambiguousRegionalControllerSamples: [],
    resolvedAmbiguousRegionalControllerSamples: [],
    unresolvedAmbiguousRegionalControllerSamples: [],
    auditOnlySectorMatchCount: 0
  },
  rawControllerCount: 0,
  normalizedControllerCount: 0,
  unsupportedAirportControllerCount: 0,
  unsupportedControllerCount: 0,
  unsupportedControllers: [],
  regionalControllerCount: 0,
  rawRegionalCoverageFeatureCount: 0,
  regionalCoverageFeatureCount: 0,
  groupedRegionalCoverageFeatureCount: 0,
  logicalRegionalDisplayGroupCount: 0,
  groupedRegionalComponentCount: 0,
  dissolvedRegionalCoverageFeatureCount: 0,
  failedRegionalDissolveFeatureCount: 0,
  dissolvedRegionalPolygonPartReductionCount: 0,
  regionalCoverageOutlineFeatureCount: 0,
  renderedRegionalControllerCount: 0,
  unmatchedRegionalControllerCount: 0,
  ambiguousRegionalControllerCount: 0,
  resolvedAmbiguousRegionalControllerCount: 0,
  unresolvedAmbiguousRegionalControllerCount: 0,
  terminalRegionalControllerCount: 0,
  centerRegionalControllerCount: 0,
  terminalRegionalCoverageFeatureCount: 0,
  centerRegionalCoverageFeatureCount: 0,
  renderedRegionalControllerSamples: [],
  unmatchedRegionalControllerSamples: [],
  ambiguousRegionalControllerSamples: [],
  resolvedAmbiguousRegionalControllerSamples: [],
  unresolvedAmbiguousRegionalControllerSamples: [],
  auditOnlySectorMatchCount: 0,
  missingAirportControllerCount: 0,
  missingAirportControllerSamples: [],
  icaoResolvedControllerCount: 0,
  iataResolvedControllerCount: 0,
  airportCount: 0,
  controllerCount: 0,
  airportCoverageFeatureCollection: {
    type: "FeatureCollection",
    features: []
  },
  regionalCoverageFeatureCollection: {
    type: "FeatureCollection",
    features: []
  },
  regionalCoverageOutlineFeatureCollection: {
    type: "FeatureCollection",
    features: []
  }
};

function normalizeSample(values, limit = 25) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }

  return values.slice(0, limit);
}

function normalizeControllerSample(controller) {
  return {
    callsign: String(controller?.callsign || "").trim(),
    regionId: String(controller?.regionId || "").trim(),
    kind: String(controller?.kind || "").trim()
  };
}

// Builds the compact summary that gets written to the persistent app log.
function buildVatsimLogSummary(snapshot = {}) {
  return {
    airportCount: snapshot.airportCount || 0,
    controllerCount: snapshot.controllerCount || 0,
    rawControllerCount: snapshot.rawControllerCount || 0,
    normalizedControllerCount: snapshot.normalizedControllerCount || 0,
    regionalControllerCount: snapshot.regionalControllerCount || 0,
    renderedRegionalControllerCount: snapshot.renderedRegionalControllerCount || 0,
    unmatchedRegionalControllerCount: snapshot.unmatchedRegionalControllerCount || 0,
    ambiguousRegionalControllerCount: snapshot.ambiguousRegionalControllerCount || 0,
    terminalRegionalControllerCount: snapshot.terminalRegionalControllerCount || 0,
    centerRegionalControllerCount: snapshot.centerRegionalControllerCount || 0,
    airportCoverageFeatureCount:
      snapshot.airportCoverageFeatureCollection?.features?.length || 0,
    regionalCoverageFeatureCount: snapshot.regionalCoverageFeatureCount || 0,
    updateTimestamp: snapshot.updateTimestamp || ""
  };
}

function buildVatsimDebugSnapshot(snapshot = {}) {
  const summary = buildVatsimLogSummary(snapshot);
  const includeGeometryDebug =
    typeof window !== "undefined" && Boolean(window.__DVA_ENABLE_VATSIM_GEO_DEBUG__);
  const airportIcaoSamples = normalizeSample(
    snapshot.airportCoverageFeatureCollection?.features
      ?.map((feature) => String(feature?.properties?.airportIcao || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const regionalControllerSamples = normalizeSample(
    snapshot.regionalControllers?.map(normalizeControllerSample)
  );

  const baseDebug = {
    ...summary,
    unsupportedControllerCount: snapshot.unsupportedControllerCount || 0,
    missingAirportControllerCount: snapshot.missingAirportControllerCount || 0,
    missingAirportControllerSamples: normalizeSample(snapshot.missingAirportControllerSamples),
    icaoResolvedControllerCount: snapshot.icaoResolvedControllerCount || 0,
    iataResolvedControllerCount: snapshot.iataResolvedControllerCount || 0,
    regionalCoverageOutlineFeatureCount:
      snapshot.regionalCoverageOutlineFeatureCount || 0,
    groupedRegionalCoverageFeatureCount:
      snapshot.groupedRegionalCoverageFeatureCount || 0,
    logicalRegionalDisplayGroupCount: snapshot.logicalRegionalDisplayGroupCount || 0,
    groupedRegionalComponentCount: snapshot.groupedRegionalComponentCount || 0,
    dissolvedRegionalCoverageFeatureCount:
      snapshot.dissolvedRegionalCoverageFeatureCount || 0,
    failedRegionalDissolveFeatureCount:
      snapshot.failedRegionalDissolveFeatureCount || 0,
    dissolvedRegionalPolygonPartReductionCount:
      snapshot.dissolvedRegionalPolygonPartReductionCount || 0,
    renderedRegionalControllerSamples: normalizeSample(
      snapshot.renderedRegionalControllerSamples
    ),
    unmatchedRegionalControllerSamples: normalizeSample(
      snapshot.unmatchedRegionalControllerSamples
    ),
    ambiguousRegionalControllerSamples: normalizeSample(
      snapshot.ambiguousRegionalControllerSamples
    ),
    resolvedAmbiguousRegionalControllerSamples: normalizeSample(
      snapshot.resolvedAmbiguousRegionalControllerSamples
    ),
    unresolvedAmbiguousRegionalControllerSamples: normalizeSample(
      snapshot.unresolvedAmbiguousRegionalControllerSamples
    ),
    airportIcaoSamples,
    regionalControllerSamples,
    renderedRegionalControllerCount: snapshot.renderedRegionalControllerCount || 0,
    unmatchedRegionalControllerCount: snapshot.unmatchedRegionalControllerCount || 0,
    ambiguousRegionalControllerCount: snapshot.ambiguousRegionalControllerCount || 0,
    resolvedAmbiguousRegionalControllerCount:
      snapshot.resolvedAmbiguousRegionalControllerCount || 0,
    unresolvedAmbiguousRegionalControllerCount:
      snapshot.unresolvedAmbiguousRegionalControllerCount || 0,
    terminalRegionalControllerCount: snapshot.terminalRegionalControllerCount || 0,
    centerRegionalControllerCount: snapshot.centerRegionalControllerCount || 0,
    terminalRegionalCoverageFeatureCount:
      snapshot.terminalRegionalCoverageFeatureCount || 0,
    centerRegionalCoverageFeatureCount:
      snapshot.centerRegionalCoverageFeatureCount || 0,
    auditOnlySectorMatchCount: snapshot.auditOnlySectorMatchCount || 0
  };

  if (!includeGeometryDebug) {
    return baseDebug;
  }

  return {
    ...baseDebug,
    airportFeatures: snapshot.airportCoverageFeatureCollection?.features || [],
    airportCoverageFeatureCollection:
      snapshot.airportCoverageFeatureCollection || {
        type: "FeatureCollection",
        features: []
      },
    regionalFeatures: snapshot.regionalCoverageFeatureCollection?.features || [],
    regionalCoverageFeatureCollection:
      snapshot.regionalCoverageFeatureCollection || {
        type: "FeatureCollection",
        features: []
      },
    regionalOutlineFeatures:
      snapshot.regionalCoverageOutlineFeatureCollection?.features || [],
    regionalCoverageOutlineFeatureCollection:
      snapshot.regionalCoverageOutlineFeatureCollection || {
        type: "FeatureCollection",
        features: []
      }
  };
}

// Owns the VATSIM fetch lifecycle, keeps the last successful snapshot in memory, and polls while enabled.
export function useVatsimNetwork(enabled, refreshVersion = 0) {
  const [networkSnapshot, setNetworkSnapshot] = useState(EMPTY_VATSIM_NETWORK);
  const [networkState, setNetworkState] = useState("idle");
  const [networkError, setNetworkError] = useState(null);
  const isFetchingRef = useRef(false);
  const intervalRef = useRef(0);
  const abortControllerRef = useRef(null);
  const lastLoggedUpdateTimestampRef = useRef("");
  const lastSuccessfulSnapshotRef = useRef(EMPTY_VATSIM_NETWORK);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = 0;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      isFetchingRef.current = false;
      return undefined;
    }

    let cancelled = false;

    const refreshVatsimNetwork = async () => {
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      setNetworkState((currentState) =>
        currentState === "ready" || currentState === "stale" ? "stale" : "loading"
      );

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const rawNetworkData = await fetchVatsimNetworkData({ signal: abortController.signal });
        if (cancelled || abortController.signal.aborted) {
          return;
        }

        const normalizedNetwork = buildVatsimAirportCoverage(rawNetworkData);
        lastSuccessfulSnapshotRef.current = normalizedNetwork;
        setNetworkSnapshot(normalizedNetwork);
        setNetworkError(null);
        setNetworkState("ready");

        if (import.meta.env.DEV && typeof window !== "undefined") {
          // Exposes lightweight diagnostics in dev builds and keeps geometry opt-in.
          window.__DVA_VATSIM_DEBUG__ = buildVatsimDebugSnapshot(normalizedNetwork);
        }

        if (normalizedNetwork.updateTimestamp !== lastLoggedUpdateTimestampRef.current) {
          lastLoggedUpdateTimestampRef.current = normalizedNetwork.updateTimestamp;
          logAppEvent(
            "vatsim-live-atc-updated",
            buildVatsimLogSummary(normalizedNetwork)
          ).catch(() => {});
        }
      } catch (error) {
        if (cancelled || abortController.signal.aborted) {
          return;
        }

        const normalizedError = error instanceof Error ? error : new Error(String(error));
        setNetworkState(
          lastSuccessfulSnapshotRef.current.airportCount > 0 ? "stale" : "error"
        );
        setNetworkError(normalizedError);

        const lastSnapshot = lastSuccessfulSnapshotRef.current;
        logAppError("vatsim-live-atc-refresh-failed", normalizedError, {
          ...buildVatsimLogSummary(lastSnapshot),
          networkState: lastSuccessfulSnapshotRef.current.airportCount > 0 ? "stale" : "error"
        }).catch(() => {});
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }

        isFetchingRef.current = false;
      }
    };

    void refreshVatsimNetwork();
    intervalRef.current = window.setInterval(() => {
      void refreshVatsimNetwork();
    }, VATSIM_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = 0;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      isFetchingRef.current = false;
    };
  }, [enabled, refreshVersion]);

  return {
    ...networkSnapshot,
    networkState,
    networkError
  };
}
