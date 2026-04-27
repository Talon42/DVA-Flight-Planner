// Duty Schedule status keeps the build warning modal out of the panel shell.
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import SectionHeader from "../ui/SectionHeader";
import { cn } from "../ui/cn";
import { modalBackdropClassName } from "../ui/patterns";

// Renders the blocking build-warning dialog when Duty Schedule cannot run yet.
export default function DutyScheduleStatus({ dutyBuildWarning, onClearDutyBuildWarning }) {
  if (!dutyBuildWarning?.length) {
    return null;
  }

  return (
    <div
      className={cn("absolute inset-0 z-20 grid place-items-center px-4 py-4", modalBackdropClassName)}
      onClick={onClearDutyBuildWarning}
    >
      <Panel
        as="section"
        padding="lg"
        className="grid w-[min(560px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
        role="dialog"
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

