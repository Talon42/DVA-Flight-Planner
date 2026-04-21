import { useEffect, useMemo, useRef, useState } from "react";
import Button from "../ui/Button";
import { cn } from "../ui/cn";
import { getAirportByIcao } from "../../lib/airportCatalog";
import { logAppError, logAppEvent } from "../../lib/appLog";
import { MAP_MODE_OPTIONS, resolveMapModeConfig } from "./mapModes";
import FlightMapView from "./FlightMapView";

const EMPTY_ROUTE_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

const ENDPOINT_NAME_MAX_LENGTH = 32;

function buildCoordinate(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return [longitude, latitude];
}

function appendCoordinate(coordinates, coordinate) {
  if (!Array.isArray(coordinate)) {
    return;
  }

  const lastCoordinate = coordinates.at(-1);
  if (
    lastCoordinate &&
    lastCoordinate[0] === coordinate[0] &&
    lastCoordinate[1] === coordinate[1]
  ) {
    return;
  }

  coordinates.push(coordinate);
}

function truncateAirportName(name, maxLength = ENDPOINT_NAME_MAX_LENGTH) {
  const trimmedName = String(name || "").trim();
  if (trimmedName.length <= maxLength) {
    return trimmedName;
  }

  return trimmedName.slice(0, maxLength);
}

function buildEndpointKey(boardEntryId, flightId, kind) {
  return `${String(boardEntryId || flightId || "").trim() || "endpoint"}:${kind}`;
}

function buildEndpointLabels(entries) {
  const labels = [];

  for (const entry of entries || []) {
    const boardEntryId = String(entry?.boardEntryId || "").trim() || null;
    const flightId = String(entry?.flightId || "").trim() || null;

    for (const [icao, kind] of [
      [entry?.from, "origin"],
      [entry?.to, "destination"]
    ]) {
      const normalizedIcao = String(icao || "").trim().toUpperCase();
      if (!normalizedIcao) {
        continue;
      }

      const airport = getAirportByIcao(normalizedIcao);
      if (!Number.isFinite(airport?.longitude) || !Number.isFinite(airport?.latitude)) {
        continue;
      }

      labels.push({
        id: buildEndpointKey(boardEntryId, flightId, kind),
        boardEntryId,
        flightId,
        kind,
        icao: normalizedIcao,
        airportName: truncateAirportName(airport?.name || normalizedIcao),
        longitude: airport.longitude,
        latitude: airport.latitude
      });
    }
  }

  return labels;
}

function buildSimBriefRouteCoordinates(entry) {
  const fromAirport = getAirportByIcao(entry?.from);
  const toAirport = getAirportByIcao(entry?.to);
  const coordinates = [];
  const routePoints = Array.isArray(entry?.simbriefPlan?.routePoints)
    ? entry.simbriefPlan.routePoints
    : [];

  const originCoordinate = buildCoordinate(fromAirport?.longitude, fromAirport?.latitude);
  const destinationCoordinate = buildCoordinate(toAirport?.longitude, toAirport?.latitude);

  if (originCoordinate) {
    appendCoordinate(coordinates, originCoordinate);
  }

  for (const point of routePoints) {
    const routeCoordinate = buildCoordinate(point?.longitude, point?.latitude);
    if (routeCoordinate) {
      appendCoordinate(coordinates, routeCoordinate);
    }
  }

  if (destinationCoordinate) {
    appendCoordinate(coordinates, destinationCoordinate);
  }

  return coordinates.length >= 2 ? coordinates : null;
}

