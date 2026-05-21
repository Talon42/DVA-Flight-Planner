import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { cn } from "../ui/cn";
import { bodySmTextClassName } from "../ui/typography";
import { mutedTextClassName, mutedTextStackClassName, insetPanelClassName } from "../ui/patterns";
import SectionHeader from "../ui/SectionHeader";
import { formatNumber } from "../../lib/formatters";

// Renders the addon folder picker and saved folder list for onboarding.
export function AddonManagementSetup({
  mode = "onboarding",
  compact = false,
  addonScan,
  addonScanSummary,
  isAddonScanBusy,
  isDesktopAddonScanAvailable,
  onAddAddonRoot,
  onRemoveAddonRoot,
  onSkipAddonSetup,
  onCompleted
}) {
  const isOnboardingMode = mode === "onboarding";
  const containerClassName = isOnboardingMode ? "grid gap-3" : cn(insetPanelClassName, compact && "gap-3");

  const handleAddAddonRoot = async () => {
    const added = await onAddAddonRoot?.();
    if (added) {
      onCompleted?.();
    }
    return added;
  };

  const handleSkip = async () => {
    const skipped = await onSkipAddonSetup?.();
    if (skipped) {
      onCompleted?.();
    }
    return skipped;
  };

  const rootCount = addonScan?.roots?.length || 0;
  const rootSummary =
    rootCount > 0
      ? `${formatNumber(rootCount)} addon folder${rootCount === 1 ? "" : "s"} configured.`
      : "No addon folders saved yet.";

  const content = (
    <>
      {!isOnboardingMode ? (
        <SectionHeader eyebrow="Addon Airports" title="Manage installed scenery coverage" />
      ) : (
        <div className={cn("grid gap-1", bodySmTextClassName, compact && "gap-0.5")}>
          <p className="m-0 text-[var(--text-muted)]">Add one or more Addon/Community folders.</p>
        </div>
      )}

      <div className={mutedTextStackClassName}>
        {addonScanSummary ? <p className="m-0">{addonScanSummary}</p> : null}
        {!isDesktopAddonScanAvailable ? (
          <p className="m-0">Addon folder selection is available only in the desktop app.</p>
        ) : null}
        <p className="m-0">{rootSummary}</p>
      </div>

      <div className={cn("flex flex-wrap gap-2", compact && "gap-1.5")}>
        <Button onClick={handleAddAddonRoot} disabled={!isDesktopAddonScanAvailable || isAddonScanBusy}>
          Add Addon Folder
        </Button>
        <Button variant="ghost" onClick={handleSkip} disabled={isAddonScanBusy}>
          Skip Addon Setup
        </Button>
      </div>

      <div className="grid gap-2">
        {rootCount ? (
          addonScan.roots.map((root) => (
            <div
              key={root}
              className="flex items-center justify-between gap-3 rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-4 py-3"
            >
              <code className={cn("[overflow-wrap:anywhere] text-[var(--text-primary)]", bodySmTextClassName)}>
                {root}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none"
                onClick={() => onRemoveAddonRoot?.(root)}
                disabled={isAddonScanBusy}
              >
                Remove
              </Button>
            </div>
          ))
        ) : (
          <p className={mutedTextClassName}>
            No addon folders saved yet. Add one or more Addon/Community roots, then scan them from Settings.
          </p>
        )}
      </div>
    </>
  );

  if (isOnboardingMode) {
    return <div className={containerClassName}>{content}</div>;
  }

  return <Panel className={containerClassName}>{content}</Panel>;
}

export default AddonManagementSetup;
