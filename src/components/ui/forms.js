import {
  bodySmTextClassName,
  bodyMdTextClassName,
  buttonTextClassName,
  labelTextClassName
} from "./typography";
import { cn } from "./cn";

export const fieldLabelClassName =
  cn("flex min-w-0 flex-col gap-1.5 text-[var(--text-muted)]", labelTextClassName);

export const fieldTitleClassName =
  cn("text-[var(--text-muted)]", labelTextClassName);

export const fieldShellClassName = cn(
  "min-h-[var(--planner-control-box-min-height)] rounded-[var(--planner-control-box-radius)] border border-[color:transparent] bg-[var(--input-bg)] px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] text-[var(--text-primary)] transition-[background,color,outline-color] duration-150 ease-out",
  "hover:bg-[var(--surface-soft)]",
  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[rgba(227,27,35,0.22)]"
);

export const fieldBodyClassName =
  cn(fieldShellClassName, bodySmTextClassName);

export const fieldInputClassName = cn(
  fieldShellClassName,
  bodyMdTextClassName,
  "w-full min-w-0 border-0 px-[var(--planner-control-box-padding-x)] py-[var(--planner-control-box-padding-y)] outline-none"
);

export const fieldSelectClassName = cn(
  fieldInputClassName,
  "appearance-none pr-10"
);

export const toggleButtonClassName = (active, variant = "default") =>
  cn(
    fieldShellClassName,
    "flex-1 justify-center text-center",
    buttonTextClassName,
    active
      ? variant === "addon"
        ? "!bg-[var(--delta-blue)] !text-white dark:!bg-[var(--delta-red)]"
        : "!bg-[var(--delta-blue)] !text-white dark:!bg-[var(--delta-red)]"
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
