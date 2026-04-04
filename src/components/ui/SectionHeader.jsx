import { cn } from "./cn";

export function Eyebrow({ className = "", children, ...props }) {
  return (
    <p
      className={cn(
        "mb-2.5 mt-0 text-[0.78rem] font-bold uppercase tracking-[0.18em] text-[var(--delta-red)]",
        className
      )}
      {...props}
    >
      {children}
    </p>
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
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        {title ? (
          <h2 className={cn("m-0 text-[1.2rem] font-semibold tracking-[-0.04em]", titleClassName)}>
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="mt-2 mb-0 text-sm leading-6 text-[var(--text-muted)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2 bp-1024:w-auto">{actions}</div> : null}
    </div>
  );
}
