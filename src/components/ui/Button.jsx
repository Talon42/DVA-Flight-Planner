import { cn } from "./cn";
import { buttonTextClassName } from "./typography";

const VARIANT_CLASSES = {
  primary:
    "border-transparent bg-[var(--delta-blue)] text-white hover:opacity-94 dark:bg-[#1F466E] dark:hover:bg-[#27547F] dark:hover:opacity-100 disabled:opacity-100",
  ghost:
    "border-transparent bg-[var(--button-ghost-bg)] text-[var(--button-ghost-text)] hover:bg-[var(--button-ghost-hover-bg)]",
  danger:
    "border-transparent bg-[var(--delta-red)] text-white hover:opacity-94 disabled:opacity-100",
  success:
    "border-transparent bg-[#126835] text-white hover:opacity-94 dark:bg-[#1F466E] dark:hover:bg-[#27547F] dark:hover:opacity-100 disabled:opacity-100",
  board:
    "border-transparent bg-[var(--delta-blue)] text-white hover:opacity-94 dark:bg-[#1F466E] dark:hover:bg-[#27547F] dark:hover:opacity-100 disabled:opacity-100"
};

const SIZE_CLASSES = {
  md: "min-h-11 px-4 py-2.5 text-[0.88rem]",
  sm: "min-h-9 px-3 py-2 text-[0.78rem] bp-1024:min-h-8 bp-1024:px-2.5 bp-1024:text-[0.74rem]",
  icon: "size-11 p-0 text-sm"
};

export default function Button({
  as: Component = "button",
  variant = "primary",
  size = "md",
  active = false,
  className = "",
  type,
  ...props
}) {
  return (
    <Component
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-none border border-transparent transition-[background,color,opacity] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60",
        buttonTextClassName,
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        active &&
          variant === "ghost" &&
          "bg-[var(--surface-option-selected)] text-[var(--text-heading)] dark:bg-[#1F466E] dark:text-white dark:hover:bg-[#27547F]",
        className
      )}
      type={Component === "button" ? type || "button" : undefined}
      {...props}
    />
  );
}
