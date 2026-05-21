import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { cn } from "../ui/cn";
import { sectionTitleTextClassName } from "../ui/typography";
import { mutedTextStackClassName } from "../ui/patterns";

const SAFE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a || []), "href", "title", "target", "rel"],
    img: [...(defaultSchema.attributes?.img || []), "src", "alt", "title", "loading"],
    code: [...(defaultSchema.attributes?.code || []), "className"],
    th: [...(defaultSchema.attributes?.th || []), "align"],
    td: [...(defaultSchema.attributes?.td || []), "align"],
    input: [...(defaultSchema.attributes?.input || []), "type", "checked", "disabled"]
  }
};

function isExternalLink(href) {
  return /^https?:\/\//i.test(String(href || "").trim());
}

function isBlockCode(node, className) {
  return Boolean(node?.parentName === "pre" || node?.tagName === "code" && /^language-/.test(className || ""));
}

function collectHeadingText(children) {
  if (Array.isArray(children)) {
    return children.map(collectHeadingText).join("");
  }

  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }

  if (children && typeof children === "object" && "props" in children) {
    return collectHeadingText(children.props?.children);
  }

  return "";
}

// Matches GitHub-style heading slugs closely enough for intra-README anchors.
function slugifyHeading(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeHeadingSourceText(text) {
  return String(text || "")
    .replace(/\s+#+\s*$/, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function normalizeAnchorTargetId(href) {
  return slugifyHeading(decodeURIComponent(String(href || "").replace(/^#/, "")).trim().toLowerCase());
}

function buildHeadingIdMap(markdown) {
  const headingIdMap = new Map();
  const seenIds = new Map();
  const lines = String(markdown || "").split(/\r?\n/);

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) {
      continue;
    }

    const headingText = normalizeHeadingSourceText(match[2]);
    const baseId = slugifyHeading(headingText);

    if (!baseId) {
      continue;
    }

    const nextCount = seenIds.get(baseId) || 0;
    seenIds.set(baseId, nextCount + 1);

    const resolvedId = nextCount === 0 ? baseId : `${baseId}-${nextCount}`;
    if (!headingIdMap.has(headingText)) {
      headingIdMap.set(headingText, resolvedId);
    }
  }

  return headingIdMap;
}

// Renders sanitized GitHub-flavored markdown with app-consistent element styling.
export default function MarkdownHelpContent({ markdown = "", scrollContainerRef = null }) {
  const content = String(markdown || "").trim();
  const headingIdMap = useMemo(() => buildHeadingIdMap(markdown), [markdown]);

  if (!content) {
    return (
      <div
        className={cn(
          "grid gap-2 rounded-none bg-[var(--surface)] p-4 font-[inherit] text-[0.95rem] leading-6 text-[var(--text-primary)]",
          mutedTextStackClassName
        )}
      >
        <p className="m-0 text-[var(--text-muted)]">README content is not available.</p>
      </div>
    );
  }

  return (
    <div className="font-[inherit] text-[0.95rem] leading-6 text-[var(--text-primary)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, SAFE_SCHEMA]]}
        components={{
          h1: ({ children }) => (
            <h1
              id={
                headingIdMap.get(normalizeHeadingSourceText(collectHeadingText(children))) ||
                slugifyHeading(normalizeHeadingSourceText(collectHeadingText(children)))
              }
              className={cn(
                "mt-0 mb-2 scroll-mt-4 font-[inherit] text-[1.35rem] font-semibold leading-tight text-[var(--text-heading)] first:mt-0",
                sectionTitleTextClassName
              )}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              id={
                headingIdMap.get(normalizeHeadingSourceText(collectHeadingText(children))) ||
                slugifyHeading(normalizeHeadingSourceText(collectHeadingText(children)))
              }
              className={cn(
                "mt-6 mb-2 scroll-mt-4 border-b border-[color:var(--line)] pb-2 font-[inherit] text-[1.1rem] font-semibold leading-tight text-[var(--text-heading)] first:mt-0",
                sectionTitleTextClassName
              )}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              id={
                headingIdMap.get(normalizeHeadingSourceText(collectHeadingText(children))) ||
                slugifyHeading(normalizeHeadingSourceText(collectHeadingText(children)))
              }
              className={cn(
                "mt-4 mb-1 scroll-mt-4 font-[inherit] text-[1rem] font-semibold leading-tight text-[var(--text-heading)] first:mt-0",
                sectionTitleTextClassName
              )}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="my-3 font-[inherit] leading-6 text-[inherit]">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc list-outside space-y-1 pl-6 font-[inherit] leading-6">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal list-outside space-y-1 pl-6 font-[inherit] leading-6">{children}</ol>,
          li: ({ children }) => <li className="my-0 font-[inherit] leading-6 [&>p]:my-0 [&>p]:leading-6">{children}</li>,
          a: ({ href, children, ...props }) => {
            const external = isExternalLink(href);
            const internalHash = String(href || "").startsWith("#");

            if (internalHash) {
              const targetId = normalizeAnchorTargetId(href);

              return (
                <a
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!targetId) {
                      return;
                    }

                    const container = scrollContainerRef?.current;
                    const escapedTargetId = CSS.escape(targetId);
                    const target = container?.querySelector(`#${escapedTargetId}`);

                    if (container && target) {
                      const containerRect = container.getBoundingClientRect();
                      const targetRect = target.getBoundingClientRect();

                      container.scrollTo({
                        top: container.scrollTop + targetRect.top - containerRect.top - 8,
                        behavior: "smooth"
                      });
                    }
                  }}
                  className="font-[inherit] text-[var(--delta-blue)] no-underline hover:underline"
                  {...props}
                >
                  {children}
                </a>
              );
            }

            return (
              <a
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer noopener" : undefined}
                className="font-[inherit] text-[var(--delta-blue)] no-underline hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          hr: () => <hr className="my-4 border-0 border-t border-[color:var(--line)]" />,
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-4 border-[color:var(--line)] pl-4 font-[inherit] text-[var(--text-muted)]">
              {children}
            </blockquote>
          ),
          code: ({ className, children, node, ...props }) => {
            if (!isBlockCode(node, className)) {
              return (
                <code
                  className={cn(
                    "inline-flex max-w-full items-center rounded-none border border-[color:var(--line)] bg-[var(--input-bg)] px-1.5 py-0.5 font-mono text-[0.82em] leading-none align-baseline text-[var(--text-heading)]",
                    className
                  )}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <code
                className={cn("block min-w-max whitespace-pre font-mono text-[0.82rem] leading-relaxed", className)}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-none border border-[color:var(--line)] bg-[var(--surface)] p-4 font-[inherit] text-[0.92rem] leading-6 text-[var(--text-primary)]">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto">
              <table className="min-w-max border-collapse border border-[color:var(--line)]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[var(--input-bg)]">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr className="border-b border-[color:var(--line)] last:border-b-0">{children}</tr>,
          th: ({ children, align }) => (
            <th
              className={cn(
                "border-r border-[color:var(--line)] px-3 py-2 text-left text-[0.84rem] font-semibold leading-5 text-[var(--text-heading)] last:border-r-0",
                align === "center" && "text-center",
                align === "right" && "text-right"
              )}
            >
              {children}
            </th>
          ),
          td: ({ children, align }) => (
            <td
              className={cn(
                "border-r border-[color:var(--line)] px-3 py-2 align-top text-[0.84rem] leading-5 text-[var(--text-primary)] last:border-r-0",
                align === "center" && "text-center",
                align === "right" && "text-right"
              )}
            >
              {children}
            </td>
          ),
          img: ({ src, alt, title }) => (
            <img
              src={src}
              alt={alt || ""}
              title={title}
              className="max-w-full rounded-none border border-[color:var(--line)]"
              loading="lazy"
            />
          ),
          input: ({ type, checked }) => (
            <input
              type={type}
              checked={checked}
              disabled
              readOnly
              className="mr-2 translate-y-[1px] align-middle accent-[var(--delta-blue)]"
            />
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
