import { cn } from "./cn";
import {
  labelTextClassName,
  sectionTitleTextClassName,
  supportCopyTextClassName
} from "./typography";

export function Eyebrow({ as: Tag = "p", className = "", children, ...props }) {
  return (
    <Tag
      className={cn(
        "mb-2.5 mt-0 text-[var(--eyebrow)]",
        labelTextClassName,
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export default function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className = "",
  bodyClassName = "",
  titleClassName = "",
  ...props
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start justify-between gap-3 bp-1024:flex-row bp-1024:items-start",
        className
      )}
      {...props}
    >
      <div className={cn("min-w-0", bodyClassName)}>
        {/* Without a title the eyebrow is the section's only heading, so it becomes the h2 (WCAG 1.3.1, 2.4.6). */}
        {eyebrow ? <Eyebrow as={title ? "p" : "h2"}>{eyebrow}</Eyebrow> : null}
        {title ? (
          <h2 className={cn("m-0", sectionTitleTextClassName, titleClassName)}>
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className={cn("mt-2 mb-0 text-[var(--text-muted)]", supportCopyTextClassName)}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 bp-1024:w-auto">{actions}</div> : null}
    </div>
  );
}
