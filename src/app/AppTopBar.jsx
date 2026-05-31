import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import { cn } from "../components/ui/cn";
import { Eyebrow } from "../components/ui/SectionHeader";
import { heroTitleTextClassName } from "../components/ui/typography";
import dvaWidgetLogo from "../data/images/DVA_Widget.png";

function ThemeToggleIcon({ theme }) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
        <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8 3.4 3.4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <path
        d="M10.9 1.8a5.9 5.9 0 1 0 3.3 10.7A6.4 6.4 0 0 1 10.9 1.8Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <path
        d="M6.8 1.9h2.4l.4 1.6c.4.1.8.3 1.1.5l1.5-.7 1.2 2.1-1.2 1.1c.1.4.2.8.2 1.2s-.1.8-.2 1.2l1.2 1.1-1.2 2.1-1.5-.7c-.3.2-.7.4-1.1.5l-.4 1.6H6.8l-.4-1.6c-.4-.1-.8-.3-1.1-.5l-1.5.7-1.2-2.1 1.2-1.1A4.8 4.8 0 0 1 3.6 8c0-.4.1-.8.2-1.2L2.6 5.7l1.2-2.1 1.5.7c.3-.2.7-.4 1.1-.5l.4-1.6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M6.1 5.9a2.1 2.1 0 0 1 4.1.7c0 1.1-1 1.5-1.5 1.9-.4.3-.6.6-.6 1.3v.3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="11.9" r=".65" fill="currentColor" />
    </svg>
  );
}

// Renders the app title and the primary actions in the top bar.
export default function AppTopBar({
  theme,
  topbarTitle,
  syncButtonLabel,
  isImporting,
  isSyncing,
  isAddonScanBusy,
  isHydrating,
  handleDeltaVirtualSync,
  onToggleTheme,
  onToggleSettings,
  onToggleReadme,
  isSettingsOpen,
  isReadmeOpen
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-end justify-between gap-4 bp-1024:items-start bp-1024:gap-3">
      <div className="max-w-[720px] min-w-0">
        <Eyebrow>Flight Planner</Eyebrow>
        <div className="flex items-center gap-3 bp-1024:gap-2.5">
          <img
            src={dvaWidgetLogo}
            alt="DVA Widget logo"
            className="h-14 w-14 shrink-0 object-contain bp-1024:h-11 bp-1024:w-11"
          />
          <h1 className={cn("m-0 whitespace-nowrap text-[var(--text-heading)]", heroTitleTextClassName)}>
            {topbarTitle}
          </h1>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 self-end bp-1024:gap-2">
        <Button
          onClick={handleDeltaVirtualSync}
          disabled={isImporting || isSyncing || isAddonScanBusy || isHydrating}
          className="bp-1024:min-h-9 bp-1024:px-3 bp-1024:py-2 bp-1024:text-[0.82rem]"
        >
          {isSyncing ? "Syncing..." : syncButtonLabel}
        </Button>
        <IconButton
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="size-9 bp-1024:size-8"
        >
          <ThemeToggleIcon theme={theme} />
        </IconButton>
        <IconButton
          onClick={onToggleSettings}
          title="Open settings"
          aria-label="Open settings"
          aria-expanded={isSettingsOpen}
          className="size-9 bp-1024:size-8"
        >
          <SettingsIcon />
        </IconButton>
        <IconButton
          onClick={onToggleReadme}
          title="Open README"
          aria-label="Open README"
          aria-expanded={isReadmeOpen}
          className="size-9 bp-1024:size-8"
        >
          <HelpIcon />
        </IconButton>
      </div>
    </header>
  );
}
