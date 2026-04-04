import { cn } from "./cn";

export const fieldLabelClassName =
  "flex min-w-0 flex-col gap-1.5 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]";

export const fieldTitleClassName =
  "text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]";

export const fieldShellClassName = cn(
  "min-h-[var(--planner-control-box-min-height)] rounded-[var(--planner-control-box-radius)] border border-[color:var(--line)] bg-[var(--input-bg)] px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-[var(--text-primary)] transition-[border-color,background,color,box-shadow] duration-150 ease-out",
  "hover:border-[color:var(--button-ghost-hover-border)] hover:bg-[var(--surface-soft)]",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(227,27,35,0.22)] focus-visible:border-[color:var(--focus-border)]"
);

export const fieldBodyClassName =
  cn(fieldShellClassName, "text-[0.78rem] font-semibold leading-[1.2] tracking-[-0.01em]");

export const fieldInputClassName = cn(
  fieldBodyClassName,
  "w-full min-w-0 border-0 px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] outline-none"
);

export const fieldSelectClassName = cn(
  fieldInputClassName,
  "appearance-none pr-10"
);

export const toggleButtonClassName = (active) =>
  cn(
    fieldShellClassName,
    "flex-1 justify-center text-center font-semibold",
    active
      ? "border-[color:rgba(62,129,191,0.72)] bg-[linear-gradient(135deg,rgba(14,78,133,0.98),rgba(7,39,78,0.94))] text-white shadow-[0_10px_22px_rgba(0,58,112,0.24)]"
      : "hover:bg-[var(--surface-soft)]"
  );

export const gridClassNames = {
  routing:
    "grid gap-3 bp-1024:grid-cols-3",
  routeFields:
    "grid gap-3 bp-1024:grid-cols-[minmax(0,1.6fr)_minmax(84px,0.58fr)] bp-1400:grid-cols-[minmax(0,1.9fr)_minmax(104px,0.6fr)]",
  advanced:
    "grid gap-3 bp-1024:grid-cols-2 bp-1400:grid-cols-4",
  advancedDuty:
    "grid gap-3 bp-1024:grid-cols-2 bp-1400:grid-cols-4",
  addon:
    "grid gap-3 bp-1024:grid-cols-2",
  twoColumn:
    "grid gap-3 bp-1024:grid-cols-2",
  detailSummary:
    "grid gap-3 bp-1024:grid-cols-2",
  boardActions:
    "grid gap-2 bp-1024:grid-cols-3",
  boardActionsDual:
    "grid gap-2 bp-1024:grid-cols-2"
};
