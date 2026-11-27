import { useRef } from "react";
import { cn } from "../ui/cn";
import { modalBackdropClassName } from "../ui/patterns";
import { useModalFocus } from "./useModalFocus";

// Provides the shared backdrop used by app-level dialogs and embedded overlays.
// Every dialog rendered inside it gets modal focus handling: focus moves in, Tab stays in,
// the rest of the page is inert, Escape closes (via onEscape, else onClick), and focus returns.
export default function ModalBackdrop({
  children,
  onClick,
  onEscape,
  className = "",
  variant = "fullscreen"
}) {
  const backdropRef = useRef(null);
  useModalFocus(backdropRef, { onEscape: onEscape ?? (onClick ? () => onClick() : undefined) });

  const variantClassName =
    variant === "embedded"
      ? "absolute inset-0 z-[60] flex min-h-full w-full items-center justify-center overflow-hidden p-4 bp-1024:p-3"
      : "fixed inset-0 z-50 grid place-items-center overflow-auto p-4 bp-1024:p-3";

  return (
    <div
      ref={backdropRef}
      className={cn(variantClassName, modalBackdropClassName, className)}
      role="presentation"
      onClick={onClick}
    >
      {children}
    </div>
  );
}
