import { GITHUB_RELEASES_API_URL } from "./updateCheck.client.js";

// Loads every page so older standard releases remain visible beyond GitHub's default page size.
export async function fetchReleaseHistory({ signal } = {}) {
  const releases = [];
  let page = 1;

  while (true) {
    const response = await fetch(`${GITHUB_RELEASES_API_URL}?per_page=100&page=${page}`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`GitHub release history lookup failed with status ${response.status}.`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("GitHub returned an invalid release history.");
    }

    for (const release of payload) {
      // Drafts and prereleases must never appear in the public release history card.
      if (!release || release.draft !== false || release.prerelease !== false) continue;
      const version = typeof release.tag_name === "string" ? release.tag_name.trim() : "";
      const publishedAt = typeof release.published_at === "string" ? release.published_at : "";
      if (!version || !Number.isFinite(Date.parse(publishedAt))) continue;

      releases.push({
        version,
        name: typeof release.name === "string" ? release.name.trim() : "",
        notes: typeof release.body === "string" ? release.body.trim() : "",
        publishedAt
      });
    }

    if (payload.length < 100) break;
    page += 1;
  }

  return releases.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}
