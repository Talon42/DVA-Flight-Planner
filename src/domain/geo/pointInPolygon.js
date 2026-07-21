function toPointCoordinates(point) {
  if (Array.isArray(point) && point.length >= 2) {
    const lon = Number(point[0]);
    const lat = Number(point[1]);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }

  if (point && typeof point === "object") {
    const lat = Number(point.lat);
    const lon = Number(point.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }

  return null;
}

function isPointOnSegment(point, segmentStart, segmentEnd) {
  const epsilon = 1e-10;
  const squaredLength =
    (segmentEnd.lon - segmentStart.lon) ** 2 + (segmentEnd.lat - segmentStart.lat) ** 2;

  // Closed GeoJSON rings repeat their first point; that zero-length segment only contains that point.
  if (squaredLength <= epsilon) {
    return (
      (point.lon - segmentStart.lon) ** 2 + (point.lat - segmentStart.lat) ** 2 <= epsilon
    );
  }

  const crossProduct =
    (point.lat - segmentStart.lat) * (segmentEnd.lon - segmentStart.lon) -
    (point.lon - segmentStart.lon) * (segmentEnd.lat - segmentStart.lat);
  if (Math.abs(crossProduct) > epsilon) {
    return false;
  }

  const dotProduct =
    (point.lon - segmentStart.lon) * (segmentEnd.lon - segmentStart.lon) +
    (point.lat - segmentStart.lat) * (segmentEnd.lat - segmentStart.lat);
  if (dotProduct < -epsilon) {
    return false;
  }

  return dotProduct <= squaredLength + epsilon;
}

function isPointInRing(point, ringCoordinates) {
  if (!Array.isArray(ringCoordinates) || ringCoordinates.length < 3) {
    return false;
  }

  let isInside = false;

  for (let index = 0, previousIndex = ringCoordinates.length - 1; index < ringCoordinates.length; previousIndex = index, index += 1) {
    const current = toPointCoordinates(ringCoordinates[index]);
    const previous = toPointCoordinates(ringCoordinates[previousIndex]);
    if (!current || !previous) {
      continue;
    }

    if (isPointOnSegment(point, previous, current)) {
      return true;
    }

    const intersects =
      current.lat > point.lat !== previous.lat > point.lat &&
      point.lon <
        ((previous.lon - current.lon) * (point.lat - current.lat)) /
          ((previous.lat - current.lat) || Number.EPSILON) +
          current.lon;
    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function isPointInPolygonCoordinates(point, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
    return false;
  }

  const [outerRing, ...holes] = polygonCoordinates;
  if (!isPointInRing(point, outerRing)) {
    return false;
  }

  return !holes.some((holeRing) => isPointInRing(point, holeRing));
}

// Checks whether a point is inside a GeoJSON Polygon or MultiPolygon geometry.
export function isPointInPolygon(point, polygon) {
  const normalizedPoint = toPointCoordinates(point);
  if (!normalizedPoint || !polygon || typeof polygon !== "object") {
    return false;
  }

  if (polygon.type === "Polygon") {
    return isPointInPolygonCoordinates(normalizedPoint, polygon.coordinates);
  }

  if (polygon.type === "MultiPolygon") {
    return (polygon.coordinates || []).some((polygonCoordinates) =>
      isPointInPolygonCoordinates(normalizedPoint, polygonCoordinates)
    );
  }

  return false;
}
