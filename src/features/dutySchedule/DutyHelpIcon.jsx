import Panel from "../../components/ui/Panel";
import { cn } from "../../components/ui/cn";
import { bodySmTextClassName, labelTextClassName } from "../../components/ui/typography";

// Places the duty help popover so it stays readable inside the filter panel.
function getDutyHelpPopoverStyle(anchorRect, containerRect = null) {
  const viewportPadding = 12;
  const targetWidth = 300;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const containerLeft = containerRect ? containerRect.left : viewportPadding;
  const containerRight = containerRect ? containerRect.right : viewportWidth - viewportPadding;
  const containerWidth = Math.max(0, containerRight - containerLeft);
  const popoverWidth = Math.max(
    0,
    Math.min(targetWidth, viewportWidth - viewportPadding * 2, Math.max(0, containerWidth - 24))
  );
  const alignedStart = containerLeft + 12;
  const alignedEnd = containerRight - popoverWidth - 12;
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
  const nearLeftEdge = anchorRect.left - containerLeft < popoverWidth * 0.45;
  const nearRightEdge = containerRight - anchorRect.right < popoverWidth * 0.45;
  const unclampedLeft = nearLeftEdge ? alignedStart : nearRightEdge ? alignedEnd : centeredLeft;
  const left = Math.min(
    Math.max(viewportPadding, Math.max(containerLeft + 12, unclampedLeft)),
    Math.min(viewportWidth - popoverWidth - viewportPadding, containerRight - popoverWidth - 12)
  );
  const estimatedHeight = 150;
  const belowTop = anchorRect.bottom + 10;
  const aboveTop = anchorRect.top - 10 - estimatedHeight;
  const placeAbove =
    belowTop + estimatedHeight > viewportHeight - viewportPadding &&
    aboveTop >= viewportPadding;

  return {
    left,
    top: placeAbove
      ? Math.max(viewportPadding, aboveTop)
      : Math.min(belowTop, viewportHeight - estimatedHeight - viewportPadding),
    width: popoverWidth
  };
}

// Small inline help button used beside Duty Schedule labels.
export default function DutyHelpIcon({ helpKey, label, description, activeHelp, setActiveHelp }) {
  const isOpen = activeHelp?.key === helpKey;
  const popoverId = `duty-help-${helpKey}`;
  const popoverStyle = isOpen
    ? getDutyHelpPopoverStyle(activeHelp.rect, activeHelp.containerRect)
    : null;

  function handleToggle(event) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const containerNode = event.currentTarget.closest(".duty-filter-card__content");
    const containerRect = containerNode?.getBoundingClientRect() || null;

    if (isOpen) {
      setActiveHelp(null);
      return;
    }

    setActiveHelp({
      key: helpKey,
      label,
      description,
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      containerRect: containerRect
        ? {
            left: containerRect.left,
            right: containerRect.right,
            top: containerRect.top,
            bottom: containerRect.bottom,
            width: containerRect.width,
            height: containerRect.height
          }
        : null
    });
  }

  return (
    <>
      <button
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center appearance-none rounded-full border-0 bg-transparent p-0 m-0 leading-none align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-outline)]"
        )}
        type="button"
        data-duty-help-trigger="true"
        aria-label={`${label} help`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        onClick={handleToggle}
      >
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[var(--surface-soft)] text-[var(--text-muted)] transition-colors duration-150 hover:border-[color:var(--focus-border)] hover:text-[var(--text-heading)] dark:bg-[#0D1D31] dark:hover:border-[color:var(--focus-border)]">
          <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" focusable="false" aria-hidden="true">
            <circle cx="8" cy="4.25" r="0.85" fill="currentColor" />
            <path
              d="M8 6.5v4.8"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </span>
      </button>

      {isOpen ? (
        <div
          className="fixed z-[90]"
          id={popoverId}
          data-duty-help-popover="true"
          role="dialog"
          aria-modal="false"
          aria-label={`${label} help`}
          style={
            popoverStyle
              ? {
                  top: `${popoverStyle.top}px`,
                  left: `${popoverStyle.left}px`,
                  width: `${popoverStyle.width}px`
                }
              : undefined
          }
        >
          <Panel
            padding="sm"
            className={cn(
              "grid gap-2 rounded-none border border-[color:var(--surface-border)] bg-[var(--surface-raised)] shadow-[0_18px_42px_rgba(8,20,36,0.18)] dark:bg-[#10243B] dark:shadow-[0_18px_42px_rgba(0,0,0,0.34)]"
            )}
          >
            <div className="grid gap-2">
              <div
                className={cn(
                  "text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-heading)]",
                  labelTextClassName
                )}
              >
                {label}
              </div>
              <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
                {description}
              </p>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
