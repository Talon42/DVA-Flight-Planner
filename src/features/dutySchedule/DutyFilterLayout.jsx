import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { nestedPanelStrongFrameClassName } from "../../components/ui/patterns";
import { labelTextClassName } from "../../components/ui/typography";
import { toggleButtonClassName } from "../../components/ui/forms";

// Renders a compact below-1400 row with the label on the left and the control on the right.
export function DutyCompactInlineRow({ label, labelSuffix = null, children }) {
  return (
    <div className="grid grid-cols-1 items-center gap-3 border-b border-[color:var(--panel-border)] py-3 last:border-b-0 bp-1024:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] bp-1024:gap-6">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5 leading-none">
          <span className={cn(labelTextClassName, "text-[var(--text-muted)]")}>{label}</span>
          {labelSuffix ? <span className="inline-flex shrink-0 items-center leading-none">{labelSuffix}</span> : null}
        </div>
      </div>
      <div className="min-w-0 w-full">{children}</div>
    </div>
  );
}

// Renders a two-button compact choice group that fills the row's right column.
export function DutyCompactChoiceGroup({ options, value, onChange }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            className={toggleButtonClassName(isActive, "choice", "compact")}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Small frame used to keep the three duty filter columns visually consistent.
export function DutyFilterColumn({
  step,
  title,
  description,
  className = "",
  contentClassName = "",
  children
}) {
  return (
    <Panel
      padding="none"
      className={cn(
        "duty-filter-card flex h-full min-h-0 flex-col rounded-none",
        nestedPanelStrongFrameClassName,
        className
      )}
    >
      <div className="duty-filter-card__header h-[96px] border-b-2 border-[color:var(--panel-border)] px-4 py-1.5 overflow-hidden">
        <div className="flex h-full items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--delta-blue)] text-white">
            <span className={labelTextClassName}>{step}</span>
          </div>
          <div className="grid min-w-0 content-center gap-1.5">
            <p className={cn("m-0 uppercase tracking-[0.2em]", labelTextClassName)}>{title}</p>
            {description ? (
              <p className="m-0 overflow-hidden text-[0.74rem] font-normal leading-[1.25] tracking-[0] text-[var(--text-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div
        className={cn(
          "duty-filter-card__content grid flex-1 content-start gap-2 px-4 py-3",
          contentClassName
        )}
      >
        {children}
      </div>
    </Panel>
  );
}
