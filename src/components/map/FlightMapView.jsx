import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, NavigationControl, Source } from "react-map-gl/maplibre";
import Button from "../ui/Button";
import { cn } from "../ui/cn";
import { setLabelLayerTextLanguage, setLabelLayerVisibility } from "./mapTheme";

const INITIAL_VIEW_STATE = {
  longitude: -96,
  latitude: 38,
  zoom: 3.25,
  bearing: 0,
  pitch: 0
};

const RADAR_SOURCE_ID = "rainviewer-radar";
const RADAR_LAYER_ID = "rainviewer-radar-layer";
const RADAR_OPACITY = 0.72;
const SATELLITE_SOURCE_ID = "esri-world-imagery";
const SATELLITE_LAYER_ID = "esri-world-imagery-layer";
const ROUTE_SOURCE_ID = "flight-path-overlay";
const ROUTE_LAYER_ID = "flight-path-overlay-line";
const ROUTE_ENDPOINT_RING_LAYER_ID = "flight-path-overlay-endpoint-ring";
const ROUTE_ENDPOINT_DOT_LAYER_ID = "flight-path-overlay-endpoint-dot";
const ROUTE_ENDPOINT_HOVER_LAYER_ID = "flight-path-overlay-endpoint-hover";
const ROUTE_LINE_COLOR = "#c8102e";
const ROUTE_ENDPOINT_RING_COLOR = "rgba(255,255,255,0.92)";
const ROUTE_ENDPOINT_RING_STROKE_COLOR = "#c8102e";
const ROUTE_ENDPOINT_DOT_COLOR = "#c8102e";
const ROUTE_ENDPOINT_RING_RADIUS = 6.5;
const ROUTE_ENDPOINT_DOT_RADIUS = 3;
const ROUTE_ENDPOINT_HOVER_RADIUS = 14;
const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const ROUTE_LINE_LAYER = {
  id: ROUTE_LAYER_ID,
  type: "line",
  source: ROUTE_SOURCE_ID,
  filter: ["==", ["get", "role"], "route"],
  paint: {
    "line-color": ROUTE_LINE_COLOR,
    "line-width": 2.75,
    "line-opacity": 0.92
  },
  layout: {
    "line-cap": "round",
    "line-join": "round"
  }
};

const ROUTE_ENDPOINT_RING_LAYER = {
  id: ROUTE_ENDPOINT_RING_LAYER_ID,
  type: "circle",
  source: ROUTE_SOURCE_ID,
  filter: ["==", ["get", "role"], "endpoint"],
  paint: {
    "circle-radius": ROUTE_ENDPOINT_RING_RADIUS,
    "circle-color": ROUTE_ENDPOINT_RING_COLOR,
    "circle-stroke-color": ROUTE_ENDPOINT_RING_STROKE_COLOR,
    "circle-stroke-width": 1.5
  }
};

const ROUTE_ENDPOINT_DOT_LAYER = {
  id: ROUTE_ENDPOINT_DOT_LAYER_ID,
  type: "circle",
  source: ROUTE_SOURCE_ID,
  filter: ["==", ["get", "role"], "endpoint"],
  paint: {
    "circle-radius": ROUTE_ENDPOINT_DOT_RADIUS,
    "circle-color": ROUTE_ENDPOINT_DOT_COLOR
  }
};

const ROUTE_ENDPOINT_HOVER_LAYER = {
  id: ROUTE_ENDPOINT_HOVER_LAYER_ID,
  type: "circle",
  source: ROUTE_SOURCE_ID,
  filter: ["==", ["get", "role"], "endpoint"],
  paint: {
    "circle-radius": ROUTE_ENDPOINT_HOVER_RADIUS,
    "circle-color": "#ffffff",
    "circle-opacity": 0
  }
};