function buildRouteFeatures(entry, routeCoordinates = null) {
  const fromAirport = getAirportByIcao(entry?.from);
  const toAirport = getAirportByIcao(entry?.to);
  const fromLongitude = fromAirport?.longitude;
  const fromLatitude = fromAirport?.latitude;
  const toLongitude = toAirport?.longitude;
  const toLatitude = toAirport?.latitude;
  const hasRouteCoordinates =
    Array.isArray(routeCoordinates) && routeCoordinates.length >= 2;
  const lineCoordinates = hasRouteCoordinates
    ? routeCoordinates
    : [
        [fromLongitude, fromLatitude],
        [toLongitude, toLatitude]
      ];

  if (!hasRouteCoordinates) {
    if (
      !Number.isFinite(fromLongitude) ||
      !Number.isFinite(fromLatitude) ||
      !Number.isFinite(toLongitude) ||
      !Number.isFinite(toLatitude)
    ) {
      return null;
    }
  }

  if (!Array.isArray(lineCoordinates) || lineCoordinates.length < 2) {
    return null;
  }

  const features = {
    route: {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: lineCoordinates
      },
      properties: {
        boardEntryId: String(entry?.boardEntryId || "").trim() || null,
        flightId: String(entry?.flightId || "").trim() || null,
        linkedFlightId: String(entry?.linkedFlightId || "").trim() || null,
        role: "route"
      }
    }
  };

  if (Number.isFinite(fromLongitude) && Number.isFinite(fromLatitude)) {
    features.origin = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [fromLongitude, fromLatitude]
      },
      properties: {
        endpointKey: buildEndpointKey(entry?.boardEntryId, entry?.flightId, "origin"),
        boardEntryId: String(entry?.boardEntryId || "").trim() || null,
        flightId: String(entry?.flightId || "").trim() || null,
        linkedFlightId: String(entry?.linkedFlightId || "").trim() || null,
        role: "endpoint",
        endpointType: "origin"
      }
    };
  }

  if (Number.isFinite(toLongitude) && Number.isFinite(toLatitude)) {
    features.destination = {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [toLongitude, toLatitude]
      },
      properties: {
        endpointKey: buildEndpointKey(entry?.boardEntryId, entry?.flightId, "destination"),
        boardEntryId: String(entry?.boardEntryId || "").trim() || null,
        flightId: String(entry?.flightId || "").trim() || null,
        linkedFlightId: String(entry?.linkedFlightId || "").trim() || null,
        role: "endpoint",
        endpointType: "destination"
      }
    };
  }

  return features;
}

