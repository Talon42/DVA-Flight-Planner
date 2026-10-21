// Builds the trusted SimBrief latest-briefing URL for a stored static flight identifier.
export function buildSimBriefLatestFlightUrl(staticId) {
  const normalizedStaticId = String(staticId || "").trim();
  return normalizedStaticId
    ? `https://dispatch.simbrief.com/briefing/latest?static_id=${encodeURIComponent(normalizedStaticId)}`
    : "";
}
