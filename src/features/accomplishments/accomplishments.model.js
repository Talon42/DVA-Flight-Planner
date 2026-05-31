export const ACCOMPLISHMENT_REQUIREMENTS = {
  AIRPORTS_VISITED: "airports visited",
  ARRIVAL_AIRPORTS: "arrival airports"
};

function normalizeAirportCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeAccomplishments(accomplishments) {
  return Object.entries(accomplishments || {})
    .map(([name, entry]) => {
      const airports = Array.isArray(entry?.icao_codes)
        ? entry.icao_codes.map(normalizeAirportCode).filter(Boolean)
        : [];

      return {
        name,
        requirement: String(entry?.requirement || "").trim().toLowerCase(),
        airports
      };
    })
    .filter((entry) => entry.name && entry.airports.length)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getAccomplishmentCompletionSet(accomplishment, logbookAirportProgress) {
  const requirement = String(accomplishment?.requirement || "").trim().toLowerCase();

  if (requirement === ACCOMPLISHMENT_REQUIREMENTS.ARRIVAL_AIRPORTS) {
    return new Set(logbookAirportProgress?.arrivalAirports || []);
  }

  return new Set(logbookAirportProgress?.visitedAirports || []);
}

export function buildAccomplishmentRows(accomplishment, logbookAirportProgress) {
  const completedAirports = getAccomplishmentCompletionSet(
    accomplishment,
    logbookAirportProgress
  );

  return (accomplishment?.airports || [])
    .map((airport, index) => ({
      id: `${accomplishment.name}:${airport}:${index}`,
      airport,
      sourceIndex: index,
      isCompleted: completedAirports.has(airport)
    }))
    .sort((left, right) => {
      if (left.isCompleted !== right.isCompleted) {
        return left.isCompleted ? 1 : -1;
      }

      return left.airport.localeCompare(right.airport);
    });
}

export function getAccomplishmentCompletedCount(rows) {
  return rows.reduce((total, row) => total + (row.isCompleted ? 1 : 0), 0);
}
