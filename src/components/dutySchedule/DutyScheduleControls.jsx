// Duty Schedule controls keep the build, reroll, and reset actions in one dedicated header area.
import Button from "../ui/Button";
import SectionHeader from "../ui/SectionHeader";

// Renders the Duty Schedule action header without pulling build logic into App.jsx.
export default function DutyScheduleControls({
  onBuildDutySchedule,
  onRerollDutySchedule,
  canRerollDutySchedule,
  onReset
}) {
  return (
    <SectionHeader
      eyebrow="DUTY SCHEDULE"
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onBuildDutySchedule}>
            Generate Schedule
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-none border-[color:var(--surface-border)] bg-transparent text-[var(--text-heading)] hover:bg-[var(--surface-soft)] dark:border-[color:var(--surface-border)] dark:bg-transparent dark:text-white dark:hover:bg-[#10243B]"
            onClick={onRerollDutySchedule}
            disabled={!canRerollDutySchedule}
          >
            Reroll
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-none border-[color:var(--surface-border)] bg-transparent text-[var(--text-heading)] hover:bg-[var(--surface-soft)] dark:border-[color:var(--surface-border)] dark:bg-transparent dark:text-white dark:hover:bg-[#10243B]"
            onClick={onReset}
          >
            Reset
          </Button>
        </div>
      }
    />
  );
}
