function normalizeTourCompletionDateValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const normalizedValue = String(value).trim();
  if (!normalizedValue) {
    return null;
  }

  const numericValue = Number(normalizedValue);
  const parsedDate = Number.isFinite(numericValue)
    ? new Date(numericValue < 1e12 ? numericValue * 1000 : numericValue)
    : new Date(normalizedValue);

  return Number.isFinite(parsedDate.getTime()) ? parsedDate : null;
}

// Formats the latest completion timestamp from a tour's completed rows.
export function getTourCompletionDateLabel(rows = []) {
  const completionDates = (Array.isArray(rows) ? rows : [])
    .map((row) => (row?.isCompleted ? normalizeTourCompletionDateValue(row?.completedAt) : null))
    .filter(Boolean);

  if (!completionDates.length) {
    return "";
  }

  const completionDate = completionDates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  );

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  }).format(completionDate);
}
