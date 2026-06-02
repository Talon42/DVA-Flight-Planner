import { formatNumber } from "../../domain/formatting/formatters.js";

// Formats addon scan timestamps without changing the legacy display text.
export function formatScanTimestamp(value) {
  if (!value) {
    return "";
  }

  const normalized = String(value);
  if (/^\d+\.\d+$/.test(normalized)) {
    const millis = Number(normalized) * 1000;
    if (Number.isFinite(millis)) {
      return new Date(millis).toLocaleString();
    }
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleString();
}

// Builds the one-line addon scan summary shown in the app shell.
export function formatAddonScanSummary(addonScan) {
  if (!addonScan?.roots?.length) {
    return "";
  }

  const scanStamp = formatScanTimestamp(addonScan.lastScannedAt);
  const airportsCached = Number(addonScan?.airports?.length || 0);
  const baseSummary = `${
    airportsCached > 0 ? `${formatNumber(airportsCached)} addon airports cached` : "No addon airports cached"
  }${scanStamp ? ` · Last scanned ${scanStamp}` : ""}`;

  if (addonScan.lastError) {
    return `${baseSummary} ${addonScan.lastError}`;
  }

  return baseSummary;
}
