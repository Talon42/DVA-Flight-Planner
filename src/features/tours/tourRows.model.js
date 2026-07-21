import { getAirlineIcao, getAirlineNameByIata } from "../../domain/airlines/airlineBranding.js";
import {
  buildDvaTourCanonicalRowId,
  buildDvaTourDerivedProgressRowId,
  buildLegacyDvaTourCanonicalRowId,
  buildLegacyDvaTourRowId,
  normalizeDvaTourId
} from "./tourIds.model";
import { parseTourFlightCode, parseTourRoute } from "./tourParsing.model";
import { getAirportByIcao } from "../../domain/airports/airportCatalog.js";

// Parses schedule text into a leading departure-time label when one is embedded in the row.
export function parseTourDepartureTimeLabel(scheduleLabel) {
  const normalizedLabel = String(scheduleLabel || "").trim();
  if (!normalizedLabel) {
    return "";
  }

  return normalizedLabel.split(" - ")[0]?.trim() || "";
}

// Formats block duration values for display in the same compact style used by the planner.
export function formatTourDurationLabel(durationMs) {
  const numericDuration = Number(durationMs);
  if (!Number.isFinite(numericDuration) || numericDuration < 0) {
    return "";
  }

  const totalMinutes = Math.round(numericDuration / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

// Detects the modern tour row shape that already carries resolved flight fields.
export function isModernTourFlight(row) {
  return Boolean(
    row &&
      typeof row === "object" &&
      (row.flightId ||
        row.tourRowId ||
        row.departure ||
        row.destination ||
        row.departureTime ||
        row.arrivalTime ||
        row.equipment ||
        row.aircraft)
  );
}

// Adds a timezone suffix when the label does not already include one.
export function buildTourLocalTimeLabel(timeLabel, timezoneLabel) {
  const normalizedTimeLabel = String(timeLabel || "").trim();
  if (!normalizedTimeLabel) {
    return "";
  }

  if (/\s(?:GMT[+-]\d+|UTC[+-]?\d*|[A-Z]{2,5})$/i.test(normalizedTimeLabel)) {
    return normalizedTimeLabel;
  }

  const normalizedTimezoneLabel = String(timezoneLabel || "").trim();
  if (!normalizedTimezoneLabel) {
    return normalizedTimeLabel;
  }

  return `${normalizedTimeLabel} ${normalizedTimezoneLabel}`;
}

// Normalizes tour rows into the UI shape used by the planner and board views.
export function normalizeTourRows(tour, rows, progressById = {}) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const tourId = normalizeDvaTourId(tour);
  const tourLabel = String(tour?.label || tour?.name || "").trim();
  const tourSourceId = String(tour?.sourceId || tour?.id || "").trim();
  const legacyRowIdCounts = rows.reduce((counts, row) => {
    const legacyRowId = buildLegacyDvaTourRowId(tourId, row);
    if (legacyRowId) {
      counts.set(legacyRowId, (counts.get(legacyRowId) || 0) + 1);
    }

    return counts;
  }, new Map());

  return rows.map((row, index) => {
    if (isModernTourFlight(row)) {
      const flightId = buildDvaTourCanonicalRowId(tourId, row);
      const derivedProgressFlightId = buildDvaTourDerivedProgressRowId(tourId, row);
      const legacyCanonicalFlightId = buildLegacyDvaTourCanonicalRowId(flightId);
      const legacyFlightId = buildLegacyDvaTourRowId(tourId, row);
      // Match the current UI row ID first, then the backend-derived progress ID, so
      // manual completions stay intact while logbook-derived completions still load.
      const manualProgressEntry = progressById?.[flightId] || null;
      const legacyCanonicalProgressEntry = legacyCanonicalFlightId
        ? progressById?.[legacyCanonicalFlightId] || null
        : null;
      const derivedProgressEntry = derivedProgressFlightId
        ? progressById?.[derivedProgressFlightId] || null
        : null;
      const legacyProgressEntry =
        legacyFlightId && legacyRowIdCounts.get(legacyFlightId) === 1
          ? progressById?.[legacyFlightId] || null
          : null;
      const progressEntry =
        manualProgressEntry?.completed
          ? manualProgressEntry
          : legacyCanonicalProgressEntry?.completed
            ? legacyCanonicalProgressEntry
            : derivedProgressEntry?.completed
              ? derivedProgressEntry
              : legacyProgressEntry?.completed
                ? legacyProgressEntry
                : null;
      const tourLeg = index + 1;
      const airline = String(row?.airline || "").trim().toUpperCase();
      const airlineName = String(
        getAirlineNameByIata(airline) || row?.airlineName || airline || ""
      ).trim();
      const explicitAirlineIcao = String(row?.airlineIcao || "").trim().toUpperCase();
      const airlineIcao = String(
        (explicitAirlineIcao.length === 3 ? explicitAirlineIcao : "") ||
          getAirlineIcao({
            airlineName,
            airlineIata: airline
          }) ||
          ""
      )
        .trim()
        .toUpperCase();
      const flightNumber = String(
        row?.flightNumber || row?.tourFlightNumber || row?.flight || ""
      ).trim();
      const flightCode =
        String(row?.flightCode || "").trim() ||
        (airline && flightNumber ? `${airline}${flightNumber}` : "");
      const from = String(row?.from || row?.departure || "").trim().toUpperCase();
      const to = String(row?.to || row?.destination || "").trim().toUpperCase();
      const departureAirport = getAirportByIcao(from);
      const arrivalAirport = getAirportByIcao(to);
      const departureTimeLabel = String(
        row?.departureTimeLabel || row?.departureTime || row?.timeD?.text || ""
      ).trim();
      const arrivalTimeLabel = String(
        row?.arrivalTimeLabel || row?.arrivalTime || row?.timeA?.text || ""
      ).trim();
      const departureTimezone =
        String(row?.departureTimezone || row?.timezone || "").trim() ||
        String(departureAirport?.timezone || "").trim();
      const arrivalTimezone =
        String(row?.arrivalTimezone || row?.timezone || "").trim() ||
        String(arrivalAirport?.timezone || "").trim();
      const departureTimezoneLabel =
        String(row?.departureTimezoneLabel || "").trim() ||
        String(departureAirport?.timezoneLabel || "").trim();
      const arrivalTimezoneLabel =
        String(row?.arrivalTimezoneLabel || "").trim() ||
        String(arrivalAirport?.timezoneLabel || "").trim();
      const departureLocalTimeLabel =
        String(row?.departureLocalTimeLabel || "").trim() ||
        buildTourLocalTimeLabel(departureTimeLabel, departureTimezoneLabel);
      const arrivalLocalTimeLabel =
        String(row?.arrivalLocalTimeLabel || "").trim() ||
        buildTourLocalTimeLabel(arrivalTimeLabel, arrivalTimezoneLabel);
      const blockMinutes = Number.isFinite(row?.blockMinutes)
        ? row.blockMinutes
        : Number.isFinite(row?.durationMs)
          ? Math.max(0, Math.round(Number(row.durationMs) / 60000))
          : null;
      const blockTimeLabel =
        String(row?.blockTimeLabel || "").trim() || formatTourDurationLabel(row?.durationMs);
      const parsedRoute = parseTourRoute(
        row?.route ||
          `${String(row?.departureName || row?.fromAirport || "").trim()} (${from}) - ${String(
            row?.destinationName || row?.toAirport || ""
          ).trim()} (${to})`
      );

      return {
        ...row,
        sourceIndex: index,
        flightId,
        linkedFlightId: flightId,
        derivedProgressFlightId,
        flightCode,
        flightNumber,
        tourFlightNumber: flightNumber,
        airline,
        airlineName,
        airlineIcao,
        route: String(row?.route || `${from} - ${to}`).trim(),
        from,
        to,
        fromAirport: String(row?.fromAirport || row?.departureName || parsedRoute.fromAirport || "").trim(),
        toAirport: String(row?.toAirport || row?.destinationName || parsedRoute.toAirport || "").trim(),
        departureTimeLabel,
        arrivalTimeLabel,
        departureLocalTimeLabel,
        arrivalLocalTimeLabel,
        departureTimezone,
        arrivalTimezone,
        departureTimezoneLabel,
        arrivalTimezoneLabel,
        timezone: String(row?.timezone || departureTimezone || arrivalTimezone || "").trim(),
        blockMinutes,
        blockTimeLabel,
        departureTime: departureTimeLabel,
        arrivalTime: arrivalTimeLabel,
        distanceNm: Number.isFinite(row?.distanceNm) ? row.distanceNm : null,
        distanceMi: Number.isFinite(row?.distanceMi)
          ? row.distanceMi
          : Number.isFinite(row?.distance)
            ? row.distance
            : null,
        isTourFlight: true,
        tourPath: tourId,
        tourRowId: flightId,
        tourLeg,
        tourLabel,
        tourName: String(row?.tourName || tourLabel).trim(),
        tourSourceId,
        segment: String(row?.segment || `Leg ${tourLeg}`).trim(),
        isCompleted: Boolean(
          manualProgressEntry?.completed ||
            legacyCanonicalProgressEntry?.completed ||
            derivedProgressEntry?.completed ||
            legacyProgressEntry?.completed
        ),
        // Exposes whether completion came from a manual toggle or derived DVA sync.
        completionSource: String(progressEntry?.source || "").trim() || null,
        completedAt: progressEntry?.completedAt || null,
        completionOrder: Number.isFinite(progressEntry?.completionOrder)
          ? progressEntry.completionOrder
          : null
      };
    }

    const parsedRoute = parseTourRoute(row?.route);
    const parsedFlightCode = parseTourFlightCode(row?.flight);
    const normalizedTourFlightNumber = String(
      parsedFlightCode.flightNumber || row?.flightNumber || ""
    ).trim();
    const normalizedTourFlightCode =
      parsedFlightCode.airline && normalizedTourFlightNumber
        ? `${parsedFlightCode.airline}${normalizedTourFlightNumber}`
        : String(row?.flight || "").trim();
    const blockMinutesMatch = String(row?.schedule || "").match(/\((\d+)h\s+(\d+)m\)/i);
    const blockMinutes = blockMinutesMatch
      ? Number(blockMinutesMatch[1]) * 60 + Number(blockMinutesMatch[2])
      : null;
    const blockTimeLabel = blockMinutesMatch
      ? `${Number(blockMinutesMatch[1])}h ${Number(blockMinutesMatch[2])}m`
      : String(row?.schedule || "").trim();
    const departureTimeLabel = parseTourDepartureTimeLabel(row?.schedule);
    const departureAirport = getAirportByIcao(parsedRoute.from);
    const arrivalAirport = getAirportByIcao(parsedRoute.to);
    const departureTimezone = String(row?.departureTimezone || row?.timezone || "").trim();
    const arrivalTimezone = String(row?.arrivalTimezone || row?.timezone || "").trim();
    const departureTimezoneLabel =
      String(row?.departureTimezoneLabel || "").trim() ||
      String(departureAirport?.timezoneLabel || "").trim();
    const arrivalTimezoneLabel =
      String(row?.arrivalTimezoneLabel || "").trim() ||
      String(arrivalAirport?.timezoneLabel || "").trim();
    const departureLocalTimeLabel =
      String(row?.departureLocalTimeLabel || "").trim() ||
      buildTourLocalTimeLabel(departureTimeLabel, departureTimezoneLabel);
    const arrivalLocalTimeLabel =
      String(row?.arrivalLocalTimeLabel || "").trim() ||
      buildTourLocalTimeLabel(String(row?.arrivalTime || "").trim(), arrivalTimezoneLabel);
    const flightId = buildDvaTourCanonicalRowId(tourId, {
      ...row,
      airline: parsedFlightCode.airline,
      airlineName: parsedFlightCode.airlineName,
      flightNumber: normalizedTourFlightNumber,
      flightCode: normalizedTourFlightCode,
      from: parsedRoute.from,
      to: parsedRoute.to,
      fromAirport: parsedRoute.fromAirport,
      toAirport: parsedRoute.toAirport,
      departureTime: departureTimeLabel,
      arrivalTime: String(row?.arrivalTime || "").trim(),
      equipment: String(row?.aircraft || row?.equipment || "").trim(),
      leg: index + 1,
      route: row?.route || ""
    });
    const derivedProgressFlightId = buildDvaTourDerivedProgressRowId(tourId, {
      ...row,
      airline: parsedFlightCode.airline,
      airlineName: parsedFlightCode.airlineName,
      flightNumber: normalizedTourFlightNumber,
      flightCode: normalizedTourFlightCode,
      from: parsedRoute.from,
      to: parsedRoute.to,
      fromAirport: parsedRoute.fromAirport,
      toAirport: parsedRoute.toAirport,
      departureTime: departureTimeLabel,
      arrivalTime: String(row?.arrivalTime || "").trim(),
      equipment: String(row?.aircraft || row?.equipment || "").trim(),
      leg: index + 1
    });
    const legacyCanonicalFlightId = buildLegacyDvaTourCanonicalRowId(flightId);
    const legacyFlightId = buildLegacyDvaTourRowId(tourId, row);
    // Match the current UI row ID first, then the backend-derived progress ID, so
    // manual completions stay intact while logbook-derived completions still load.
    const manualProgressEntry = progressById?.[flightId] || null;
    const legacyCanonicalProgressEntry = legacyCanonicalFlightId
      ? progressById?.[legacyCanonicalFlightId] || null
      : null;
    const derivedProgressEntry = derivedProgressFlightId
      ? progressById?.[derivedProgressFlightId] || null
      : null;
    const legacyProgressEntry =
      legacyFlightId && legacyRowIdCounts.get(legacyFlightId) === 1
        ? progressById?.[legacyFlightId] || null
        : null;
    const progressEntry =
      manualProgressEntry?.completed
        ? manualProgressEntry
        : legacyCanonicalProgressEntry?.completed
          ? legacyCanonicalProgressEntry
          : derivedProgressEntry?.completed
            ? derivedProgressEntry
            : legacyProgressEntry?.completed
              ? legacyProgressEntry
              : null;
    const tourLeg = index + 1;

    return {
      ...row,
      sourceIndex: index,
      ...parsedRoute,
      flightId,
      linkedFlightId: flightId,
      derivedProgressFlightId,
      flightCode: normalizedTourFlightCode,
      flightNumber: normalizedTourFlightNumber,
      tourFlightNumber: normalizedTourFlightNumber,
      airline: parsedFlightCode.airline,
      airlineName: parsedFlightCode.airlineName,
      airlineIcao: parsedFlightCode.airlineIcao,
      route: String(row?.route || "").trim(),
      blockMinutes,
      blockTimeLabel,
      departureTimeLabel,
      departureLocalTimeLabel,
      arrivalLocalTimeLabel,
      departureTimezone,
      arrivalTimezone,
      departureTimezoneLabel,
      arrivalTimezoneLabel,
      timezone: String(row?.timezone || departureTimezone || arrivalTimezone || "").trim(),
      distanceNm: null,
      distanceMi: Number.isFinite(row?.distance_mi) ? row.distance_mi : null,
      isTourFlight: true,
      tourPath: tourId,
      tourRowId: flightId,
      tourLeg,
      tourLabel,
      tourName: tourLabel,
      tourSourceId,
      isCompleted: Boolean(
        manualProgressEntry?.completed ||
          legacyCanonicalProgressEntry?.completed ||
          derivedProgressEntry?.completed ||
          legacyProgressEntry?.completed
      ),
      // Exposes whether completion came from a manual toggle or derived DVA sync.
      completionSource: String(progressEntry?.source || "").trim() || null,
      completedAt: progressEntry?.completedAt || null,
      completionOrder: Number.isFinite(progressEntry?.completionOrder)
        ? progressEntry.completionOrder
        : null
    };
  });
}
