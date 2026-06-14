import { cn } from "./ui/cn";
import { bodyMdTextClassName, sectionTitleTextClassName } from "./ui/typography";

function buildCompletedHeadline(subjectName, subjectLabel) {
  const normalizedSubjectName = String(subjectName || "").trim();
  const normalizedSubjectLabel = String(subjectLabel || "").trim();

  if (normalizedSubjectName) {
    return normalizedSubjectLabel
      ? `Congratulations! You have completed the ${normalizedSubjectName} ${normalizedSubjectLabel}`
      : `Congratulations! You have completed the ${normalizedSubjectName}`;
  }

  return normalizedSubjectLabel
    ? `Congratulations! You have completed this ${normalizedSubjectLabel}.`
    : "Congratulations! You have completed this accomplishment.";
}

// Renders the compact success card shown for completed accomplishments and tours.
export default function CompletedStatusCard({
  subjectName = "",
  subjectLabel = "accomplishment",
  dateLabel = "",
  className = ""
}) {
  return (
    <div
      className={cn(
        "mt-4 w-full max-w-[780px] border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-4 text-left dark:border-[#047857] dark:bg-[#0D2F2A] bp-1920:max-w-[930px]",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center self-center border border-[#A7F3D0] bg-[#D1FAE5] text-[#047857] dark:border-[#047857] dark:bg-[#064E3B] dark:text-[#34D399]">
          <svg viewBox="0 0 16 16" className="h-6 w-6" focusable="false" aria-hidden="true">
            <path
              d="m6.2 10.7-2.5-2.5 1-1 1.5 1.5 4.2-4.2 1 1-5.2 5.2z"
              fill="currentColor"
            />
          </svg>
        </div>

        <div className="min-w-0">
          <h3 className={cn("m-0 text-[1rem] !text-[#047857] dark:!text-[#34D399]", sectionTitleTextClassName)}>
            {buildCompletedHeadline(subjectName, subjectLabel)}
          </h3>
          {dateLabel ? (
            <p className={cn("mt-1.5 mb-0 !text-[#475569] dark:!text-[#93C5FD]", bodyMdTextClassName)}>
              {dateLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
