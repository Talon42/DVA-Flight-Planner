import { getVersion } from "@tauri-apps/api/app";

export const GITHUB_LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/Talon42/DVA-Flight-Planner/releases/latest";
export const GITHUB_RELEASES_PAGE_URL =
  "https://github.com/Talon42/DVA-Flight-Planner/releases/latest";

function normalizeVersionPart(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseVersion(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^v/i, "");

  const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return null;
  }

  return [
    normalizeVersionPart(match[1]),
    normalizeVersionPart(match[2]),
    normalizeVersionPart(match[3])
  ];
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) {
    return 0;
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }

  return 0;
}

function normalizeReleaseVersion(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

export async function checkForAppUpdate() {
  const currentVersion = normalizeReleaseVersion(await getVersion());
  const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub release lookup failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const latestVersion = normalizeReleaseVersion(payload?.tag_name || payload?.name || "");
  const releaseUrl = String(payload?.html_url || GITHUB_RELEASES_PAGE_URL).trim() || GITHUB_RELEASES_PAGE_URL;

  return {
    currentVersion,
    latestVersion,
    releaseUrl,
    updateAvailable: Boolean(currentVersion && latestVersion) && compareVersions(latestVersion, currentVersion) > 0
  };
}
