import Panel from "./Panel";
import SectionHeader from "./SectionHeader";
import { cn } from "./cn";
import { modalBackdropClassName } from "./patterns";

// Renders the shared centered blocking status modal used for spinner-only overlays.
export default function SpinnerStatusModal({
  eyebrow,
  title,
  description,
  ariaLabel,
  className = "",
  panelClassName = ""
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center overflow-auto px-4 bp-1024:px-3",
        modalBackdropClassName,
        className
      )}
      role="presentation"
    >
      <div className="w-full max-w-[26rem]">
        <Panel
          as="section"
          padding="none"
          className={cn(
            "grid w-full gap-6 rounded-none bg-[var(--modal-shell-bg)] px-8 py-9 text-center shadow-none bp-1024:gap-5 bp-1024:px-7 bp-1024:py-8",
            panelClassName
          )}
          role="status"
          aria-live="polite"
          aria-label={ariaLabel}
        >
          <SectionHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
            className="!flex-col !items-center gap-2 text-center"
            bodyClassName="grid w-full justify-items-center text-center"
            titleClassName="text-[1.5rem] leading-[1.1] tracking-[-0.04em] bp-1024:text-[1.38rem]"
          />

          <div className="flex w-full justify-center pt-2">
            <svg
              viewBox="0 0 24 24"
              className="h-11 w-11 shrink-0 animate-spin text-[var(--delta-red)]"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.18"
                strokeWidth="2"
              />
              <path
                d="M21 12a9 9 0 0 0-9-9"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </div>
        </Panel>
      </div>
    </div>
  );
}
