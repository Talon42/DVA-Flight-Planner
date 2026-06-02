import { cn } from "../../components/ui/cn";
import { cardFrameClassName } from "../../components/ui/patterns";
import { labelTextClassName, sectionTitleTextClassName, bodySmTextClassName } from "../../components/ui/typography";

function StatCard({ card }) {
  return (
    <div className={cn("grid gap-2 p-3", cardFrameClassName)}>
      <p className={cn("m-0 text-[var(--text-muted)]", labelTextClassName)}>{card.label}</p>
      <p className={cn("m-0 text-[var(--text-heading)]", sectionTitleTextClassName)}>{card.value}</p>
      {card.meta ? <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>{card.meta}</p> : null}
    </div>
  );
}

function RankedListPanel({ title, items }) {
  return (
    <section className={cn("grid gap-3 p-3", cardFrameClassName)}>
      <p className={cn("m-0 text-[var(--text-heading)]", labelTextClassName)}>{title}</p>
      {items?.length ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={`${title}-${item.label}`} className="flex items-baseline justify-between gap-3 border-b border-[color:var(--line)] pb-2 last:border-b-0 last:pb-0">
              <div className="min-w-0">
                <p className={cn("m-0 truncate text-[var(--text-primary)] dark:text-white", bodySmTextClassName)}>{item.label}</p>
                {item.meta ? <p className={cn("m-0 truncate text-[var(--text-muted)]", bodySmTextClassName)}>{item.meta}</p> : null}
              </div>
              <p className={cn("m-0 shrink-0 text-[var(--text-heading)]", bodySmTextClassName)}>{item.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>No data available.</p>
      )}
    </section>
  );
}

// Renders compact Pilot Stats cards and ranked lists from the filtered logbook rows.
export default function LogbookPilotStats({ rows, stats }) {
  if (!rows.length) {
    return (
      <div className={cn("grid gap-3 p-3", cardFrameClassName)}>
        <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
          No logbook flights match the current filters.
        </p>
      </div>
    );
  }

  return (
    <div className="app-scrollbar min-h-0 overflow-y-auto px-2.5 pb-2 bp-1024:px-3 bp-1024:pb-2">
      <div className="grid gap-3 py-0.5">
        <div className="grid gap-3 bp-1024:grid-cols-2 bp-1400:grid-cols-3">
          {stats.cards.map((card) => (
            <StatCard key={card.label} card={card} />
          ))}
        </div>

        <div className="grid gap-3 bp-1400:grid-cols-2">
          <RankedListPanel title="Landing Rates" items={stats.landingRates} />
          <RankedListPanel title="Last 10 Landing Rates" items={stats.lastTenLandingRates} />
          <RankedListPanel title="Flights by Equipment" items={stats.flightsByEquipment} />
          <RankedListPanel title="Flights by Simulator" items={stats.flightsBySimulator} />
          <RankedListPanel title="Flights by Status" items={stats.flightsByStatus} />
          <RankedListPanel title="Flights by Airline" items={stats.flightsByAirline} />
          <RankedListPanel title="Top Departure Airports" items={stats.topDepartureAirports} />
          <RankedListPanel title="Top Arrival Airports" items={stats.topArrivalAirports} />
        </div>
      </div>
    </div>
  );
}
