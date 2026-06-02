import { labelTextClassName, bodySmTextClassName } from "../../components/ui/typography";
import { cn } from "../../components/ui/cn";

function DetailSection({ title, items }) {
  if (!items?.length) {
    return null;
  }

  return (
    <section className="grid gap-2.5 border border-[color:var(--line)] bg-[rgba(255,255,255,0.3)] p-3 dark:bg-[rgba(4,12,22,0.22)]">
      <p className={cn("m-0 text-[var(--text-heading)]", labelTextClassName)}>{title}</p>
      <div className="grid gap-x-4 gap-y-2 bp-1024:grid-cols-2 bp-1400:grid-cols-3">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="grid gap-1">
            <span className={cn("text-[var(--text-muted)]", labelTextClassName)}>{item.label}</span>
            <span className={cn("text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// Renders the compact read-only logbook row expansion content.
export default function LogbookFlightDetails({ row }) {
  const details = row?.details || {};

  return (
    <div className="grid gap-3 p-3">
      <DetailSection title="Flight Summary" items={details.flightSummary} />
      <DetailSection title="Aircraft" items={details.aircraft} />
      <DetailSection title="Times" items={details.times} />
      <DetailSection title="Performance" items={details.performance} />
      <DetailSection title="Airports" items={details.airports} />
    </div>
  );
}
