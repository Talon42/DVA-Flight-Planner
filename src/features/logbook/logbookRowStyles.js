// Returns the semantic row class used for logbook status emphasis.
export function getLogbookRowClassName(row) {
  const status = String(row?.statusCanonical || "unknown");

  if (status === "rejected") {
    return "logbook-row-status-rejected";
  }

  if (status === "submitted" || status === "held") {
    return "logbook-row-status-pending";
  }

  return "";
}
