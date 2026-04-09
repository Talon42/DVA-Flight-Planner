import { supportCopyTextClassName } from "./typography";

export const insetPanelClassName =
  "mt-4 grid gap-4 rounded-none bg-[var(--surface-panel)] p-4 bp-1024:gap-3 bp-1024:p-3.5";

export const modalPanelClassName =
  "grid w-[min(860px,100%)] gap-5 rounded-none bg-[var(--surface-raised)] shadow-none bp-1024:gap-4";

export const mutedTextClassName =
  `m-0 max-w-[72ch] text-[var(--text-muted)] ${supportCopyTextClassName}`;

export const mutedTextStackClassName =
  `grid gap-2 text-[var(--text-muted)] ${supportCopyTextClassName}`;
