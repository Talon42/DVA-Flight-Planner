# What's New Content

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
