function normalizeStatus(value) {
  return String(value ?? "").trim().toUpperCase();
}

// Returns the semantic row class used for logbook status emphasis.
export function getLogbookRowClassName(row) {
  const rawStatus = normalizeStatus(row?.statusRaw);

  if (rawStatus === "REJECTED") {
    return "logbook-row-status-rejected";
  }

  if (["SUBMITTED", "PENDING", "HOLD"].includes(rawStatus)) {
    return "logbook-row-status-pending";
  }

  return "";
}
