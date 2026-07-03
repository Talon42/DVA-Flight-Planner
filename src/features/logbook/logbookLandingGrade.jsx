import { cn } from "../../components/ui/cn";
import { LOGBOOK_EMPTY_VALUE } from "../../domain/logbook/logbook.model.js";

// Reuses the same landing-rate category colors used by the logbook flights table.
export function getLandingGradePaletteClassName(grade) {
  const normalizedGrade = String(grade || "").trim();

  if (normalizedGrade === "Damaging") {
    return "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B] dark:border-[#F87171] dark:bg-[#3F1111] dark:text-[#FCA5A5]";
  }

  if (normalizedGrade === "Firm") {
    return "border-[#FDBA74] bg-[#FFEDD5] text-[#9A3412] dark:border-[#FB923C] dark:bg-[#3B230F] dark:text-[#FDBA74]";
  }

  if (normalizedGrade === "Optimal") {
    return "border-[#86EFAC] bg-[#DCFCE7] text-[#166534] dark:border-[#4ADE80] dark:bg-[#10301C] dark:text-[#86EFAC]";
  }

  return "border-[#93C5FD] bg-[#DBEAFE] text-[#1D4ED8] dark:border-[#60A5FA] dark:bg-[#10243B] dark:text-[#93C5FD]";
}

// Reuses the same grade colors, but only for inline text instead of the full badge treatment.
export function getLandingGradeTextClassName(grade) {
  const normalizedGrade = String(grade || "").trim();

  if (normalizedGrade === "Damaging") {
    return "text-[#991B1B] dark:text-[#FCA5A5]";
  }

  if (normalizedGrade === "Firm") {
    return "text-[#9A3412] dark:text-[#FDBA74]";
  }

  if (normalizedGrade === "Optimal") {
    return "text-[#166534] dark:text-[#86EFAC]";
  }

  return "text-[#1D4ED8] dark:text-[#93C5FD]";
}

// Renders the same landing-rate badge treatment used in the logbook flights table.
export function LandingGradeBadge({ grade, className = "" }) {
  const normalizedGrade = String(grade || "").trim();

  if (!normalizedGrade || normalizedGrade === LOGBOOK_EMPTY_VALUE) {
    return <span className="text-[var(--text-muted)]">{LOGBOOK_EMPTY_VALUE}</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex h-[1.7rem] w-[5.75rem] shrink-0 items-center justify-center rounded-none border px-1.5 text-center text-[0.62rem] font-semibold uppercase leading-none tracking-[0.16em]",
        getLandingGradePaletteClassName(normalizedGrade),
        className
      )}
    >
      {normalizedGrade}
    </span>
  );
}