function getRadarTileUrl(apiData) {
  const frame = apiData?.radar?.past?.at?.(-1);
  if (!apiData?.host || !frame?.path) {
    return null;
  }

  return `${apiData.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
}

const ENDPOINT_CALLOUT_WIDTH = 220;
const ENDPOINT_CALLOUT_HEIGHT = 48;
const ENDPOINT_CALLOUT_GAP = 12;
const ENDPOINT_CALLOUT_EDGE_PADDING = 8;
const ENDPOINT_CALLOUT_MIN_POINT_CLEARANCE = 14;
const ENDPOINT_CALLOUT_MIN_ROUTE_CLEARANCE = 10;

function toScreenPoint(map, longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  const projected = map?.project?.([longitude, latitude]);
  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    return null;
  }

  return {
    x: projected.x,
    y: projected.y
  };
}

function createRect(left, top, width = ENDPOINT_CALLOUT_WIDTH, height = ENDPOINT_CALLOUT_HEIGHT) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height
  };
}

function clampRectToViewport(rect, viewportWidth, viewportHeight) {
  const maxLeft = Math.max(ENDPOINT_CALLOUT_EDGE_PADDING, viewportWidth - ENDPOINT_CALLOUT_EDGE_PADDING - ENDPOINT_CALLOUT_WIDTH);
  const maxTop = Math.max(ENDPOINT_CALLOUT_EDGE_PADDING, viewportHeight - ENDPOINT_CALLOUT_EDGE_PADDING - ENDPOINT_CALLOUT_HEIGHT);

  const left = Math.min(Math.max(rect.left, ENDPOINT_CALLOUT_EDGE_PADDING), maxLeft);
  const top = Math.min(Math.max(rect.top, ENDPOINT_CALLOUT_EDGE_PADDING), maxTop);

  return {
    left,
    top,
    right: left + ENDPOINT_CALLOUT_WIDTH,
    bottom: top + ENDPOINT_CALLOUT_HEIGHT
  };
}

function pointToRectDistance(point, rect) {
  const clampedX = Math.min(Math.max(point.x, rect.left), rect.right);
  const clampedY = Math.min(Math.max(point.y, rect.top), rect.bottom);
  return Math.hypot(point.x - clampedX, point.y - clampedY);
}

function pointToSegmentDistance(point, a, b) {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abLengthSquared = abX * abX + abY * abY;
  if (abLengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const apX = point.x - a.x;
  const apY = point.y - a.y;
  const t = Math.min(1, Math.max(0, (apX * abX + apY * abY) / abLengthSquared));
  const closestX = a.x + abX * t;
  const closestY = a.y + abY * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-9) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function isPointOnSegment(a, b, c) {
  return (
    c.x <= Math.max(a.x, b.x) &&
    c.x >= Math.min(a.x, b.x) &&
    c.y <= Math.max(a.y, b.y) &&
    c.y >= Math.min(a.y, b.y)
  );
}

function segmentsIntersect(p1, q1, p2, q2) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && isPointOnSegment(p1, q1, p2)) return true;
  if (o2 === 0 && isPointOnSegment(p1, q1, q2)) return true;
  if (o3 === 0 && isPointOnSegment(p2, q2, p1)) return true;
  if (o4 === 0 && isPointOnSegment(p2, q2, q1)) return true;

  return false;
}

function segmentToSegmentDistance(a1, a2, b1, b2) {
  if (segmentsIntersect(a1, a2, b1, b2)) {
    return 0;
  }

  return Math.min(
    pointToSegmentDistance(a1, b1, b2),
    pointToSegmentDistance(a2, b1, b2),
    pointToSegmentDistance(b1, a1, a2),
    pointToSegmentDistance(b2, a1, a2)
  );
}

function segmentToRectDistance(a, b, rect) {
  if (
    a.x >= rect.left &&
    a.x <= rect.right &&
    a.y >= rect.top &&
    a.y <= rect.bottom
  ) {
    return 0;
  }

  if (
    b.x >= rect.left &&
    b.x <= rect.right &&
    b.y >= rect.top &&
    b.y <= rect.bottom
  ) {
    return 0;
  }

  const topLeft = { x: rect.left, y: rect.top };
  const topRight = { x: rect.right, y: rect.top };
  const bottomRight = { x: rect.right, y: rect.bottom };
  const bottomLeft = { x: rect.left, y: rect.bottom };

  return Math.min(
    segmentToSegmentDistance(a, b, topLeft, topRight),
    segmentToSegmentDistance(a, b, topRight, bottomRight),
    segmentToSegmentDistance(a, b, bottomRight, bottomLeft),
    segmentToSegmentDistance(a, b, bottomLeft, topLeft),
    pointToRectDistance(a, rect),
    pointToRectDistance(b, rect)
  );
}

function rectsOverlap(a, b) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

function buildProjectedRouteSegments(map, featureCollection) {
  const segments = [];

  for (const feature of featureCollection?.features || []) {
    if (feature?.properties?.role !== "route") {
      continue;
    }

    const geometry = feature?.geometry;
    if (geometry?.type === "LineString") {
      const coordinates = geometry.coordinates || [];
      let previousPoint = null;

      for (const coordinate of coordinates) {
        if (!Array.isArray(coordinate) || coordinate.length < 2) {
          continue;
        }

        const currentPoint = toScreenPoint(map, coordinate[0], coordinate[1]);
        if (!currentPoint) {
          continue;
        }

        if (previousPoint) {
          segments.push([previousPoint, currentPoint]);
        }

        previousPoint = currentPoint;
      }
    } else if (geometry?.type === "MultiLineString") {
      for (const line of geometry.coordinates || []) {
        let previousPoint = null;

        for (const coordinate of line || []) {
          if (!Array.isArray(coordinate) || coordinate.length < 2) {
            continue;
          }

          const currentPoint = toScreenPoint(map, coordinate[0], coordinate[1]);
          if (!currentPoint) {
            continue;
          }

          if (previousPoint) {
            segments.push([previousPoint, currentPoint]);
          }

          previousPoint = currentPoint;
        }
      }
    }
  }

  return segments;
}

function buildCalloutRectangles(point) {
  const halfWidth = ENDPOINT_CALLOUT_WIDTH / 2;
  const gap = ENDPOINT_CALLOUT_GAP;

  return [
    { placement: "north", rect: createRect(point.x - halfWidth, point.y - ENDPOINT_CALLOUT_HEIGHT - gap) },
    { placement: "north-east", rect: createRect(point.x + gap, point.y - ENDPOINT_CALLOUT_HEIGHT - gap) },
    { placement: "east", rect: createRect(point.x + gap, point.y - ENDPOINT_CALLOUT_HEIGHT / 2) },
    { placement: "south-east", rect: createRect(point.x + gap, point.y + gap) },
    { placement: "south", rect: createRect(point.x - halfWidth, point.y + gap) },
    { placement: "south-west", rect: createRect(point.x - ENDPOINT_CALLOUT_WIDTH - gap, point.y + gap) },
    { placement: "west", rect: createRect(point.x - ENDPOINT_CALLOUT_WIDTH - gap, point.y - ENDPOINT_CALLOUT_HEIGHT / 2) },
    { placement: "north-west", rect: createRect(point.x - ENDPOINT_CALLOUT_WIDTH - gap, point.y - ENDPOINT_CALLOUT_HEIGHT - gap) }
  ];
}

function chooseCalloutPlacement(point, routeSegments, viewportWidth, viewportHeight, blockedRects = []) {
  const candidates = buildCalloutRectangles(point);
  const bestScore = (candidate, rect) => {
    const clampedRect = clampRectToViewport(rect, viewportWidth, viewportHeight);
    const edgeMargin = Math.min(
      clampedRect.left - ENDPOINT_CALLOUT_EDGE_PADDING,
      clampedRect.top - ENDPOINT_CALLOUT_EDGE_PADDING,
      viewportWidth - ENDPOINT_CALLOUT_EDGE_PADDING - (clampedRect.left + ENDPOINT_CALLOUT_WIDTH),
      viewportHeight - ENDPOINT_CALLOUT_EDGE_PADDING - (clampedRect.top + ENDPOINT_CALLOUT_HEIGHT)
    );

    const pointDistance = pointToRectDistance(point, clampedRect);
    let routeDistance = Number.POSITIVE_INFINITY;

    for (const [a, b] of routeSegments) {
      routeDistance = Math.min(routeDistance, segmentToRectDistance(a, b, clampedRect));
      if (routeDistance === 0) {
        break;
      }
    }

    let blockedOverlapCount = 0;
    for (const blockedRect of blockedRects) {
      if (rectsOverlap(clampedRect, blockedRect)) {
        blockedOverlapCount += 1;
      }
    }

    const isWithinViewport = edgeMargin >= 0;
    const isClearEnough =
      pointDistance >= ENDPOINT_CALLOUT_MIN_POINT_CLEARANCE &&
      routeDistance >= ENDPOINT_CALLOUT_MIN_ROUTE_CLEARANCE &&
      blockedOverlapCount === 0;

    return {
      placement: candidate.placement,
      left: clampedRect.left,
      top: clampedRect.top,
      routeDistance,
      pointDistance,
      edgeMargin,
      blockedOverlapCount,
      isWithinViewport,
      isClearEnough,
      score:
        routeDistance * 1000 +
        pointDistance * 100 +
        Math.max(edgeMargin, -1000) -
        blockedOverlapCount * 5000
    };
  };

  let bestValid = null;
  let bestFallback = null;

  for (const candidate of candidates) {
    const metrics = bestScore(candidate, candidate.rect);
    if (!bestFallback || metrics.score > bestFallback.score) {
      bestFallback = metrics;
    }

    if (metrics.isWithinViewport && metrics.isClearEnough) {
      if (!bestValid || metrics.score > bestValid.score) {
        bestValid = metrics;
      }
    }
  }

  return bestValid || bestFallback || null;
}

function extendBounds(bounds, coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) {
    return;
  }

  const [longitude, latitude] = coordinate;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return;
  }

  if (bounds.minLongitude === null || longitude < bounds.minLongitude) {
    bounds.minLongitude = longitude;
  }

  if (bounds.minLatitude === null || latitude < bounds.minLatitude) {
    bounds.minLatitude = latitude;
  }

  if (bounds.maxLongitude === null || longitude > bounds.maxLongitude) {
    bounds.maxLongitude = longitude;
  }

  if (bounds.maxLatitude === null || latitude > bounds.maxLatitude) {
    bounds.maxLatitude = latitude;
  }
}

function visitCoordinates(coordinates, visitor) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    visitor(coordinates);
    return;
  }

  for (const item of coordinates) {
    visitCoordinates(item, visitor);
  }
}

function getFeatureCollectionBounds(featureCollection) {
  const bounds = {
    minLongitude: null,
    minLatitude: null,
    maxLongitude: null,
    maxLatitude: null
  };

  for (const feature of featureCollection?.features || []) {
    visitCoordinates(feature?.geometry?.coordinates, (coordinate) => {
      extendBounds(bounds, coordinate);
    });
  }

  if (
    bounds.minLongitude === null ||
    bounds.minLatitude === null ||
    bounds.maxLongitude === null ||
    bounds.maxLatitude === null
  ) {
    return null;
  }

  return [
    [bounds.minLongitude, bounds.minLatitude],
    [bounds.maxLongitude, bounds.maxLatitude]
  ];
}

function LayerToggleSwitch({ enabled }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-[18px] w-9 shrink-0 items-center rounded-full border p-[2px] transition-colors duration-150",
        enabled
          ? "border-[color:rgba(200,16,46,0.45)] bg-[var(--delta-red)]"
          : "border-[color:var(--line-strong)] bg-[var(--action-bg)] dark:border-[color:rgba(255,255,255,0.18)] dark:bg-[rgba(255,255,255,0.08)]"
      )}
    >
      <span
        className={cn(
          "h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150",
          enabled ? "translate-x-[18px]" : "translate-x-0"
        )}
      />
    </span>
  );
}

function LayerToggleRow({ label, enabled, isDarkTheme, onClick }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      active={enabled}
      aria-pressed={enabled}
      className={cn(
        "w-full min-w-0 justify-between px-3",
        isDarkTheme && !enabled && "!bg-[#081424] !text-white hover:!bg-[#0b1b36]"
      )}
      onClick={onClick}
    >
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <LayerToggleSwitch enabled={enabled} />
    </Button>
  );
}

export default function FlightMapView({
  mapStyle,
  projection,
  flightPathGeoJson,
  endpointLabels = [],
  endpointPopupMode = "hover",
  fitToRoute = false,
  labelsEnabled,
  satelliteOverlay,
  radarEnabled,
  onToggleSatellite,
  onToggleRadar,
  onToggleLabels,
  theme
}) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const syncGenerationRef = useRef(0);
  const lastMapStyleRef = useRef(mapStyle);
  const lastProjectionRef = useRef(projection);
  const pendingStyleSyncRef = useRef(false);
  const lastRouteFitSignatureRef = useRef("");
  const calloutAnimationFrameRef = useRef(0);
  const [hoveredEndpointKey, setHoveredEndpointKey] = useState(null);
  const [hoveredEndpointCallout, setHoveredEndpointCallout] = useState(null);
  const [persistentEndpointCallouts, setPersistentEndpointCallouts] = useState([]);
  const isDarkTheme = theme === "dark";
  const hasFlightPathFeatures = Boolean(flightPathGeoJson?.features?.length);
  const routeBounds = useMemo(() => getFeatureCollectionBounds(flightPathGeoJson), [flightPathGeoJson]);
  const isPersistentEndpointPopupMode = endpointPopupMode === "persistent";
  const hoveredEndpointLabel = useMemo(() => {
    if (isPersistentEndpointPopupMode || !hoveredEndpointKey) {
      return null;
    }

    return (
      endpointLabels.find((label) => label?.id === hoveredEndpointKey) ||
      null
    );
  }, [endpointLabels, hoveredEndpointKey, isPersistentEndpointPopupMode]);

  const resizeMap = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) {
      return;
    }

    map.resize();
  }, []);

  const lockNorthUp = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) {
      return;
    }

    // Keep the map north-up and remove every rotation path the library exposes.
    map.setBearing(0);
    map.setPitch(0);
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.touchPitch.disable();
  }, []);

  const updateHoveredEndpointCallout = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    const container = containerRef.current;
    if (!map || !container || !map.isStyleLoaded?.() || !hoveredEndpointLabel) {
      setHoveredEndpointCallout(null);
      return;
    }

    const canvas = map.getCanvas?.();
    const viewportWidth = canvas?.clientWidth || container.clientWidth;
    const viewportHeight = canvas?.clientHeight || container.clientHeight;
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
      setHoveredEndpointCallout(null);
      return;
    }

    const routeSegments = buildProjectedRouteSegments(map, flightPathGeoJson);
    const point = toScreenPoint(map, hoveredEndpointLabel.longitude, hoveredEndpointLabel.latitude);
    if (!point) {
      setHoveredEndpointCallout(null);
      return;
    }

    const placement = chooseCalloutPlacement(point, routeSegments, viewportWidth, viewportHeight);
    if (!placement) {
      setHoveredEndpointCallout(null);
      return;
    }

    setHoveredEndpointCallout({
      ...hoveredEndpointLabel,
      placement: placement.placement,
      left: placement.left,
      top: placement.top
    });
  }, [flightPathGeoJson, hoveredEndpointLabel]);

  const updatePersistentEndpointCallouts = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    const container = containerRef.current;
    if (!map || !container || !map.isStyleLoaded?.() || !isPersistentEndpointPopupMode) {
      setPersistentEndpointCallouts([]);
      return;
    }

    if (!Array.isArray(endpointLabels) || endpointLabels.length === 0) {
      setPersistentEndpointCallouts([]);
      return;
    }

    const canvas = map.getCanvas?.();
    const viewportWidth = canvas?.clientWidth || container.clientWidth;
    const viewportHeight = canvas?.clientHeight || container.clientHeight;
    if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight) || viewportWidth <= 0 || viewportHeight <= 0) {
      setPersistentEndpointCallouts([]);
      return;
    }

    const routeSegments = buildProjectedRouteSegments(map, flightPathGeoJson);
    const nextCallouts = [];
    const blockedRects = [];

    for (const label of endpointLabels) {
      const point = toScreenPoint(map, label?.longitude, label?.latitude);
      if (!point) {
        continue;
      }

      const placement = chooseCalloutPlacement(
        point,
        routeSegments,
        viewportWidth,
        viewportHeight,
        blockedRects
      );
      if (!placement) {
        continue;
      }

      const rect = createRect(placement.left, placement.top);
      blockedRects.push(rect);

      nextCallouts.push({
        ...label,
        placement: placement.placement,
        left: placement.left,
        top: placement.top
      });
    }

    setPersistentEndpointCallouts(nextCallouts);
  }, [endpointLabels, flightPathGeoJson, isPersistentEndpointPopupMode]);

  const scheduleHoveredEndpointCalloutUpdate = useCallback(() => {
    if (typeof window === "undefined") {
      updateHoveredEndpointCallout();
      return;
    }

    if (calloutAnimationFrameRef.current) {
      return;
    }

    calloutAnimationFrameRef.current = window.requestAnimationFrame(() => {
      calloutAnimationFrameRef.current = 0;
      updateHoveredEndpointCallout();
    });
  }, [updateHoveredEndpointCallout]);

  const schedulePersistentEndpointCalloutUpdate = useCallback(() => {
    if (typeof window === "undefined") {
      updatePersistentEndpointCallouts();
      return;
    }

    if (calloutAnimationFrameRef.current) {
      return;
    }

    calloutAnimationFrameRef.current = window.requestAnimationFrame(() => {
      calloutAnimationFrameRef.current = 0;
      updatePersistentEndpointCallouts();
    });
  }, [updatePersistentEndpointCallouts]);

  const syncMapLayers = useCallback(
    async () => {
      const syncGeneration = syncGenerationRef.current + 1;
      syncGenerationRef.current = syncGeneration;
      const map = mapRef.current?.getMap?.();
      if (!map || !map.isStyleLoaded?.()) {
        return;
      }

      const satelliteLayerExists = Boolean(map.getLayer(SATELLITE_LAYER_ID));
      const satelliteSourceExists = Boolean(map.getSource(SATELLITE_SOURCE_ID));
      const radarLayerExists = Boolean(map.getLayer(RADAR_LAYER_ID));
      const radarSourceExists = Boolean(map.getSource(RADAR_SOURCE_ID));
      const routeOverlayBeforeId = map.getLayer(ROUTE_LAYER_ID) ? ROUTE_LAYER_ID : undefined;

      if (satelliteLayerExists) {
        map.removeLayer(SATELLITE_LAYER_ID);
      }

      if (satelliteSourceExists) {
        map.removeSource(SATELLITE_SOURCE_ID);
      }

      if (radarLayerExists) {
        map.removeLayer(RADAR_LAYER_ID);
      }

      if (radarSourceExists) {
        map.removeSource(RADAR_SOURCE_ID);
      }

      setLabelLayerTextLanguage(map, theme);
      setLabelLayerVisibility(map, labelsEnabled);

      if (satelliteOverlay) {
        map.addSource(SATELLITE_SOURCE_ID, {
          type: "raster",
          tiles: [SATELLITE_TILE_URL],
          tileSize: 256,
          maxzoom: 19
        });

        map.addLayer(
          {
            id: SATELLITE_LAYER_ID,
            type: "raster",
            source: SATELLITE_SOURCE_ID
          },
          routeOverlayBeforeId
        );
      }

      if (radarEnabled) {
        try {
          const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const apiData = await response.json();
          const tileUrl = getRadarTileUrl(apiData);
          if (!tileUrl) {
            throw new Error("Missing radar frame");
          }

          if (syncGeneration !== syncGenerationRef.current) {
            return;
          }

          map.addSource(RADAR_SOURCE_ID, {
            type: "raster",
            tiles: [tileUrl],
            tileSize: 256,
            maxzoom: 7
          });

          map.addLayer(
          {
            id: RADAR_LAYER_ID,
            type: "raster",
            source: RADAR_SOURCE_ID,
            paint: {
              "raster-opacity": RADAR_OPACITY
            }
          },
          routeOverlayBeforeId
        );
        } catch {
          console.warn("RainViewer radar overlay unavailable");
        }
      }
    },
    [labelsEnabled, radarEnabled, satelliteOverlay]
  );

  const flushPendingStyleLayers = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !pendingStyleSyncRef.current || !map.isStyleLoaded?.()) {
      return;
    }

    pendingStyleSyncRef.current = false;
    void syncMapLayers();
  }, [syncMapLayers]);

  useEffect(() => {
    if (!mapReady) {
      return undefined;
    }

    const map = mapRef.current?.getMap?.();
    if (!map) {
      return undefined;
    }

    let cancelled = false;
    const styleChanged = lastMapStyleRef.current !== mapStyle || lastProjectionRef.current !== projection;
    lastMapStyleRef.current = mapStyle;
    lastProjectionRef.current = projection;

    const runSync = () => {
      if (cancelled) {
        return;
      }

      void syncMapLayers();
    };

    if (styleChanged || !map.isStyleLoaded?.()) {
      pendingStyleSyncRef.current = true;
    } else {
      runSync();
    }

    return () => {
      cancelled = true;
    };
  }, [labelsEnabled, mapReady, mapStyle, projection, radarEnabled, satelliteOverlay, syncMapLayers]);

  useEffect(() => {
    resizeMap();
    lockNorthUp();
  }, [lockNorthUp, mapStyle, projection, resizeMap]);

  useEffect(() => {
    if (!mapReady) {
      setHoveredEndpointCallout(null);
      setPersistentEndpointCallouts([]);
      return undefined;
    }

    if (isPersistentEndpointPopupMode) {
      setHoveredEndpointKey(null);
      setHoveredEndpointCallout(null);
      schedulePersistentEndpointCalloutUpdate();
      return undefined;
    }

    if (!hoveredEndpointLabel) {
      setHoveredEndpointCallout(null);
      return undefined;
    }

    scheduleHoveredEndpointCalloutUpdate();

    return () => {
      if (calloutAnimationFrameRef.current && typeof window !== "undefined") {
        window.cancelAnimationFrame(calloutAnimationFrameRef.current);
        calloutAnimationFrameRef.current = 0;
      }
    };
  }, [
    hoveredEndpointLabel,
    isPersistentEndpointPopupMode,
    mapReady,
    scheduleHoveredEndpointCalloutUpdate,
    schedulePersistentEndpointCalloutUpdate
  ]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapReady) {
      return undefined;
    }

    const handleViewportChange = () => {
      if (isPersistentEndpointPopupMode) {
        schedulePersistentEndpointCalloutUpdate();
      } else {
        scheduleHoveredEndpointCalloutUpdate();
      }
    };

    map.on("move", handleViewportChange);
    map.on("zoom", handleViewportChange);
    map.on("resize", handleViewportChange);
    map.on("rotate", handleViewportChange);
    map.on("pitch", handleViewportChange);
    map.on("idle", handleViewportChange);

    handleViewportChange();

    return () => {
      map.off("move", handleViewportChange);
      map.off("zoom", handleViewportChange);
      map.off("resize", handleViewportChange);
      map.off("rotate", handleViewportChange);
      map.off("pitch", handleViewportChange);
      map.off("idle", handleViewportChange);
    };
  }, [
    isPersistentEndpointPopupMode,
    mapReady,
    scheduleHoveredEndpointCalloutUpdate,
    schedulePersistentEndpointCalloutUpdate
  ]);

  useEffect(() => {
    if (!fitToRoute) {
      lastRouteFitSignatureRef.current = "";
      return;
    }

    if (!mapReady || !hasFlightPathFeatures || !routeBounds) {
      return;
    }

    const routeSignature = `${routeBounds[0].join(",")}|${routeBounds[1].join(",")}`;
    if (lastRouteFitSignatureRef.current === routeSignature) {
      return;
    }

    let cancelled = false;
    let retryTimer = null;

    const attemptFit = (attempt = 0) => {
      if (cancelled || !fitToRoute) {
        return;
      }

      const map = mapRef.current?.getMap?.();
      if (!map || !map.isStyleLoaded?.()) {
        if (attempt < 8 && typeof window !== "undefined") {
          retryTimer = window.setTimeout(() => attemptFit(attempt + 1), 100);
        }
        return;
      }

      lastRouteFitSignatureRef.current = routeSignature;
      map.fitBounds(routeBounds, {
        padding: { top: 72, right: 72, bottom: 72, left: 72 },
        duration: 650,
        maxZoom: 8.5
      });
    };

    attemptFit();

    return () => {
      cancelled = true;
      if (retryTimer !== null && typeof window !== "undefined") {
        window.clearTimeout(retryTimer);
      }
    };
  }, [fitToRoute, hasFlightPathFeatures, mapReady, routeBounds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      resizeMap();
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [resizeMap]);

  return (
    <div
      ref={containerRef}
      className="relative min-h-[24rem] flex-1 overflow-hidden rounded-none border border-[color:var(--line)] bg-[var(--surface)]"
    >
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={mapStyle}
        projection={projection}
        interactiveLayerIds={isPersistentEndpointPopupMode ? undefined : [ROUTE_ENDPOINT_HOVER_LAYER_ID]}
        dragRotate={false}
        touchPitch={false}
        style={{ width: "100%", height: "100%" }}
        onLoad={() => {
          resizeMap();
          lockNorthUp();
          setMapReady(true);
        }}
        onMouseMove={
          isPersistentEndpointPopupMode
            ? undefined
            : (event) => {
                const feature = event?.features?.find(
                  (item) => item?.properties?.role === "endpoint" && item?.properties?.endpointKey
                );
                setHoveredEndpointKey(feature?.properties?.endpointKey || null);
              }
        }
        onMouseLeave={
          isPersistentEndpointPopupMode
            ? undefined
            : () => {
                setHoveredEndpointKey(null);
              }
        }
        onIdle={flushPendingStyleLayers}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {hasFlightPathFeatures ? (
          <Source id={ROUTE_SOURCE_ID} type="geojson" data={flightPathGeoJson}>
            <Layer {...ROUTE_ENDPOINT_HOVER_LAYER} />
            <Layer {...ROUTE_LINE_LAYER} />
            <Layer {...ROUTE_ENDPOINT_RING_LAYER} />
            <Layer {...ROUTE_ENDPOINT_DOT_LAYER} />
          </Source>
        ) : null}
      </Map>

      {isPersistentEndpointPopupMode
        ? persistentEndpointCallouts.map((label) => (
            <div
              key={label.id}
              className={cn(
                "pointer-events-none absolute z-[1] rounded-none border px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
                isDarkTheme
                  ? "border-[color:rgba(255,255,255,0.16)] bg-[rgba(10,14,20,0.92)] text-white"
                  : "border-[color:var(--button-ghost-border)] bg-[var(--button-ghost-bg)] text-[var(--text-primary)]"
              )}
              style={{
                left: `${label.left}px`,
                top: `${label.top}px`,
                width: `${ENDPOINT_CALLOUT_WIDTH}px`
              }}
            >
              <div className="truncate text-[12px] font-semibold leading-none tracking-[0.12em]">
                {label.icao}
              </div>
              <div className="mt-0.5 truncate text-[10px] leading-tight opacity-90">
                {label.airportName || label.icao}
              </div>
            </div>
          ))
        : hoveredEndpointCallout ? (
        <div className="pointer-events-none absolute inset-0 z-[1]">
          <div
            className={cn(
              "absolute rounded-none border px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
              isDarkTheme
                ? "border-[color:rgba(255,255,255,0.16)] bg-[rgba(10,14,20,0.92)] text-white"
                : "border-[color:var(--button-ghost-border)] bg-[var(--button-ghost-bg)] text-[var(--text-primary)]"
            )}
            style={{
              left: `${hoveredEndpointCallout.left}px`,
              top: `${hoveredEndpointCallout.top}px`,
              width: `${ENDPOINT_CALLOUT_WIDTH}px`
            }}
          >
            <div className="truncate text-[12px] font-semibold leading-none tracking-[0.12em]">
              {hoveredEndpointCallout.icao}
            </div>
            <div className="mt-0.5 truncate text-[10px] leading-tight opacity-90">
              {hoveredEndpointCallout.airportName || hoveredEndpointCallout.icao}
            </div>
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-[10px] top-[78px] z-[2] flex flex-col items-end gap-2">
        <div
          className={cn(
            "maplibregl-ctrl maplibregl-ctrl-group pointer-events-auto h-[29px] w-[29px] overflow-hidden",
            layersOpen && "bg-[#f2f2f2]"
          )}
          style={
            isDarkTheme
              ? {
                  backgroundColor: "white"
                }
              : undefined
          }
        >
          <button
            type="button"
            className={cn(
              "border-0 bg-transparent leading-none transition-colors hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(0,0,0,0.05)]",
              layersOpen && "bg-[rgba(0,0,0,0.05)]"
            )}
            style={{
              width: 29,
              height: 29,
              minWidth: 29,
              minHeight: 29,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0
            }}
            aria-label="Toggle layers"
            aria-expanded={layersOpen}
            aria-pressed={layersOpen}
            onClick={() => setLayersOpen((current) => !current)}
          >
            <svg
              viewBox="0 0 29 29"
              aria-hidden="true"
              className="block h-full w-full flex-none text-[var(--text-primary)] dark:text-black"
              fill="none"
            >
              <path d="M4 8.5 14.5 3 25 8.5 14.5 14Z" fill="currentColor" />
              <path d="M4 14.5 14.5 9 25 14.5 14.5 20Z" fill="currentColor" fillOpacity="0.84" />
              <path d="M4 20.5 14.5 15 25 20.5 14.5 26Z" fill="currentColor" fillOpacity="0.68" />
            </svg>
          </button>
        </div>

        {layersOpen ? (
          <div className="pointer-events-auto w-44 rounded-none border border-[color:var(--line)] bg-[var(--surface)] p-2 shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.32)]">
            <div className="flex flex-col gap-1.5">
              <LayerToggleRow label="Satellite" enabled={satelliteOverlay} isDarkTheme={isDarkTheme} onClick={onToggleSatellite} />
              <LayerToggleRow label="Wx" enabled={radarEnabled} isDarkTheme={isDarkTheme} onClick={onToggleRadar} />
              <LayerToggleRow label="Labels" enabled={labelsEnabled} isDarkTheme={isDarkTheme} onClick={onToggleLabels} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
