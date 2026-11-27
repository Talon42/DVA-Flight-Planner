// Duty Schedule status keeps the build warning modal out of the panel shell.
import { useRef } from "react";
import Button from "../ui/Button";
import { useModalFocus } from "../layout/useModalFocus";
import Panel from "../ui/Panel";
import SectionHeader from "../ui/SectionHeader";
import { cn } from "../ui/cn";
import { modalBackdropClassName } from "../ui/patterns";

// Renders the blocking build-warning dialog when Duty Schedule cannot run yet.
export default function DutyScheduleStatus({ dutyBuildWarning, onClearDutyBuildWarning }) {
  if (!dutyBuildWarning?.length) {
    return null;
  }

  return <DutyScheduleWarningDialog dutyBuildWarning={dutyBuildWarning} onClose={onClearDutyBuildWarning} />;
}

// The warning is an alert dialog: it takes focus so screen readers announce it, traps Tab,
// closes on Escape and returns focus to Generate Schedule (WCAG 2.4.3, 4.1.3).
function DutyScheduleWarningDialog({ dutyBuildWarning, onClose: onClearDutyBuildWarning }) {
  const backdropRef = useRef(null);
  useModalFocus(backdropRef, { onEscape: onClearDutyBuildWarning });

  return (
    <div
      ref={backdropRef}
      role="presentation"
      className={cn("absolute inset-0 z-20 grid place-items-center px-4 py-4", modalBackdropClassName)}
      onClick={onClearDutyBuildWarning}
    >
      <Panel
        as="section"
        padding="lg"
        className="grid w-[min(560px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
        role="alertdialog"
        aria-modal="true"
        aria-label="Duty schedule build warning"
        onClick={(event) => event.stopPropagation()}
      >
        <SectionHeader eyebrow="Duty Schedule" title="Cannot build schedule yet" />

        <ul className="m-0 grid gap-2 pl-5 text-[var(--text-muted)]">
          {dutyBuildWarning.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClearDutyBuildWarning}>
            Close
          </Button>
        </div>
      </Panel>
    </div>
  );
}

