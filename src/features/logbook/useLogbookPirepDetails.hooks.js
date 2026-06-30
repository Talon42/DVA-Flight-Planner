import { useEffect, useRef, useState } from "react";
import { buildDvaPirepId } from "../../domain/logbook/logbook.model.js";
import { fetchDeltaVirtualPirepDetails } from "../../services/tauri/deltaVirtual.client.js";

const PIREP_DETAILS_DEBOUNCE_MS = 250;
const EMPTY_PIREP_DETAILS = {
  id: "",
  numericId: null,
  sourceUrl: "",
  payloadPassengers: "",
  payloadCargo: "",
  payloadRaw: "",
  departureRoute: "",
  flightRoute: "",
  arrivalRoute: "",
  routeSummary: "",
  departureRunway: "",
  departureRunwayRaw: "",
  arrivalRunway: "",
  arrivalRunwayRaw: "",
  fetchedAt: ""
};

const pirepDetailsCache = new Map();

function normalizeSelectedPirepId(selectedLogbookFlight) {
  const rawId =
    selectedLogbookFlight?.dvaPirepId ??
    selectedLogbookFlight?.rawLogbookId ??
    selectedLogbookFlight?.rawEntry?.logbookId ??
    selectedLogbookFlight?.rawEntry?.id ??
    "";
  return buildDvaPirepId(rawId);
}

function buildCachedDetails(details) {
  return {
    ...EMPTY_PIREP_DETAILS,
    ...details,
    id: String(details?.id || "").trim(),
    sourceUrl: String(details?.sourceUrl || "").trim(),
    fetchedAt: String(details?.fetchedAt || "").trim()
  };
}

// Owns the lazy Delta Virtual PIREP detail fetch for the selected logbook row.
export function useLogbookPirepDetails(selectedLogbookFlight, { enabled = true } = {}) {
  const [details, setDetails] = useState(EMPTY_PIREP_DETAILS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const pirepId = normalizeSelectedPirepId(selectedLogbookFlight);
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!enabled || !pirepId) {
      setDetails(EMPTY_PIREP_DETAILS);
      setIsLoading(false);
      setError("");
      return undefined;
    }

    const cachedDetails = pirepDetailsCache.get(pirepId);
    if (cachedDetails) {
      setDetails(buildCachedDetails(cachedDetails));
      setIsLoading(false);
      setError("");
      return undefined;
    }

    setDetails(EMPTY_PIREP_DETAILS);
    setIsLoading(true);
    setError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const fetchedDetails = await fetchDeltaVirtualPirepDetails(pirepId);
        if (requestIdRef.current !== requestId) {
          return;
        }

        const normalizedDetails = buildCachedDetails(fetchedDetails);
        pirepDetailsCache.set(pirepId, normalizedDetails);
        setDetails(normalizedDetails);
        setError("");
      } catch {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setDetails(EMPTY_PIREP_DETAILS);
        setError("PIREP details unavailable.");
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }, PIREP_DETAILS_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enabled, selectedLogbookFlight]);

  return {
    details,
    isLoading,
    error
  };
}
