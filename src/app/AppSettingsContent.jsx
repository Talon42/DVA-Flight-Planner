import { AddonAirportPanel } from "../components/FilterBar";
import { DeltaVirtualCredentialsForm } from "../components/settings/DeltaVirtualCredentialsForm";
import { SimBriefSettingsForm } from "../components/settings/SimBriefSettingsForm";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";
import { cn } from "../components/ui/cn";
import { insetPanelClassName, mutedTextStackClassName } from "../components/ui/patterns";
import SectionHeader from "../components/ui/SectionHeader";
import { supportCopyTextClassName } from "../components/ui/typography";

// Renders the settings modal content for the currently selected tab.
export default function AppSettingsContent({
  settingsTab = "general",
  addonScan,
  addonScanSummary,
  isAddonScanBusy,
  isDesktopAddonScanAvailable,
  onAddAddonRoot,
  onRemoveAddonRoot,
  onScanAddonAirports,
  dvaFirstNameDraft,
  dvaLastNameDraft,
  dvaPasswordFieldValue,
  isDvaPasswordDisplayText,
  dvaHasPassword,
  isDvaCredentialsSaving,
  isImporting,
  isSyncing,
  hasDvaCredentialChanges,
  onFirstNameChange,
  onLastNameChange,
  onPasswordChange,
  onPasswordFocus,
  onPasswordBlur,
  onSaveDeltaVirtualCredentials,
  onClearDeltaVirtualCredentials,
  onResetDeltaVirtualSyncSession,
  simBriefUsernameDraft,
  simBriefPilotIdDraft,
  simBriefUseCurrentUtcForDispatchTime,
  simBriefDispatchUnits,
  simBriefDepartureOffsetMinutes,
  simBriefCustomAirframesDraft,
  simBriefCustomAirframeIdDraft,
  simBriefCustomAirframeNameDraft,
  simBriefCustomAirframeMatchTypeDraft,
  simBriefAircraftTypes,
  isSimBriefAircraftTypesLoading,
  simBriefAircraftTypesError,
  isSimBriefSaving,
  onUsernameChange,
  onPilotIdChange,
  onDispatchUnitsChange,
  onDispatchTimeModeChange,
  onDepartureOffsetChange,
  onCustomAirframeDraftIdChange,
  onCustomAirframeDraftNameChange,
  onCustomAirframeDraftMatchTypeChange,
  onAddCustomAirframe,
  onRemoveCustomAirframe,
  onSaveSimBriefCredentials,
  isCheckingForUpdates,
  onCheckForUpdates,
  onOpenLogFile,
  onToggleDevTools,
  isDevToolsEnabled,
  onDeleteUserData,
  isDeletingUserData,
  isUserDataDeletionBlocked = false,
  appBuildGitTag,
  hasWhatsNewCards = false,
  onOpenWhatsNew
}) {
  switch (settingsTab) {
    case "delta-virtual":
      return (
        <DeltaVirtualCredentialsForm
          mode="settings"
          firstName={dvaFirstNameDraft}
          lastName={dvaLastNameDraft}
          passwordFieldValue={dvaPasswordFieldValue}
          isPasswordDisplayText={isDvaPasswordDisplayText}
          hasSavedPassword={dvaHasPassword}
          isSaving={isDvaCredentialsSaving}
          isSaveDisabled={isDvaCredentialsSaving || isImporting || isSyncing || !hasDvaCredentialChanges}
          isClearDisabled={isDvaCredentialsSaving || isImporting || isSyncing}
          onFirstNameChange={onFirstNameChange}
          onLastNameChange={onLastNameChange}
          onPasswordChange={onPasswordChange}
          onPasswordFocus={onPasswordFocus}
          onPasswordBlur={onPasswordBlur}
          onSaveCredentials={onSaveDeltaVirtualCredentials}
          onClearCredentials={onClearDeltaVirtualCredentials}
          onResetSyncSession={onResetDeltaVirtualSyncSession}
        />
      );
    case "simbrief":
      return (
        <SimBriefSettingsForm
          mode="settings"
          username={simBriefUsernameDraft}
          pilotId={simBriefPilotIdDraft}
          useCurrentUtcForDispatchTime={simBriefUseCurrentUtcForDispatchTime}
          dispatchUnits={simBriefDispatchUnits}
          departureOffsetMinutes={simBriefDepartureOffsetMinutes}
          customAirframes={simBriefCustomAirframesDraft}
          customAirframeDraftId={simBriefCustomAirframeIdDraft}
          customAirframeDraftName={simBriefCustomAirframeNameDraft}
          customAirframeDraftMatchType={simBriefCustomAirframeMatchTypeDraft}
          simBriefAircraftTypes={simBriefAircraftTypes}
          isSimBriefAircraftTypesLoading={isSimBriefAircraftTypesLoading}
          simBriefAircraftTypesError={simBriefAircraftTypesError}
          isSaving={isSimBriefSaving}
          onUsernameChange={onUsernameChange}
          onPilotIdChange={onPilotIdChange}
          onDispatchUnitsChange={onDispatchUnitsChange}
          onDispatchTimeModeChange={onDispatchTimeModeChange}
          onDepartureOffsetChange={onDepartureOffsetChange}
          onCustomAirframeDraftIdChange={onCustomAirframeDraftIdChange}
          onCustomAirframeDraftNameChange={onCustomAirframeDraftNameChange}
          onCustomAirframeDraftMatchTypeChange={onCustomAirframeDraftMatchTypeChange}
          onAddCustomAirframe={onAddCustomAirframe}
          onRemoveCustomAirframe={onRemoveCustomAirframe}
          onSaveCredentials={onSaveSimBriefCredentials}
        />
      );
    case "advanced":
      return (
        <>
          <Panel className={insetPanelClassName}>
            <SectionHeader eyebrow="App Tools" title="Maintenance" />

            <div className={mutedTextStackClassName}>
              <p className="m-0">
                Open the app log, inspect the current build, or check for updates from GitHub.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isDesktopAddonScanAvailable ? (
                <Button
                  variant="ghost"
                  onClick={() => onCheckForUpdates({ manual: true, allowDevToolsSimulation: true })}
                  disabled={isCheckingForUpdates}
                >
                  {isCheckingForUpdates ? "Checking..." : "Check for Updates"}
                </Button>
              ) : null}
              <Button onClick={onOpenLogFile}>Open Log File</Button>
              <Button onClick={onToggleDevTools}>
                {isDevToolsEnabled ? "Dev Tools On" : "Dev Tools Off"}
              </Button>
            </div>
          </Panel>

          <Panel className={insetPanelClassName}>
            <SectionHeader eyebrow="Privacy" title="Delete User Data" />

            <div className={mutedTextStackClassName}>
              <p className="m-0">
                Removes saved schedules, UI state, SimBrief settings, addon folder roots,
                logs, and stored Delta Virtual login settings from this device.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                onClick={onDeleteUserData}
                disabled={isUserDataDeletionBlocked}
              >
                {isDeletingUserData ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </Panel>
        </>
      );
    case "about":
      return (
        <Panel className={cn(insetPanelClassName, "gap-3")}>
          <SectionHeader eyebrow="About" title="Developer Information" />

          <div className={cn("grid gap-2 text-[var(--text-muted)]", supportCopyTextClassName)}>
            <p className="m-0">
              Created by <strong>Jacob Benjamin (DVA11384)</strong> on GitHub as{" "}
              <strong>Talon42</strong>.
            </p>
            <p className="m-0">
              App Version:{" "}
              <strong className="text-[var(--text-heading)]">{appBuildGitTag}</strong>
            </p>
            <p className="m-0">Copyright &copy; 2026 Talon42</p>
            <p className="m-0">
              For flight simulation purposes only. Not a commercial application. This app is not
              affiliated with Delta Air Lines or any other airline.
            </p>
            <p className="m-0">
              Repository:{" "}
              <a
                className="text-[var(--delta-blue)] no-underline hover:underline"
                href="https://github.com/Talon42/DVA-Flight-Planner.git"
                target="_blank"
                rel="noreferrer"
              >
                github.com/Talon42/DVA-Flight-Planner
              </a>
            </p>
            <p className="m-0">
              Email:{" "}
              <a
                className="text-[var(--delta-blue)] no-underline hover:underline"
                href="mailto:jaben428@gmail.com"
              >
                jaben428@gmail.com
              </a>
            </p>
          </div>

          {hasWhatsNewCards ? (
            <div className="flex flex-wrap gap-2 border-t border-[color:var(--line)] pt-3">
              <Button variant="ghost" onClick={onOpenWhatsNew}>
                What's New
              </Button>
            </div>
          ) : null}
        </Panel>
      );
    case "general":
    default:
      return (
        <AddonAirportPanel
          addonScan={addonScan}
          addonScanSummary={addonScanSummary}
          isAddonScanBusy={isAddonScanBusy}
          isDesktopAddonScanAvailable={isDesktopAddonScanAvailable}
          onAddAddonRoot={onAddAddonRoot}
          onRemoveAddonRoot={onRemoveAddonRoot}
          onScanAddonAirports={() =>
            onScanAddonAirports(addonScan.roots, { resetCache: true })
          }
        />
      );
  }
}
