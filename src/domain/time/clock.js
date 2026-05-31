// Converts clock labels into minute counts and evaluates schedule time windows.
export function parseClockMinutes(clockValue) {
  const normalized = String(clockValue || "").trim();
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return null;
  }

  const [hoursText, minutesText] = normalized.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function matchesLocalTimeWindow(clockValue, filterValue, filterKind) {
  const filterValues = Array.isArray(filterValue)
    ? filterValue
    : filterValue
      ? [filterValue]
      : [];

  if (!filterValues.length) {
    return true;
  }

  const totalMinutes = parseClockMinutes(clockValue);
  if (totalMinutes === null) {
    return false;
  }

  return filterValues.some((value) => {
    switch (value) {
      case "red-eye":
        return filterKind === "departure"
          ? totalMinutes >= 23 * 60 || totalMinutes < 2 * 60
          : totalMinutes >= 2 * 60 && totalMinutes < 6 * 60;
      case "morning":
        return totalMinutes >= 6 * 60 && totalMinutes < 12 * 60;
      case "afternoon":
        return totalMinutes >= 12 * 60 && totalMinutes < 18 * 60;
      case "evening":
        return totalMinutes >= 18 * 60 && totalMinutes < 23 * 60;
      default:
        return false;
    }
  });
}
