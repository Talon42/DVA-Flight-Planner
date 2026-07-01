import { LOGBOOK_EMPTY_VALUE, formatLandingGrade } from "./logbook.model.js";

function formatNumber(value, options = {}) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0
  }).format(value);
}

function formatSignedNumber(value, options = {}) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    signDisplay: "always"
  }).format(value);
}

function formatMinutes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return LOGBOOK_EMPTY_VALUE;
  }

  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatUnit(value, unit, options = {}) {
  if (!Number.isFinite(value)) {
    return LOGBOOK_EMPTY_VALUE;
  }

  return `${formatNumber(value, options)} ${unit}`;
}

function formatPercent(value, total) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return LOGBOOK_EMPTY_VALUE;
  }

  return `${formatNumber((value / total) * 100, { maximumFractionDigits: 1 })}%`;
}

function parseDateSortKey(dateSortKey) {
  const normalized = Number(dateSortKey);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }

  const year = Math.floor(normalized / 10000);
  const month = Math.floor((normalized % 10000) / 100);
  const day = normalized % 100;

  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function toDateSortKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return 0;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return Number(`${year}${month}${day}`);
}

function shiftDays(date, amount) {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + amount);
  return nextDate;
}

function shiftYears(date, amount) {
  const year = date.getUTCFullYear() + amount;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, daysInTargetMonth)));
}