export default function FlightMapPanel({
  theme,
  activeFlightBoardEntries = [],
  expandedBoardFlightId = null,
  initialFlightPathViewMode = "all"
}) {
  const [mapMode, setMapMode] = useState("standard");
  const [flightPathViewMode, setFlightPathViewMode] = useState(
    initialFlightPathViewMode === "selected" ? "selected" : "all"
  );
  const [satelliteOverlay, setSatelliteOverlay] = useState(false);
  const [radarEnabled, setRadarEnabled] = useState(false);
  const [labelsEnabled, setLabelsEnabled] = useState(true);
  const lastRouteLogSignatureRef = useRef("");
  const isDarkTheme = theme === "dark";

  useEffect(() => {
    if (initialFlightPathViewMode !== "selected") {
      return;
    }

    setFlightPathViewMode("selected");
  }, [initialFlightPathViewMode]);

  const mapConfig = useMemo(
    () => resolveMapModeConfig(mapMode, theme),
    [mapMode, theme]
  );
  const normalizedExpandedBoardFlightId = String(expandedBoardFlightId || "").trim();
  const selectedEntry = useMemo(
    () =>
      activeFlightBoardEntries.find((entry) => {
        const boardEntryId = String(entry?.boardEntryId || "").trim();
        return boardEntryId === normalizedExpandedBoardFlightId;
      }) || null,
    [activeFlightBoardEntries, normalizedExpandedBoardFlightId]
  );
  const visibleFlightBoardEntries = useMemo(() => {
    if (flightPathViewMode === "selected") {
      return selectedEntry ? [selectedEntry] : [];
    }

    return activeFlightBoardEntries;
  }, [activeFlightBoardEntries, flightPathViewMode, selectedEntry]);
  const endpointLabels = useMemo(
    () => buildEndpointLabels(visibleFlightBoardEntries),
    [visibleFlightBoardEntries]
  );
  const allFlightPathGeoJson = useMemo(() => {
    const features = [];

    for (const entry of activeFlightBoardEntries) {
      const feature = buildRouteFeatures(entry);
      if (feature) {
        features.push(feature.route);
        if (feature.origin) {
          features.push(feature.origin);
        }
        if (feature.destination) {
          features.push(feature.destination);
        }
      }
    }

    return features.length
      ? {
          type: "FeatureCollection",
          features
        }
      : EMPTY_ROUTE_FEATURE_COLLECTION;
  }, [activeFlightBoardEntries]);
  const selectedFlightPathGeoJson = useMemo(() => {
    const selectedRouteCoordinates = selectedEntry
      ? buildSimBriefRouteCoordinates(selectedEntry)
      : null;
    const selectedFeature = selectedEntry
      ? buildRouteFeatures(selectedEntry, selectedRouteCoordinates)
      : null;

    return selectedFeature
      ? {
          type: "FeatureCollection",
          features: [
            selectedFeature.route,
            selectedFeature.origin,
            selectedFeature.destination
          ].filter(Boolean)
        }
      : EMPTY_ROUTE_FEATURE_COLLECTION;
  }, [selectedEntry]);
  const flightPathGeoJson =
    flightPathViewMode === "selected" ? selectedFlightPathGeoJson : allFlightPathGeoJson;

  useEffect(() => {
    if (flightPathViewMode !== "selected" || !selectedEntry) {
      return;
    }

    const routePointCount = Array.isArray(selectedEntry?.simbriefPlan?.routePoints)
      ? selectedEntry.simbriefPlan.routePoints.length
      : 0;
    const hasRenderedRoute =
      Array.isArray(selectedFlightPathGeoJson?.features) &&
      selectedFlightPathGeoJson.features.length > 0;
    const signature = [
      selectedEntry.boardEntryId,
      routePointCount,
      hasRenderedRoute ? "rendered" : "missing"
    ].join(":");

    if (lastRouteLogSignatureRef.current === signature) {
      return;
    }

    lastRouteLogSignatureRef.current = signature;

    if (hasRenderedRoute) {
      logAppEvent("simbrief-route-rendered", {
        boardEntryId: selectedEntry.boardEntryId,
        flightId: selectedEntry.flightId || selectedEntry.linkedFlightId || ""
      }).catch(() => {});
      return;
    }

    if (routePointCount > 0) {
      logAppError("simbrief-route-render-failed", new Error("No valid route coordinates found."), {
        boardEntryId: selectedEntry.boardEntryId,
        flightId: selectedEntry.flightId || selectedEntry.linkedFlightId || ""
      }).catch(() => {});
    }
  }, [flightPathViewMode, selectedEntry, selectedFlightPathGeoJson]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-none border border-[color:var(--line)] bg-[var(--surface-soft)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {MAP_MODE_OPTIONS.map((option) => {
            const isActive = mapMode === option.value;

            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="ghost"
                active={isActive}
                aria-pressed={isActive}
                className={cn(
                  "min-w-24 px-3",
                  isDarkTheme && !isActive && "!bg-[#081424] !text-white hover:!bg-[#0b1b36]"
                )}
                onClick={() => setMapMode(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { value: "all", label: "Show All" },
            { value: "selected", label: "Show Selected" }
          ].map((option) => {
            const isActive = flightPathViewMode === option.value;

            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="ghost"
                active={isActive}
                aria-pressed={isActive}
                className={cn(
                  "min-w-28 px-3",
                  isDarkTheme && !isActive && "!bg-[#081424] !text-white hover:!bg-[#0b1b36]"
                )}
                onClick={() => setFlightPathViewMode(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      <FlightMapView
        mapStyle={mapConfig.mapStyle}
        projection={mapConfig.projection}
        flightPathGeoJson={flightPathGeoJson}
        endpointLabels={endpointLabels}
        endpointPopupMode={flightPathViewMode === "selected" ? "persistent" : "hover"}
        fitToRoute={flightPathViewMode === "selected"}
        labelsEnabled={labelsEnabled}
        satelliteOverlay={satelliteOverlay}
        radarEnabled={radarEnabled}
        onToggleSatellite={() => setSatelliteOverlay((current) => !current)}
        onToggleRadar={() => setRadarEnabled((current) => !current)}
        onToggleLabels={() => setLabelsEnabled((current) => !current)}
        theme={theme}
      />
    </div>
  );
}
