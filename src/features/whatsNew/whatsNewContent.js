import packageInfo from "../../../package.json";

export const WHATS_NEW_ENABLED = true;
export const WHATS_NEW_APP_VERSION = String(packageInfo.version || "").trim();

function warnWhatsNewContent(message, details = "") {
  if (import.meta.env.DEV) {
    console.warn(`[What's New] ${message}`, details);
  }
}

function parseContentNumber(filePath, extension) {
  const matcher = new RegExp(`NewContent(\\d{2})\\.${extension}$`);
  const match = String(filePath || "").match(matcher);
  return match ? match[1] : "";
}

function parseFrontmatter(rawMarkdown) {
  const source = String(rawMarkdown || "").replace(/\r\n/g, "\n").trim();

  if (!source.startsWith("---")) {
    return {
      frontmatter: {},
      body: source,
      malformedFrontmatter: false
    };
  }

  const lines = source.split("\n");
  const closingFenceIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");

  if (closingFenceIndex < 0) {
    return {
      frontmatter: {},
      body: "",
      malformedFrontmatter: true
    };
  }

  const frontmatterLines = lines.slice(1, closingFenceIndex);
  const body = lines.slice(closingFenceIndex + 1).join("\n").trim();
  const frontmatter = {};

  for (const line of frontmatterLines) {
    const trimmedLine = String(line || "").trim();
    if (!trimmedLine) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    if (key === "eyebrow" || key === "title" || key === "imageAlt" || key === "layout") {
      frontmatter[key] = value;
    }
  }

  return {
    frontmatter,
    body,
    malformedFrontmatter: false
  };
}

function buildMarkdownRegistry(markdownModules) {
  const registry = new Map();

  for (const [filePath, rawMarkdown] of Object.entries(markdownModules)) {
    const number = parseContentNumber(filePath, "md");
    if (!number) {
      continue;
    }

    const existingEntries = registry.get(number) || [];
    existingEntries.push({ filePath, rawMarkdown });
    registry.set(number, existingEntries);
  }

  return registry;
}

function buildImageRegistry(imageModules) {
  const registry = new Map();

  for (const [filePath, imageSrc] of Object.entries(imageModules)) {
    const number = parseContentNumber(filePath, "png");
    if (!number) {
      continue;
    }

    const existingEntries = registry.get(number) || [];
    existingEntries.push({ filePath, imageSrc: String(imageSrc || "").trim() || null });
    registry.set(number, existingEntries);
  }

  return registry;
}

function resolveCardFromMarkdownEntry(number, markdownEntry, imageRegistry) {
  const parsed = parseFrontmatter(markdownEntry.rawMarkdown);
  const title = String(parsed.frontmatter.title || "").trim();

  if (parsed.malformedFrontmatter) {
    warnWhatsNewContent("Malformed frontmatter.", { filePath: markdownEntry.filePath });
  }

  if (!title) {
    warnWhatsNewContent("Missing required title; skipping card.", {
      filePath: markdownEntry.filePath,
      number
    });
    return null;
  }

  // Layout defaults to image cards so older content keeps behaving the same.
  const rawLayout = String(parsed.frontmatter.layout || "").trim().toLowerCase();
  let layout = "image";

  if (rawLayout && rawLayout !== "image" && rawLayout !== "text") {
    warnWhatsNewContent("Unknown layout; falling back to image.", {
      filePath: markdownEntry.filePath,
      number,
      layout: rawLayout
    });
  } else if (rawLayout === "text") {
    layout = "text";
  }

  const imageEntries = imageRegistry.get(number) || [];
  if (imageEntries.length > 1) {
    warnWhatsNewContent("Duplicate PNG suffix found; using first image.", {
      number,
      filePaths: imageEntries.map((entry) => entry.filePath)
    });
  }

  const imageSrc = imageEntries[0]?.imageSrc || null;
  // Text cards do not need a screenshot companion.
  if (layout === "image" && !imageSrc) {
    warnWhatsNewContent("Missing PNG screenshot; rendering placeholder.", {
      number,
      expectedFileName: `NewContent${number}.png`
    });
  }

  const description = String(parsed.body || "").trim();
  const fallbackImageAlt = `What's New screenshot ${number}`;

  return {
    id: `whats-new-${number}`,
    index: Number.parseInt(number, 10),
    number,
    layout,
    eyebrow: String(parsed.frontmatter.eyebrow || "").trim() || "What's New",
    title,
    description,
    imageSrc: layout === "text" ? null : imageSrc,
    imageAlt:
      layout === "text"
        ? String(parsed.frontmatter.imageAlt || "").trim() || null
        : String(parsed.frontmatter.imageAlt || "").trim() || fallbackImageAlt
  };
}

function buildWhatsNewCards() {
  const markdownModules = import.meta.glob("./content/NewContent*.md", {
    query: "?raw",
    import: "default",
    eager: true
  });

  const imageModules = import.meta.glob("./content/NewContent*.png", {
    eager: true,
    import: "default"
  });

  const markdownRegistry = buildMarkdownRegistry(markdownModules);
  const imageRegistry = buildImageRegistry(imageModules);
  const numbers = [...markdownRegistry.keys()].sort((left, right) => Number(left) - Number(right));
  const cards = [];

  for (const number of numbers) {
    const markdownEntries = markdownRegistry.get(number) || [];

    if (markdownEntries.length > 1) {
      warnWhatsNewContent("Duplicate Markdown suffix found; keeping first valid card.", {
        number,
        filePaths: markdownEntries.map((entry) => entry.filePath)
      });
    }

    const sortedEntries = [...markdownEntries].sort((left, right) =>
      left.filePath.localeCompare(right.filePath)
    );

    for (const markdownEntry of sortedEntries) {
      const card = resolveCardFromMarkdownEntry(number, markdownEntry, imageRegistry);
      if (card) {
        cards.push(card);
        break;
      }
    }
  }

  return cards;
}

export const whatsNewCards = buildWhatsNewCards();
