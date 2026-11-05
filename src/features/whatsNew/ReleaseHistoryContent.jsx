import MarkdownHelpContent from "../../components/help/MarkdownHelpContent";
import { cn } from "../../components/ui/cn";
import { labelTextClassName } from "../../components/ui/typography";

// Separates release metadata from note headings and keeps the active release visible while scrolling.
export default function ReleaseHistoryContent({ releases }) {
  return (
    <div className="grid gap-6">
      {releases.map((release, index) => (
        <section
          key={release.version}
          aria-label={`${release.version} release`}
          className={cn(
            "rounded-none border border-l-4 border-[color:var(--line)] bg-[var(--surface)]",
            index === 0 && "border-l-[color:var(--delta-red)]"
          )}
        >
          <header className="sticky top-0 z-10 grid gap-1.5 border-b border-[color:var(--line)] bg-[var(--surface-panel)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="m-0 text-[1rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--text-heading)]">
                {release.version}
              </h4>
              <span className={cn(
                "border border-[color:var(--line)] bg-[var(--surface)] px-2 py-1 text-[var(--text-muted)]",
                labelTextClassName,
                index === 0 && "border-[color:var(--delta-red)] text-[var(--delta-red)]"
              )}>
                {index === 0 ? "Latest release" : "Previous release"}
              </span>
            </div>
            <time dateTime={release.publishedAt} className="text-[0.75rem] leading-snug text-[var(--text-muted)]">
              Published {new Date(release.publishedAt).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
              })}
            </time>
          </header>
          <div className="p-3 [&>div]:text-[0.85rem] [&>div]:leading-5 [&_h1]:text-[1.05rem] [&_h2]:text-[0.95rem] [&_h3]:text-[0.88rem] [&_p]:leading-5 [&_li]:leading-5 [&_li>p]:leading-5">
            <MarkdownHelpContent markdown={release.notes || "_No release notes were provided._"} />
          </div>
        </section>
      ))}
    </div>
  );
}
