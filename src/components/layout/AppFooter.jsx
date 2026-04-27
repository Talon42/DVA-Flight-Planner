import Button from "../ui/Button";
import { cn } from "../ui/cn";
import {
  dropdownOptionRowClassName,
  dropdownPanelClassName
} from "../ui/forms";
import { bodySmTextClassName } from "../ui/typography";

function FooterStat({ label, value, className = "" }) {
  return (
    <p
      className={cn(
        "m-0 inline-flex items-baseline gap-1.5 whitespace-nowrap text-[var(--text-muted)] bp-1024:text-[0.76rem]",
        bodySmTextClassName,
        className
      )}
    >
      <span>{label}:</span>
      <span className="font-normal text-[var(--text-heading)]">{value}</span>
    </p>
  );
}

function FooterDateStat({ label, value, isCurrent, className = "" }) {
  const displayValue = isCurrent ? value : `${value} (Out of Date!)`;

  return (
    <p
      className={cn(
        "m-0 inline-flex items-baseline gap-1.5 whitespace-nowrap text-[var(--text-muted)] bp-1024:text-[0.76rem]",
        bodySmTextClassName,
        className
      )}
    >
      <span>{label}:</span>
      <span className={cn("font-normal", isCurrent ? "text-[var(--text-heading)]" : "text-[var(--delta-red)]")}>
        {displayValue}
      </span>
    </p>
  );
}

function FooterLinkStat({ label, value, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap border-0 bg-transparent p-0 text-left text-[var(--delta-red)] transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--delta-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-panel)] bp-1024:text-[0.76rem]",
        bodySmTextClassName,
        className
      )}
    >
      <span>{label}</span>
      {value ? <span className="font-normal text-current">{value}</span> : null}
    </button>
  );
}

export default function AppFooter({
  appBuildGitTag,
  currentWindowSizeLabel,
  devWindowMenuRef,
  devWindowWidth,
  devWindowWidthPresets,
  footerMetadataItems,
  hasUpdateAvailable,
  isDevToolsEnabled,
  isDesktopAddonScanAvailable,
  isDevWindowMenuOpen,
  onOpenReleasePage,
  onSelectDevWindowWidth,
  onToggleDevWindowMenu,
  selectedDevWindowPreset,
  showFooter
}) {
  if (!showFooter) {
    return null;
  }

  return (
    <footer className="flex min-w-0 items-baseline justify-between gap-3 overflow-visible whitespace-nowrap pt-1.5">
      <div className="flex min-w-0 flex-nowrap items-center gap-x-3 overflow-hidden whitespace-nowrap">
        {footerMetadataItems.length ? (
          <>
            {footerMetadataItems.map((item) =>
              item.kind === "date" ? (
                <FooterDateStat
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  isCurrent={item.isCurrent}
                />
              ) : (
                <FooterStat key={item.label} label={item.label} value={item.value} />
              )
            )}
          </>
        ) : null}
      </div>

      {isDevToolsEnabled ? (
        <div className="ml-auto flex min-w-0 shrink-0 items-baseline justify-end overflow-visible whitespace-nowrap">
          <div className="relative" ref={devWindowMenuRef}>
            <button
              type="button"
              onClick={onToggleDevWindowMenu}
              aria-expanded={isDevWindowMenuOpen}
              aria-haspopup="menu"
              disabled={!isDesktopAddonScanAvailable}
              className={cn(
                "inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-none border-0 bg-transparent p-0 text-[var(--text-muted)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] bp-1024:text-[0.76rem]",
                bodySmTextClassName
              )}
              title={
                isDesktopAddonScanAvailable
                  ? "Choose a responsive test window width"
                  : "Window size presets are only available in the desktop app"
              }
            >
              <span className="shrink-0">Window Size:</span>
              <span className="min-w-0 truncate font-normal text-[var(--text-heading)]">
                {selectedDevWindowPreset?.label || "Choose"}
              </span>
              <span className="shrink-0">| Current Size:</span>
              <span className="min-w-0 truncate font-normal text-[var(--text-heading)]">
                {currentWindowSizeLabel}
              </span>
            </button>
            {isDevWindowMenuOpen ? (
              <div
                className={cn(
                  "absolute right-0 bottom-[calc(100%+0.5rem)] z-30 min-w-[220px]",
                  dropdownPanelClassName
                )}
                role="menu"
                aria-label="Window size presets"
              >
                {devWindowWidthPresets.map((option) => (
                  <Button
                    key={option.width}
                    variant="ghost"
                    active={devWindowWidth === option.width}
                    className={cn("justify-start rounded-none", dropdownOptionRowClassName)}
                    role="menuitemradio"
                    aria-checked={devWindowWidth === option.width}
                    onClick={() => onSelectDevWindowWidth(option.width)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex shrink-0 items-center gap-x-2 whitespace-nowrap text-[var(--text-muted)] bp-1024:text-[0.76rem]",
            bodySmTextClassName
          )}
          aria-label="Copyright (c) 2026 Talon42"
        >
          <span>Copyright &copy; 2026</span>
          <a
            className="text-[var(--delta-blue)] no-underline hover:underline dark:text-[rgb(255,255,255)]"
            href="https://github.com/Talon42/DVA-Flight-Planner"
            target="_blank"
            rel="noreferrer"
          >
            Talon42
          </a>
          <span>Version:</span>
          <span className="font-normal text-[var(--text-heading)]">{appBuildGitTag}</span>
          {hasUpdateAvailable ? <FooterLinkStat label="Update Available" value="" onClick={onOpenReleasePage} /> : null}
        </div>
      )}
    </footer>
  );
}
