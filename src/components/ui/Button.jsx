import { cn } from "./cn";

const VARIANT_CLASSES = {
  primary:
    "border-transparent bg-[var(--delta-blue)] text-white shadow-[0_10px_22px_rgba(0,58,112,0.2)] hover:brightness-105 disabled:brightness-100 dark:border-[color:rgba(255,255,255,0.06)] dark:bg-[linear-gradient(135deg,var(--delta-red)_0%,#7d0f24_100%)] dark:shadow-[0_10px_24px_rgba(125,15,36,0.28)]",
  ghost:
    "border-[color:var(--button-ghost-border)] bg-[var(--button-ghost-bg)] text-[var(--button-ghost-text)] hover:border-[color:var(--button-ghost-hover-border)] hover:bg-[var(--button-ghost-hover-bg)]",
  danger:
    "border-transparent bg-[linear-gradient(135deg,var(--delta-red)_0%,#7d0f24_100%)] text-white shadow-[0_10px_22px_rgba(125,15,36,0.24)] hover:brightness-105 disabled:brightness-100",
  board:
    "border-transparent bg-[var(--delta-blue)] text-white shadow-[0_8px_18px_rgba(0,58,112,0.18)] hover:brightness-105 disabled:brightness-100 dark:border-[color:rgba(255,255,255,0.06)] dark:bg-[linear-gradient(135deg,var(--delta-red)_0%,#7d0f24_100%)] dark:shadow-[0_8px_20px_rgba(125,15,36,0.24)]"
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
        "inline-flex items-center justify-center gap-2 rounded-[14px] border font-semibold tracking-[-0.01em] transition-[background,border-color,color,box-shadow,transform] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        active &&
          variant === "ghost" &&
          "border-[color:rgba(0,58,112,0.25)] bg-[var(--chip-bg)] text-[var(--text-heading)]",
        className
      )}
      type={Component === "button" ? type || "button" : undefined}
      {...props}
    />
  );
}
