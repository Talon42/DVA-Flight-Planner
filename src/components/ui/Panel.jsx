import { forwardRef } from "react";
import { cn } from "./cn";

const Panel = forwardRef(function Panel({
  as: Component = "section",
  padding = "md",
  className = "",
  ...props
}, ref) {
  const paddingClass =
    padding === "lg"
      ? "p-6 bp-1024:p-5"
      : padding === "sm"
        ? "p-4 bp-1024:p-3.5"
        : padding === "none"
          ? ""
          : "p-5 bp-1024:p-4";

  return (
    <Component
      ref={ref}
      className={cn(
        "max-w-full overflow-hidden rounded-none border border-[color:var(--panel-border,transparent)] bg-[var(--surface)] bg-clip-padding shadow-none ring-0 backdrop-blur-none",
        paddingClass,
        className
      )}
      {...props}
    />
  );
});

export default Panel;
