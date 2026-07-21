import { useEffect, useMemo, useRef, useState } from "react";
import { buildDvaPirepId } from "../../domain/logbook/logbook.model.js";
import { fetchDeltaVirtualPirepDetails } from "../../services/tauri/deltaVirtual.client.js";

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
const inFlightPirepDetailsRequests = new Map();

// Normalizes a logbook row or selected-flight object into the DVA PIREP id used by the detail fetch.
export function buildLogbookPirepId(selectedLogbookFlight) {
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

function getCachedPirepDetails(pirepId) {
  const cachedDetails = pirepDetailsCache.get(pirepId);
  return cachedDetails ? buildCachedDetails(cachedDetails) : null;
}

function getOrFetchPirepDetails(pirepId) {
  const cachedDetails = getCachedPirepDetails(pirepId);
  if (cachedDetails) {
    return Promise.resolve(cachedDetails);
  }

  const inFlightRequest = inFlightPirepDetailsRequests.get(pirepId);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const requestPromise = (async () => {
    try {
      const fetchedDetails = await fetchDeltaVirtualPirepDetails(pirepId);
      const normalizedDetails = buildCachedDetails(fetchedDetails);
      pirepDetailsCache.set(pirepId, normalizedDetails);
      return normalizedDetails;
    } finally {
      inFlightPirepDetailsRequests.delete(pirepId);
    }
  })();

  inFlightPirepDetailsRequests.set(pirepId, requestPromise);
  return requestPromise;
}

function areShallowObjectsEqual(left, right) {
  if (left === right) {
    return true;
  }

  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.is(left?.[key], right?.[key]))
  );
}

function arePirepDetailMapsEqual(left, right) {
  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (pirepId) =>
        Object.prototype.hasOwnProperty.call(right || {}, pirepId) &&
        areShallowObjectsEqual(left[pirepId], right[pirepId])
    )
  );
}

// Owns the lazy Delta Virtual PIREP detail fetch for the selected logbook row.
export function useLogbookPirepDetails(selectedLogbookFlight, { enabled = true } = {}) {
  const [details, setDetails] = useState(EMPTY_PIREP_DETAILS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const pirepId = buildLogbookPirepId(selectedLogbookFlight);
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!enabled || !pirepId) {
      setDetails(EMPTY_PIREP_DETAILS);
      setIsLoading(false);
      setError("");
      return undefined;
    }

    const cachedDetails = getCachedPirepDetails(pirepId);
    if (cachedDetails) {
      setDetails(cachedDetails);
      setIsLoading(false);
      setError("");
      return undefined;
    }

    setDetails(EMPTY_PIREP_DETAILS);
    setIsLoading(true);
    setError("");

    const requestPromise = getOrFetchPirepDetails(pirepId);

    void requestPromise
      .then((fetchedDetails) => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setDetails(fetchedDetails);
        setError("");
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        setDetails(EMPTY_PIREP_DETAILS);
        setError("PIREP details unavailable.");
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      });

    return undefined;
  }, [enabled, selectedLogbookFlight]);

  return {
    details,
    isLoading,
    error
  };
}

// Hydrates only the currently visible logbook rows with cached/fetched PIREP details.
export function useVisibleLogbookPirepDetails(logbookFlights, { enabled = true, limit = 0 } = {}) {
  const [detailsByPirepId, setDetailsByPirepId] = useState({});
  const requestIdRef = useRef(0);
  const visiblePirepIds = useMemo(() => {
    const candidateRows = Array.isArray(logbookFlights) ? logbookFlights : [];
    const visibleRows = limit > 0 ? candidateRows.slice(0, limit) : candidateRows;
    return [...new Set(visibleRows.map((row) => buildLogbookPirepId(row)).filter(Boolean))];
  }, [limit, logbookFlights]);
  const visiblePirepIdSignature = visiblePirepIds.join("\u001f");

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const pirepIds = visiblePirepIdSignature ? visiblePirepIdSignature.split("\u001f") : [];

    if (!enabled || !pirepIds.length) {
      setDetailsByPirepId((current) => (Object.keys(current).length > 0 ? {} : current));
      return undefined;
    }

    const nextCachedDetails = {};
    const missingPirepIds = [];

    for (const pirepId of pirepIds) {
      const cachedDetails = getCachedPirepDetails(pirepId);
      if (cachedDetails) {
        nextCachedDetails[pirepId] = cachedDetails;
      } else {
        missingPirepIds.push(pirepId);
      }
    }

    setDetailsByPirepId((current) =>
      arePirepDetailMapsEqual(current, nextCachedDetails) ? current : nextCachedDetails
    );

    if (!missingPirepIds.length) {
      return undefined;
    }

    void Promise.all(
      missingPirepIds.map((pirepId) =>
        getOrFetchPirepDetails(pirepId)
          .then((details) => [pirepId, details])
          .catch(() => [pirepId, null])
      )
    ).then((results) => {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setDetailsByPirepId((current) => {
        const nextValue = { ...current };

        for (const [pirepId, details] of results) {
          if (details) {
            nextValue[pirepId] = details;
          }
        }

        return arePirepDetailMapsEqual(current, nextValue) ? current : nextValue;
      });
    });

    return () => {
      if (requestIdRef.current === requestId) {
        requestIdRef.current += 1;
      }
    };
  }, [enabled, visiblePirepIdSignature]);

  return detailsByPirepId;
}
