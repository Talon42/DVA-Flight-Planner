import { cn } from "../ui/cn";
import { modalBackdropClassName } from "../ui/patterns";

// Provides the shared backdrop used by app-level dialogs and embedded overlays.
export default function ModalBackdrop({
  children,
  onClick,
  className = "",
  variant = "fullscreen"
}) {
  const variantClassName =
    variant === "embedded"
      ? "absolute inset-0 z-[60] flex min-h-full w-full items-center justify-center overflow-hidden p-4 bp-1024:p-3"
      : "fixed inset-0 z-50 grid place-items-center overflow-auto p-4 bp-1024:p-3";

  return (
    <div
      className={cn(variantClassName, modalBackdropClassName, className)}
      role="presentation"
      onClick={onClick}
    >
      {children}
    </div>
  );
}