function startOfYear(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function startOfPreviousYear(date) {
  return new Date(Date.UTC(date.getUTCFullYear() - 1, 0, 1));
}

function sortByCount(items) {
  return [...items].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function incrementCount(counterMap, key) {
  if (!key || key === LOGBOOK_EMPTY_VALUE) {
    return;
  }

  counterMap.set(key, (counterMap.get(key) || 0) + 1);
}

function incrementCountWithRow(counterMap, orderMap, rowMap, key, row) {
  if (!key || key === LOGBOOK_EMPTY_VALUE) {
    return;
  }

  if (!counterMap.has(key)) {
    orderMap.set(key, orderMap.size);
    rowMap.set(key, row);
  }

  counterMap.set(key, (counterMap.get(key) || 0) + 1);
}

function selectTopCountEntry(counterMap, orderMap, rowMap) {
  let topKey = "";
  let topCount = 0;

  for (const [key, count] of counterMap.entries()) {
    if (
      !topKey ||
      count > topCount ||
      (count === topCount &&
        (orderMap.get(key) ?? Number.POSITIVE_INFINITY) < (orderMap.get(topKey) ?? Number.POSITIVE_INFINITY))
    ) {
      topKey = key;
      topCount = count;
    }
  }

  if (!topKey) {
    return null;
  }

  const row = rowMap.get(topKey) || null;
  const displayName = String(row?.airlineDisplayName || topKey || "").trim();
  const airlineCode = String(row?.airlineCode || "").trim();
  const resolvedDisplayName = displayName && displayName !== airlineCode ? displayName : "Unknown Airline";

  return {
    label: resolvedDisplayName,
    displayName: resolvedDisplayName,
    airlineCode,
    airlineLogoSrc: String(row?.airlineLogoSrc || "").trim(),
    airlineLogoClassName: String(row?.airlineLogoClassName || "").trim(),
    count: topCount
  };
}

function buildRouteKey(row) {
  return `${String(row?.departure || "").trim()}|${String(row?.arrival || "").trim()}`;
}

function buildRouteLabel(row) {
  return `${String(row?.departure || "").trim()} -> ${String(row?.arrival || "").trim()}`;
}

function buildMonthKey(row) {
  const date = parseDateSortKey(row?.dateSortKey);
  if (!date) {
    return LOGBOOK_EMPTY_VALUE;
  }

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthLabel(monthKey) {
  if (monthKey === LOGBOOK_EMPTY_VALUE) {
    return LOGBOOK_EMPTY_VALUE;
  }

  const [year, month] = String(monthKey).split("-").map((value) => Number(value));
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return LOGBOOK_EMPTY_VALUE;
  }

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function buildRankingItems(counterMap, { totalCount = 0, rowMap = null, labelBuilder = null } = {}) {
  return sortByCount(
    Array.from(counterMap.entries()).map(([key, count]) => {
      const row = rowMap?.get(key) || null;
      return {
        key,
        label: labelBuilder ? labelBuilder(key, row) : key,
        count,
        value: formatNumber(count),
        valueRaw: count,
        percentValue: formatPercent(count, totalCount),
        percentValueRaw: totalCount > 0 ? (count / totalCount) * 100 : null,
        meta: row?.airlineCode || row?.equipment || "",
        row
      };
    })
  ).map((item, index) => ({
    ...item,
    rank: index + 1
  }));
}

function buildCombinedAirportRows(departureCounts, arrivalCounts) {
  const airportMap = new Map();

  function upsertAirport(label, type, count) {
    const normalizedLabel = String(label || "").trim();
    if (!normalizedLabel) {
      return;
    }

    const current = airportMap.get(normalizedLabel) || {
      label: normalizedLabel,
      dep: 0,
      arr: 0
    };

    current[type] += Number(count || 0);
    airportMap.set(normalizedLabel, current);
  }

  for (const [label, count] of departureCounts.entries()) {
    upsertAirport(label, "dep", count);
  }

  for (const [label, count] of arrivalCounts.entries()) {
    upsertAirport(label, "arr", count);
  }

  const totalUsesAllAirports = [...airportMap.values()].reduce((sum, item) => sum + item.dep + item.arr, 0);

  return [...airportMap.values()]
    .map((item) => {
      const totalUses = item.dep + item.arr;
      return {
        id: item.label,
        label: item.label,
        value: formatNumber(totalUses),
        valueRaw: totalUses,
        meta: `${formatNumber(item.dep)} dep / ${formatNumber(item.arr)} arr`,
        dep: formatNumber(item.dep),
        depRaw: item.dep,
        arr: formatNumber(item.arr),
        arrRaw: item.arr,
        percentValue: formatPercent(totalUses, totalUsesAllAirports),
        percentValueRaw: totalUsesAllAirports > 0 ? (totalUses / totalUsesAllAirports) * 100 : null,
        totalUses
      };
    })
    .sort((left, right) => right.totalUses - left.totalUses || left.label.localeCompare(right.label))
    .map((item, index) => ({
      rank: index + 1,
      ...item
    }));
}

function createPeriodConfig(periodKey, anchorDate) {
  const normalizedKey = String(periodKey || "").trim();

  if (normalizedKey === "off") {
    return {
      label: "All",
      currentStart: null,
      currentEndExclusive: null,
      priorStart: null,
      priorEndExclusive: null
    };
  }

  if (!anchorDate) {
    return null;
  }

  const dayAfterAnchor = shiftDays(anchorDate, 1);

  switch (normalizedKey) {
    case "last-30-days":
      return {
        label: "Last 30 Days",
        currentStart: shiftDays(anchorDate, -29),
        currentEndExclusive: dayAfterAnchor,
        priorStart: shiftDays(anchorDate, -59),
        priorEndExclusive: shiftDays(anchorDate, -29)
      };
    case "last-90-days":
      return {
        label: "Last 90 Days",
        currentStart: shiftDays(anchorDate, -89),
        currentEndExclusive: dayAfterAnchor,
        priorStart: shiftDays(anchorDate, -179),
        priorEndExclusive: shiftDays(anchorDate, -89)
      };
    case "year-to-date":
      return {
        label: "Year to Date",
        currentStart: startOfYear(anchorDate),
        currentEndExclusive: dayAfterAnchor,
        priorStart: startOfYear(startOfPreviousYear(anchorDate)),
        priorEndExclusive: shiftYears(dayAfterAnchor, -1)
      };
    default: {
      const yearMatch = /^year-(\d{4})$/.exec(normalizedKey);
      if (!yearMatch) {
        return null;
      }

      const year = Number(yearMatch[1]);
      if (!Number.isFinite(year)) {
        return null;
      }

      return {
        label: String(year),
        currentStart: new Date(Date.UTC(year, 0, 1)),
        currentEndExclusive: new Date(Date.UTC(year + 1, 0, 1)),
        priorStart: new Date(Date.UTC(year - 1, 0, 1)),
        priorEndExclusive: new Date(Date.UTC(year, 0, 1))
      };
    }
  }
}

function filterRowsByDateRange(rows, startDate, endDateExclusive) {
  if (!startDate || !endDateExclusive) {
    return [...rows];
  }

  const startKey = toDateSortKey(startDate);
  const endKey = toDateSortKey(endDateExclusive);

  return rows.filter((row) => Number.isFinite(row.dateSortKey) && row.dateSortKey >= startKey && row.dateSortKey < endKey);
}

function sumRows(rows) {
  return rows.reduce(
    (accumulator, row) => {
      if (Number.isFinite(row.distanceNm)) {
        accumulator.totalDistance += row.distanceNm;
      }

      // Use the imported block time and airborne time fields for pilot stats totals.
      if (Number.isFinite(row.blockTimeMinutes)) {
        accumulator.totalBlockTime += row.blockTimeMinutes;
      }

      if (Number.isFinite(row.airborneMinutes)) {
        accumulator.totalFlightTime += row.airborneMinutes;
      }

      if (Number.isFinite(row.totalFuelPounds)) {
        accumulator.totalFuel += row.totalFuelPounds;
      }

      if (Number.isFinite(row.landingRate)) {
        accumulator.landingRows.push(row);
      }

      accumulator.totalFlights += 1;
      return accumulator;
    },
    {
      totalFlights: 0,
      totalDistance: 0,
      totalBlockTime: 0,
      totalFlightTime: 0,
      totalFuel: 0,
      landingRows: []
    }
  );
}

function buildDelta(currentValue, priorValue, { format = "number", lowerIsBetter = false, unit = "" } = {}) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(priorValue)) {
    return {
      value: LOGBOOK_EMPTY_VALUE,
      status: "neutral",
      rawValue: null
    };
  }

  const delta = currentValue - priorValue;
  const isNeutral = delta === 0;
  const isPositive = lowerIsBetter ? delta < 0 : delta > 0;
  const status = isNeutral ? "neutral" : isPositive ? "positive" : "negative";
  const formattedValue =
    format === "minutes"
      ? formatMinutes(Math.abs(delta))
      : format === "signed"
        ? `${formatSignedNumber(delta, { maximumFractionDigits: 0 })} ${unit}`.trim()
        : `${formatSignedNumber(delta, { maximumFractionDigits: 0 })}${unit ? ` ${unit}` : ""}`.trim();

  return {
    value: formattedValue,
    status,
    rawValue: delta
  };
}

function buildPeriodMetrics(rows) {
  const totals = sumRows(rows);
  const averageLandingRate =
    totals.landingRows.length > 0
      ? totals.landingRows.reduce((sum, row) => sum + row.landingRate, 0) / totals.landingRows.length
      : null;

  return {
    totalFlights: totals.totalFlights,
    totalDistanceNm: totals.totalDistance,
    totalDurationMinutes: totals.totalBlockTime,
    totalAirborneMinutes: totals.totalFlightTime,
    totalFuelPounds: totals.totalFuel,
    averageLandingRate,
    averageLandingRateGrade: averageLandingRate === null ? LOGBOOK_EMPTY_VALUE : formatLandingGrade(averageLandingRate)
  };
}

function buildComparisonBundle(rows, periodKey) {
  const activeRows = Array.isArray(rows) ? rows : [];
  const anchorRow = [...activeRows].sort((left, right) => right.dateSortKey - left.dateSortKey || right.sourceIndex - left.sourceIndex)[0];
  const anchorDate = parseDateSortKey(anchorRow?.dateSortKey);
  const periodConfig = createPeriodConfig(periodKey, anchorDate);
  const currentPeriodRows =
    periodConfig?.currentStart && periodConfig?.currentEndExclusive
      ? filterRowsByDateRange(activeRows, periodConfig.currentStart, periodConfig.currentEndExclusive)
      : [...activeRows];
  const priorPeriodRows =
    periodConfig?.priorStart && periodConfig?.priorEndExclusive
      ? filterRowsByDateRange(activeRows, periodConfig.priorStart, periodConfig.priorEndExclusive)
      : [];

  const current = buildPeriodMetrics(currentPeriodRows);
  const prior = buildPeriodMetrics(priorPeriodRows);

  return {
    periodKey: String(periodKey || "last-90-days"),
    periodLabel: periodConfig?.label || "All",
    anchorDateIso: anchorDate ? anchorDate.toISOString() : null,
    currentRows: currentPeriodRows,
    current,
    prior,
    deltas: {
      totalFlights: buildDelta(current.totalFlights, prior.totalFlights),
      totalDistanceNm: buildDelta(current.totalDistanceNm, prior.totalDistanceNm, { unit: "nm" }),
      totalDurationMinutes: buildDelta(current.totalDurationMinutes, prior.totalDurationMinutes, { format: "minutes" }),
      totalAirborneMinutes: buildDelta(current.totalAirborneMinutes, prior.totalAirborneMinutes, { format: "minutes" }),
      averageLandingRate: buildDelta(current.averageLandingRate, prior.averageLandingRate, {
        format: "signed",
        lowerIsBetter: true,
        unit: "fpm"
      })
    }
  };
}

function buildRecentLandingRows(rows, limit = 10) {
  // Keeps the landing summary card fed with the compact fields its row renderer expects.
  return [...rows]
    .filter((row) => Number.isFinite(row.landingRate))
    .sort((left, right) => right.dateSortKey - left.dateSortKey || right.sourceIndex - left.sourceIndex)
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      label: row.compactFlightLabel,
      date: row.dateDisplay,
      dateSortKey: row.dateSortKey,
      flight: row.compactFlightLabel,
      airline: row.airlineDisplayName,
      route: `${row.departure} -> ${row.arrival}`,
      arrivalAirport: row.arrival,
      equipment: row.equipment,
      meta: row.arrival,
      value: row.landingRateDisplay,
      landingRate: row.landingRateDisplay,
      badge: row.landingGradeDisplay,
      rawLandingRate: row.landingRate
    }));
}

