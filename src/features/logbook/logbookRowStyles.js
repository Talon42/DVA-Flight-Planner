function normalizeStatus(value) {
  return String(value ?? "").trim().toUpperCase();
}

// Returns the row highlight used for logbook status emphasis.
export function getLogbookRowClassName(row) {
  const rawStatus = normalizeStatus(row?.statusRaw);

  if (rawStatus === "REJECTED") {
    return [
      "!bg-[rgba(200,16,46,0.52)]",
      "!even:bg-[rgba(200,16,46,0.52)]",
      "!hover:bg-[rgba(200,16,46,0.60)]",
      "text-white",
      "dark:bg-[rgba(200,16,46,0.20)]",
      "dark:even:bg-[rgba(200,16,46,0.20)]",
      "dark:hover:bg-[rgba(200,16,46,0.24)]",
      "dark:text-white"
    ].join(" ");
  }

  if (["SUBMITTED", "PENDING", "HOLD"].includes(rawStatus)) {
    return [
      "!bg-[rgba(246,197,109,0.54)]",
      "!even:bg-[rgba(246,197,109,0.54)]",
      "!hover:bg-[rgba(246,197,109,0.62)]",
      "text-[var(--delta-blue-deep)]",
      "dark:bg-[rgba(246,197,109,0.18)]",
      "dark:even:bg-[rgba(246,197,109,0.18)]",
      "dark:hover:bg-[rgba(246,197,109,0.22)]",
      "dark:text-white"
    ].join(" ");
  }

  return "";
}
