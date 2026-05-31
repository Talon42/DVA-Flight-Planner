import { cn } from "../../components/ui/cn";

function formatAirportSubtitle(airport) {
  return [airport?.airportName || "", airport?.country || ""].filter(Boolean).join(" • ");
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatUpdateTimestamp(timestamp) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toISOString().slice(11, 16) + "Z";
}

function renderControllerLine(controller) {
  const parts = [controller?.callsign || ""];
  if (controller?.frequency) {
    parts.push(controller.frequency);
  }

  return parts.filter(Boolean).join(" • ");
}

// Renders the compact airport popup shown when the user clicks a live ATC marker.
export default function VatsimAirportPopup({ airport, isDarkTheme, onClose }) {
  if (!airport) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-auto w-[320px] rounded-none border shadow-[0_10px_28px_rgba(0,0,0,0.2)]",
        isDarkTheme
          ? "border-[color:rgba(255,255,255,0.18)] bg-[rgba(10,14,20,0.95)] text-white"
          : "border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-primary)]"
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--line)] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold leading-none tracking-[0.12em]">
            {airport.airportIcao}
          </div>
          <div className="mt-1 truncate text-[10px] leading-tight opacity-85">
            {formatAirportSubtitle(airport)}
          </div>
        </div>
        <button
          type="button"
          className={cn(
            "shrink-0 rounded-none border px-1.5 py-0.5 text-[10px] leading-none transition-colors",
            isDarkTheme
              ? "border-[color:rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)]"
              : "border-[color:var(--button-ghost-border)] bg-[var(--button-ghost-bg)] hover:bg-[var(--button-ghost-border)]"
          )}
          aria-label={`Close live ATC details for ${airport.airportIcao}`}
          onClick={onClose}
        >
          Close
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.12em] opacity-85">
        <span>{formatCountLabel(airport.controllerCount, "controller")}</span>
        {airport.updateTimestamp ? <span>Updated {formatUpdateTimestamp(airport.updateTimestamp)}</span> : null}
      </div>

      <div className="max-h-[176px] overflow-auto px-3 pb-3">
        {airport.controllers?.length ? (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-75">
              Controllers
            </div>
            <div className="space-y-1">
              {airport.controllers.map((controller) => (
                <div
                  key={`${controller.callsign}-${controller.frequency}-${controller.logonTime}`}
                  className={cn(
                    "rounded-none border px-2 py-1",
                    isDarkTheme
                      ? "border-[color:rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)]"
                      : "border-[color:var(--line)] bg-[var(--surface-soft)]"
                  )}
                >
                  <div className="truncate text-[11px] font-medium leading-tight">
                    {renderControllerLine(controller)}
                  </div>
                  {controller.name ? (
                    <div className="truncate text-[10px] leading-tight opacity-75">
                      {controller.name}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}