function buildRecordSummary(rows) {
  const activeRows = Array.isArray(rows) ? rows : [];
  const landingRows = activeRows.filter((row) => Number.isFinite(row.landingRate));
  const bestLandingRate =
      landingRows.length > 0
      ? [...landingRows].sort((left, right) => right.landingRate - left.landingRate || right.dateSortKey - left.dateSortKey)[0]
      : null;
  const worstLandingRate =
      landingRows.length > 0
      ? [...landingRows].sort(
          (left, right) => left.landingRate - right.landingRate || right.dateSortKey - left.dateSortKey
        )[0]
      : null;
  const longestFlight =
    activeRows.length > 0
      ? [...activeRows].sort((left, right) => (right.distanceNm || 0) - (left.distanceNm || 0) || right.dateSortKey - left.dateSortKey)[0]
      : null;
  const shortestFlight =
    activeRows.length > 0
      ? [...activeRows].sort((left, right) => (left.distanceNm || Number.POSITIVE_INFINITY) - (right.distanceNm || Number.POSITIVE_INFINITY) || right.dateSortKey - left.dateSortKey)[0]
      : null;
  const monthlyCounts = new Map();

  for (const row of activeRows) {
    incrementCount(monthlyCounts, buildMonthKey(row));
  }

  let busiestMonthKey = "";
  let busiestMonthCount = 0;
  for (const [monthKey, count] of monthlyCounts.entries()) {
    if (!busiestMonthKey || count > busiestMonthCount) {
      busiestMonthKey = monthKey;
      busiestMonthCount = count;
    }
  }

  return {
    bestLanding: bestLandingRate
      ? {
          id: "best-landing",
          label: bestLandingRate.compactFlightLabel,
          value: bestLandingRate.landingRateDisplay,
          meta: bestLandingRate.dateDisplay
        }
      : null,
    worstLanding: worstLandingRate
      ? {
          id: "worst-landing",
          label: worstLandingRate.compactFlightLabel,
          value: worstLandingRate.landingRateDisplay,
          meta: worstLandingRate.dateDisplay
        }
      : null,
    longestFlight: longestFlight
      ? {
          id: "longest-flight",
          label: longestFlight.compactFlightLabel,
          value: longestFlight.distanceDisplay,
          meta: longestFlight.dateDisplay
        }
      : null,
    shortestFlight: shortestFlight
      ? {
          id: "shortest-flight",
          label: shortestFlight.compactFlightLabel,
          value: shortestFlight.distanceDisplay,
          meta: shortestFlight.dateDisplay
        }
      : null,
    busiestMonth: busiestMonthKey
      ? {
          id: "busiest-month",
          label: buildMonthLabel(busiestMonthKey),
          value: formatNumber(busiestMonthCount),
          meta: "Flights"
        }
      : null,
    summaryRows: [
      bestLandingRate
        ? {
            id: "best-landing",
            recordType: "best-landing",
            label: "Best Landing",
            value: bestLandingRate.landingRateDisplay,
            meta: `${bestLandingRate.compactFlightLabel} - ${bestLandingRate.dateDisplay}`,
            tone: "positive"
          }
        : null,
      worstLandingRate
        ? {
            id: "worst-landing",
            recordType: "worst-landing",
            label: "Worst Landing",
            value: worstLandingRate.landingRateDisplay,
            meta: `${worstLandingRate.compactFlightLabel} - ${worstLandingRate.dateDisplay}`,
            tone: "negative"
          }
        : null,
      longestFlight
        ? {
            id: "longest-flight",
            recordType: "longest-flight",
            label: "Longest Flight",
            value: longestFlight.distanceDisplay,
            meta: `${longestFlight.compactFlightLabel} - ${longestFlight.dateDisplay}`,
            tone: "neutral"
          }
        : null,
      shortestFlight
        ? {
            id: "shortest-flight",
            recordType: "shortest-flight",
            label: "Shortest Flight",
            value: shortestFlight.distanceDisplay,
            meta: `${shortestFlight.compactFlightLabel} - ${shortestFlight.dateDisplay}`,
            tone: "neutral"
          }
        : null,
      busiestMonthKey
        ? {
            id: "busiest-month",
            recordType: "busiest-month",
            label: "Busiest Month",
            value: formatNumber(busiestMonthCount),
            meta: buildMonthLabel(busiestMonthKey),
            tone: "neutral"
          }
        : null
    ].filter(Boolean)
  };
}

