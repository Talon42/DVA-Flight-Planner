# What's New Content

Release History is a permanent final card populated automatically from the public
GitHub releases for `Talon42/DVA-Flight-Planner`. It needs no local Markdown or PNG.
Only published standard releases appear; drafts and prereleases are excluded.
All pages are loaded and releases are sorted by publication date, newest first.
The history uses the shared sanitized GitHub-flavored Markdown renderer.
Each release has a separate bordered section with a sticky version/date header
and a latest/previous label to make release boundaries clear while scrolling.
Loading, empty, and unavailable states remain accessible manually. Reopening
What's New retries a failed request; failed or empty history never blocks startup.

The files below are optional feature cards for the upcoming release. They always
appear before Release History. Remove cards from previous releases when preparing
the next release. Automatic display still uses the installed version's seen setting.

Use `NewContent##.md` for every card.

Add `NewContent##.png` only for image cards.

Rules:

- Use two-digit numbering.
- Gaps are allowed; cards are sorted by numeric suffix.
- Keep the Markdown and PNG numeric suffixes matched for image cards.
- The Markdown frontmatter defines eyebrow, title, optional layout, and imageAlt.
- Use `layout: image` or omit `layout` for screenshot cards.
- Use `layout: text` for text-only cards.
- Text-only cards do not need PNG companions.
- Unknown layout values fall back to `image` during development with a warning.
- The Markdown body renders as plain app body text or card body copy depending on layout.
- Missing PNG files render a placeholder frame for `layout: image` cards and should be fixed before enabling release content.
- Text cards support a limited Markdown subset only:
  - `## Heading`
  - `### Heading`
  - `- Bullet item`
  - `**bold**`
  - `_italic_`
- Text cards do not support raw HTML, links, tables, images, code blocks, or nested Markdown.
- Set WHATS_NEW_ENABLED = true only when release content is ready.
- Commit content changes before running release.ps1.

Release workflow:

1. Replace/update NewContent*.md and NewContent*.png files.
2. Set WHATS_NEW_ENABLED = true when content is release-ready.
3. Commit the What's New content changes.
4. Run release.ps1.
