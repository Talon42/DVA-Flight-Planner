// Always appends history after optional release-specific feature cards, including offline states.
export function buildCardsWithReleaseHistory(featureCards, { status, releases = [] }) {
  let description = "Loading release history from GitHub…";

  if (status === "error") {
    description = "Release history could not be loaded. Check your connection and reopen What's New to try again.";
  } else if (status === "ready") {
    description = releases.length
      ? releases.map((release) => {
        const date = new Date(release.publishedAt).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
        });
        const title = release.name && release.name !== release.version
          ? `${release.version} — ${release.name}`
          : release.version;
        return `## ${title}\n\nPublished ${date}\n\n${release.notes || "_No release notes were provided._"}`;
      }).join("\n\n---\n\n")
      : "No published releases are available yet.";
  }

  return [...featureCards, {
    id: "release-history",
    layout: "text",
    markdown: true,
    eyebrow: "GitHub Releases",
    title: "Release History",
    releases: status === "ready" ? releases : [],
    description
  }];
}