// Builds the Pilot Stats dashboard model from the normalized logbook rows.
export function buildLogbookPilotStats(rows, options = {}) {
  const activeRows = Array.isArray(rows) ? rows : [];
  const comparisonPeriod = String(options?.comparisonPeriod || "last-90-days").trim() || "last-90-days";
  const comparison = buildComparisonBundle(activeRows, comparisonPeriod);
  const statsRows = Array.isArray(comparison.currentRows) ? comparison.currentRows : activeRows;
  const equipmentCounts = new Map();
  const simulatorCounts = new Map();
  const statusCounts = new Map();
  const airlineCounts = new Map();
  const airlineFirstSeenOrder = new Map();
  const airlineRowsByKey = new Map();
  const departureCounts = new Map();
  const arrivalCounts = new Map();
  const routeCounts = new Map();
  const routeRowsByKey = new Map();
  const routeFirstSeenOrder = new Map();
  const landingRows = [];
  let totalDistance = 0;
  let totalBlockTime = 0;
  let totalFlightTime = 0;
  let totalFuel = 0;

  for (const row of statsRows) {
    if (Number.isFinite(row.distanceNm)) {
      totalDistance += row.distanceNm;
    }

    // Keep the dashboard summary aligned to the imported block time field.
    if (Number.isFinite(row.blockTimeMinutes)) {
      totalBlockTime += row.blockTimeMinutes;
    }

    // Keep the dashboard summary aligned to the imported airborne time field.
    if (Number.isFinite(row.airborneMinutes)) {
      totalFlightTime += row.airborneMinutes;
    }

    if (Number.isFinite(row.totalFuelPounds)) {
      totalFuel += row.totalFuelPounds;
    }

    incrementCount(equipmentCounts, row.equipment);
    incrementCount(simulatorCounts, row.simulator);
    incrementCount(statusCounts, row.statusDisplay);
    incrementCountWithRow(airlineCounts, airlineFirstSeenOrder, airlineRowsByKey, row.airlineDisplayName, row);
    incrementCount(departureCounts, row.departure);
    incrementCount(arrivalCounts, row.arrival);
    incrementCountWithRow(routeCounts, routeFirstSeenOrder, routeRowsByKey, buildRouteKey(row), row);

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
      ? [...landingRows].sort((left, right) => right.landingRate - left.landingRate || right.dateSortKey - left.dateSortKey)[0]
      : null;
  const worstLandingRate =
    landingRows.length > 0
      ? [...landingRows].sort(
          (left, right) => left.landingRate - right.landingRate || right.dateSortKey - left.dateSortKey
        )[0]
      : null;
  const topAirline = selectTopCountEntry(airlineCounts, airlineFirstSeenOrder, airlineRowsByKey);
  const records = buildRecordSummary(statsRows);

  return {
    totalFlights: statsRows.length,
    summary: {
      topAirline,
      topEquipment: buildRankingItems(equipmentCounts, { totalCount: statsRows.length })[0] || null,
      totalFlights: formatNumber(statsRows.length),
      totalDistance: formatUnit(totalDistance, "nm"),
      totalDuration: formatMinutes(totalBlockTime),
      totalAirborneTime: formatMinutes(totalFlightTime),
      totalFuel: formatUnit(totalFuel, "lb"),
      averageLandingRate:
        averageLandingRate === null
          ? LOGBOOK_EMPTY_VALUE
          : formatUnit(averageLandingRate, "fpm", { maximumFractionDigits: 0 }),
      averageLandingRateValue: averageLandingRate,
      averageLandingRateGrade:
        averageLandingRate === null ? LOGBOOK_EMPTY_VALUE : formatLandingGrade(averageLandingRate)
    },
    comparisons: {
      current: comparison.current,
      prior: comparison.prior,
      deltas: comparison.deltas,
      periodKey: comparison.periodKey,
      periodLabel: comparison.periodLabel,
      anchorDateIso: comparison.anchorDateIso
    },
    cards: [
      { label: "Total Flights", value: formatNumber(statsRows.length) },
      { label: "Total Distance", value: formatUnit(totalDistance, "nm") },
      { label: "Total Block Time", value: formatMinutes(totalBlockTime) },
      { label: "Total Flight Time", value: formatMinutes(totalFlightTime) },
      { label: "Total Fuel", value: formatUnit(totalFuel, "lb") },
      { label: "Average Landing Rate", value: formatUnit(averageLandingRate, "fpm", { maximumFractionDigits: 0 }) },
      {
        label: "Top Airline",
        value: topAirline ? topAirline.label : LOGBOOK_EMPTY_VALUE,
        meta: topAirline ? `${formatNumber(topAirline.count)} flights` : ""
      }
    ],
    landingRates: [
      {
        label: "Best",
        value: bestLandingRate ? formatUnit(bestLandingRate.landingRate, "fpm") : LOGBOOK_EMPTY_VALUE,
        meta: bestLandingRate ? `${bestLandingRate.compactFlightLabel} - ${bestLandingRate.dateDisplay}` : ""
      },
      {
        label: "Worst",
        value: worstLandingRate ? formatUnit(worstLandingRate.landingRate, "fpm") : LOGBOOK_EMPTY_VALUE,
        meta: worstLandingRate ? `${worstLandingRate.compactFlightLabel} - ${worstLandingRate.dateDisplay}` : ""
      },
      {
        label: "Average",
        value: formatUnit(averageLandingRate, "fpm", { maximumFractionDigits: 0 }),
        meta: landingRows.length ? `${formatNumber(landingRows.length)} recorded landings` : ""
      }
    ],
    records,
    recentLandings: buildRecentLandingRows(statsRows, 10),
    rankings: {
      airlines: buildRankingItems(airlineCounts, { totalCount: statsRows.length, rowMap: airlineRowsByKey }),
      equipment: buildRankingItems(equipmentCounts, { totalCount: statsRows.length }),
      topAirports: buildCombinedAirportRows(departureCounts, arrivalCounts),
      departureAirports: buildRankingItems(departureCounts, { totalCount: statsRows.length }),
      arrivalAirports: buildRankingItems(arrivalCounts, { totalCount: statsRows.length }),
      routes: buildRankingItems(routeCounts, {
        totalCount: statsRows.length,
        rowMap: routeRowsByKey,
        labelBuilder: (_, row) => (row ? buildRouteLabel(row) : LOGBOOK_EMPTY_VALUE)
      }),
      status: buildRankingItems(statusCounts, { totalCount: statsRows.length }),
      simulatorUsage: buildRankingItems(simulatorCounts, { totalCount: statsRows.length })
    },
    detailRows: {
      airlines: buildRankingItems(airlineCounts, { totalCount: statsRows.length, rowMap: airlineRowsByKey }),
      equipment: buildRankingItems(equipmentCounts, { totalCount: statsRows.length }),
      recentLandings: buildRecentLandingRows(statsRows, statsRows.length),
      topAirports: buildCombinedAirportRows(departureCounts, arrivalCounts),
      departureAirports: buildRankingItems(departureCounts, { totalCount: statsRows.length }),
      arrivalAirports: buildRankingItems(arrivalCounts, { totalCount: statsRows.length }),
      routes: buildRankingItems(routeCounts, {
        totalCount: statsRows.length,
        rowMap: routeRowsByKey,
        labelBuilder: (_, row) => (row ? buildRouteLabel(row) : LOGBOOK_EMPTY_VALUE)
      }),
      status: buildRankingItems(statusCounts, { totalCount: statsRows.length }),
      records: records.summaryRows
    },
    layoutSafeLists: {
      airlines: buildRankingItems(airlineCounts, { totalCount: statsRows.length, rowMap: airlineRowsByKey }),
      equipment: buildRankingItems(equipmentCounts, { totalCount: statsRows.length }),
      departureAirports: buildRankingItems(departureCounts, { totalCount: statsRows.length }),
      arrivalAirports: buildRankingItems(arrivalCounts, { totalCount: statsRows.length }),
      routes: buildRankingItems(routeCounts, {
        totalCount: statsRows.length,
        rowMap: routeRowsByKey,
        labelBuilder: (_, row) => (row ? buildRouteLabel(row) : LOGBOOK_EMPTY_VALUE)
      }),
      status: buildRankingItems(statusCounts, { totalCount: statsRows.length }),
      recentLandings: buildRecentLandingRows(statsRows, 10)
    },
    raw: {
      allRows: statsRows
    }
  };
}
