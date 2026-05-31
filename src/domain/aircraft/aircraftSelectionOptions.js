const AIRCRAFT_MANUFACTURER_PREFIXES = [
  ["AIRBUS", "Airbus"],
  ["ANTONOV", "Antonov"],
  ["ATR", "ATR"],
  ["AVRO", "Avro"],
  ["BAE", "BAE"],
  ["BEECHCRAFT", "Beechcraft"],
  ["BOEING", "Boeing"],
  ["BOMBARDIER", "Bombardier"],
  ["CANADAIR", "Canadair"],
  ["CESSNA", "Cessna"],
  ["CHALLENGER", "Bombardier"],
  ["CIRRUS", "Cirrus"],
  ["DAHER", "Daher"],
  ["DIAMOND", "Diamond"],
  ["DOUGLAS", "Douglas"],
  ["EMBRAER", "Embraer"],
  ["ERJ-", "Embraer"],
  ["FALCON", "Dassault"],
  ["FOKKER", "Fokker"],
  ["GULFSTREAM", "Gulfstream"],
  ["HAWKER", "Hawker"],
  ["HONDAJET", "Honda"],
  ["KING AIR", "Beechcraft"],
  ["LEARJET", "Learjet"],
  ["LOCKHEED", "Lockheed"],
  ["MCDONNELL DOUGLAS", "McDonnell Douglas"],
  ["NAMC", "NAMC"],
  ["PILATUS", "Pilatus"],
  ["PIPER", "Piper"],
  ["SAAB", "Saab"],
  ["SHORT", "Short"],
  ["SOCATA", "Socata"],
  ["TECNAM", "Tecnam"],
  ["TUPOLEV", "Tupolev"],
  ["VICKERS", "Vickers"],
  ["YAK", "Yakovlev"],
  ["YAKOVLEV", "Yakovlev"]
];

function normalizeText(value) {
  return String(value ?? "").trim();
}

// Infers the manufacturer group used by every aircraft selector so grouped sections stay aligned.
export function inferAircraftManufacturer(aircraftName) {
  const normalized = normalizeText(aircraftName).toUpperCase();
  if (!normalized) {
    return "Other";
  }

  // Keep the A220 family grouped under Airbus even when the source label includes Bombardier.
  if (normalized.includes("A220")) {
    return "Airbus";
  }

  for (const [prefix, manufacturer] of AIRCRAFT_MANUFACTURER_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return manufacturer;
    }
  }

  if (normalized.startsWith("A3") || normalized.startsWith("A2") || normalized.startsWith("A35")) {
    return "Airbus";
  }

  if (normalized.startsWith("B7") || normalized.startsWith("B38") || normalized.startsWith("B39")) {
    return "Boeing";
  }

  if (normalized.startsWith("CRJ")) {
    return "Bombardier";
  }

  if (normalized.startsWith("E1")) {
    return "Embraer";
  }

  if (normalized.startsWith("MD-") || normalized.startsWith("MD ")) {
    return "McDonnell Douglas";
  }

  return "Other";
}

// Sorts aircraft options by manufacturer group first, then by the displayed aircraft label.
export function sortAircraftSelectOptions(left, right) {
  const leftGroup = normalizeText(left?.groupLabel) || "Other";
  const rightGroup = normalizeText(right?.groupLabel) || "Other";
  const leftSort = normalizeText(left?.sortLabel || left?.selectedLabel || left?.label || left?.value);
  const rightSort = normalizeText(right?.sortLabel || right?.selectedLabel || right?.label || right?.value);
  const leftLabel = normalizeText(left?.label || left?.selectedLabel || left?.value);
  const rightLabel = normalizeText(right?.label || right?.selectedLabel || right?.value);

  return (
    leftGroup.localeCompare(rightGroup) ||
    leftSort.localeCompare(rightSort) ||
    leftLabel.localeCompare(rightLabel)
  );
}

// Maps aircraft rows into the shared select option shape and applies the standard grouped sort.
export function buildGroupedAircraftSelectOptions(rows, mapRowToOption) {
  if (!Array.isArray(rows) || typeof mapRowToOption !== "function") {
    return [];
  }

  return rows.map((row) => mapRowToOption(row)).filter(Boolean).sort(sortAircraftSelectOptions);
}
