import { cn } from "./cn";
import { supportCopyTextClassName } from "./typography";

export const cardFrameClassName =
  "[--panel-border:rgba(160,180,202,0.52)] border-2 border-[color:var(--panel-border)] bg-[rgba(240,245,250,0.98)] dark:[--panel-border:var(--surface-border)] dark:bg-[rgba(10,24,43,0.96)]";

export const insetPanelClassName =
  cn("mt-4 grid gap-4 rounded-none p-4 bp-1024:gap-3 bp-1024:p-3.5", cardFrameClassName);

export const modalPanelClassName =
  "grid w-[min(860px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4";

export const modalBackdropClassName = "bg-[var(--modal-backdrop-bg)]";

export const mutedTextClassName =
  `m-0 max-w-[72ch] text-[var(--text-muted)] ${supportCopyTextClassName}`;

export const mutedTextStackClassName =
  `grid gap-2 text-[var(--text-muted)] ${supportCopyTextClassName}`;
