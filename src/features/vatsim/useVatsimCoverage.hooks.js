import { useMemo } from "react";
import { buildVatsimCoverageIndexFromRenderedFeatures } from "../../domain/vatsim/vatsimCoverage.js";
import { useVatsimNetwork } from "./useVatsimNetwork.hooks.js";

// Builds airport-level VATSIM coverage from the shared live ATC network snapshot.
export function useVatsimCoverage({ enabled, airportCatalog, refreshVersion } = {}) {
  const vatsimNetwork = useVatsimNetwork(Boolean(enabled), refreshVersion);
  const vatsimCoverageIndex = useMemo(
    () =>
      buildVatsimCoverageIndexFromRenderedFeatures({
        airportCatalog,
        airportCoverageFeatureCollection: vatsimNetwork.airportCoverageFeatureCollection,
        regionalCoverageFeatureCollection: vatsimNetwork.regionalCoverageFeatureCollection
      }),
    [
      airportCatalog,
      vatsimNetwork.airportCoverageFeatureCollection,
      vatsimNetwork.regionalCoverageFeatureCollection
    ]
  );

  return {
    ...vatsimNetwork,
    vatsimCoverageIndex
  };
}
