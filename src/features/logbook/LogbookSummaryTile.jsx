import { cn } from "../../components/ui/cn";
import { bodyMdTextClassName } from "../../components/ui/typography";

// Renders a compact dashboard tile for logbook summary values.
export default function LogbookSummaryTile({
  label,
  value,
  meta = "",
  title = "",
  className = ""
}) {
  return (
    <section
      className={cn(
        "grid min-w-0 gap-1 border border-[color:var(--line)] bg-[var(--surface)] px-2.5 py-2 dark:bg-[var(--surface-raised)] bp-1920:px-3 bp-1920:py-2.5",
        className
      )}
    >
      <p className={cn("m-0 text-[var(--eyebrow)] font-semibold uppercase tracking-[0.12em]", bodyMdTextClassName)}>{label}</p>
      <p
        className={cn(
          "m-0 min-w-0 break-words text-[var(--text-heading)] font-semibold",
          bodyMdTextClassName
        )}
        title={title || undefined}
      >
        {value || "N/A"}
      </p>
      {meta ? (
        <p className={cn("m-0 text-[var(--text-muted)]", bodyMdTextClassName)} title={title || undefined}>
          {meta}
        </p>
      ) : null}
    </section>
  );
}
