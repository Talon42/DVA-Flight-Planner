function normalizeStatus(value) {
  return String(value ?? "").trim().toUpperCase();
}

// Returns the row highlight used for logbook status emphasis and selection override.
export function getLogbookRowClassName(row, selectedRowId = null) {
  const rawStatus = normalizeStatus(row?.statusRaw);
  const isSelected = selectedRowId != null && String(row?.id ?? "") === String(selectedRowId);

  if (isSelected) {
    return "bg-[#D7E8F7] text-[#0B1F36] hover:bg-[#D7E8F7] dark:bg-[#1F466E] dark:text-white dark:hover:bg-[#1F466E]";
  }

  if (rawStatus === "REJECTED") {
    return [
      "bg-[rgba(200,16,46,0.18)]",
      "even:bg-[rgba(200,16,46,0.18)]",
      "hover:bg-[rgba(200,16,46,0.22)]",
      "text-[#7F1020]",
      "dark:bg-[rgba(200,16,46,0.20)]",
      "dark:even:bg-[rgba(200,16,46,0.20)]",
      "dark:hover:bg-[rgba(200,16,46,0.24)]",
      "dark:text-white"
    ].join(" ");
  }

  if (["SUBMITTED", "PENDING", "HOLD"].includes(rawStatus)) {
    return [
      "bg-[rgba(183,121,31,0.20)]",
      "even:bg-[rgba(183,121,31,0.20)]",
      "hover:bg-[rgba(183,121,31,0.24)]",
      "text-[#5F3B00]",
      "dark:bg-[rgba(246,197,109,0.18)]",
      "dark:even:bg-[rgba(246,197,109,0.18)]",
      "dark:hover:bg-[rgba(246,197,109,0.22)]",
      "dark:text-white"
    ].join(" ");
  }

  return "";
}
