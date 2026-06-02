function formatNumber(value, options = {}) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0
  }).format(value);
}

function formatMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatUnit(value, unit, options = {}) {
  if (!Number.isFinite(value)) {
    return "—";
  }

  return `${formatNumber(value, options)} ${unit}`;
}

function sortByCount(items) {
  return [...items].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildCountList(counterMap) {
  return sortByCount(
    Array.from(counterMap.entries()).map(([label, count]) => ({
      label,
      count,
      value: formatNumber(count)
    }))
  );
}

function incrementCount(counterMap, key) {
  if (!key || key === "—") {
    return;
  }

  counterMap.set(key, (counterMap.get(key) || 0) + 1);
}

// Builds the Pilot Stats cards and ranked lists from the filtered logbook rows only.
export function buildLogbookPilotStats(rows) {
  const activeRows = Array.isArray(rows) ? rows : [];
  const equipmentCounts = new Map();
  const simulatorCounts = new Map();
  const statusCounts = new Map();
  const airlineCounts = new Map();
  const departureCounts = new Map();
  const arrivalCounts = new Map();
  const landingRows = [];
  let totalDistance = 0;
  let totalDuration = 0;
  let totalAirborne = 0;
  let totalFuel = 0;

  for (const row of activeRows) {
    if (Number.isFinite(row.distanceNm)) {
      totalDistance += row.distanceNm;
    }

    if (Number.isFinite(row.durationMinutes)) {
      totalDuration += row.durationMinutes;
    }

    if (Number.isFinite(row.airborneMinutes)) {
      totalAirborne += row.airborneMinutes;
    }

    if (Number.isFinite(row.totalFuelPounds)) {
      totalFuel += row.totalFuelPounds;
    }

    incrementCount(equipmentCounts, row.equipment);
    incrementCount(simulatorCounts, row.simulator);
    incrementCount(statusCounts, row.statusDisplay);
    incrementCount(airlineCounts, row.airlineDisplayName);
    incrementCount(departureCounts, row.origin);
    incrementCount(arrivalCounts, row.destination);

    if (Number.isFinite(row.landingRate)) {
      landingRows.push(row);
    }
  }

  const averageLandingRate =
    landingRows.length > 0
      ? landingRows.reduce((sum, row) => sum + row.landingRate, 0) / landingRows.length
      : null;
  const bestLandingRate =
    landingRows.length > 0
      ? [...landingRows].sort(
          (left, right) =>
            Math.abs(left.landingRate + 250) - Math.abs(right.landingRate + 250) ||
            right.dateSortKey - left.dateSortKey
        )[0]
      : null;
  const worstLandingRate =
    landingRows.length > 0
      ? [...landingRows].sort((left, right) => left.landingRate - right.landingRate || right.dateSortKey - left.dateSortKey)[0]
      : null;
  const topAirline = sortByCount(
    Array.from(airlineCounts.entries()).map(([label, count]) => ({ label, count }))
  )[0] || null;

  return {
    totalFlights: activeRows.length,
    cards: [
      { label: "Total Flights", value: formatNumber(activeRows.length) },
      { label: "Total Distance", value: formatUnit(totalDistance, "nm") },
      { label: "Total Duration", value: formatMinutes(totalDuration) },
      { label: "Total Airborne Time", value: formatMinutes(totalAirborne) },
      { label: "Total Fuel", value: formatUnit(totalFuel, "lb") },
      { label: "Average Landing Rate", value: formatUnit(averageLandingRate, "fpm", { maximumFractionDigits: 0 }) },
      {
        label: "Top Airline",
        value: topAirline ? topAirline.label : "—",
        meta: topAirline ? `${formatNumber(topAirline.count)} flights` : ""
      }
    ],
    landingRates: [
      {
        label: "Best",
        value: bestLandingRate ? formatUnit(bestLandingRate.landingRate, "fpm") : "—",
        meta: bestLandingRate ? `${bestLandingRate.compactFlightLabel} • ${bestLandingRate.dateDisplay}` : ""
      },
      {
        label: "Worst",
        value: worstLandingRate ? formatUnit(worstLandingRate.landingRate, "fpm") : "—",
        meta: worstLandingRate ? `${worstLandingRate.compactFlightLabel} • ${worstLandingRate.dateDisplay}` : ""
      },
      {
        label: "Average",
        value: formatUnit(averageLandingRate, "fpm", { maximumFractionDigits: 0 }),
        meta: landingRows.length ? `${formatNumber(landingRows.length)} recorded landings` : ""
      }
    ],
    lastTenLandingRates: [...landingRows]
      .sort((left, right) => right.dateSortKey - left.dateSortKey || right.sourceIndex - left.sourceIndex)
      .slice(0, 10)
      .map((row) => ({
        label: `${row.compactFlightLabel} • ${row.dateDisplay}`,
        value: formatUnit(row.landingRate, "fpm"),
        meta: `${row.origin} → ${row.destination}`
      })),
    flightsByEquipment: buildCountList(equipmentCounts),
    flightsBySimulator: buildCountList(simulatorCounts),
    flightsByStatus: buildCountList(statusCounts),
    flightsByAirline: buildCountList(airlineCounts),
    topDepartureAirports: buildCountList(departureCounts),
    topArrivalAirports: buildCountList(arrivalCounts)
  };
}
