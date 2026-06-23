import { Component } from "react";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";
import ModalBackdrop from "../components/layout/ModalBackdrop";
import GettingStartedModal from "../components/GettingStartedModal";
import ReadmeModal from "../components/ReadmeModal";
import { cn } from "../components/ui/cn";
import {
  dropdownOptionRowClassName,
  dropdownPanelClassName,
  getPlannerTabStateClassName,
  plannerTabClassName
} from "../components/ui/forms";
import { modalPanelClassName, mutedTextClassName, mutedTextStackClassName } from "../components/ui/patterns";
import SectionHeader from "../components/ui/SectionHeader";
import SpinnerStatusModal from "../components/ui/SpinnerStatusModal";
import { logAppError } from "../services/logging/appLog.client.js";
import WhatsNewModal from "../features/whatsNew/WhatsNewModal.jsx";

const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "delta-virtual", label: "Delta Virtual" },
  { id: "simbrief", label: "SimBrief" },
  { id: "advanced", label: "Advanced" },
  { id: "about", label: "About" }
];

class SettingsModalBoundary extends Component {
  constructor(innerProps) {
    super(innerProps);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    logAppError("settings-modal-render-failed", error).catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <Panel
          as="section"
          padding="lg"
          className="grid w-[min(760px,calc(100vw-24px))] gap-4 bg-[var(--modal-shell-bg)]"
          role="alertdialog"
          aria-modal="true"
          aria-label="Settings failed to render"
        >
          <SectionHeader eyebrow="Settings" title="Unable to render settings" />

          <div className={mutedTextStackClassName}>
            <p className="m-0">{this.state.error?.message || "Unexpected error opening settings."}</p>
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={this.props.onClose}>
              Close
            </Button>
          </div>
        </Panel>
      );
    }

    return this.props.children;
  }
}

// Renders the modal and overlay stack without owning any workflow state.
export default function AppOverlayHost({
  isDevContextMenuOpen,
  devContextMenuRef,
  devContextMenuPosition,
  onOpenMainDevtools,
  isSettingsOpen,
  onCloseSettings,
  settingsTab,
  onSetSettingsTab,
  settingsTabContent,
  isReadmeOpen,
  onCloseReadme,
  shouldShowGettingStarted,
  dvaCredentialsConfigured,
  simBriefCredentialsConfigured,
  addonSetupComplete,
  onFinalizeGettingStarted,
  onDismissGettingStarted,
  isWhatsNewOpen,
  whatsNewMode,
  whatsNewCards,
  whatsNewAppVersion,
  onFinishWhatsNew,
  onCloseManualWhatsNew,
  dvaFirstNameDraft,
  dvaLastNameDraft,
  dvaPasswordFieldValue,
  isDvaPasswordDisplayText,
  dvaHasPassword,
  isDvaCredentialsSaving,
  isImporting,
  isSyncing,
  hasDvaCredentialChanges,
  onDvaFirstNameDraftChange,
  onDvaLastNameDraftChange,
  onDvaPasswordDraftChange,
  onDvaPasswordEditingChange,
  onSaveDeltaVirtualCredentials,
  onClearDeltaVirtualCredentials,
  simBriefUsernameDraft,
  simBriefPilotIdDraft,
  simBriefDispatchUnits,
  simBriefCustomAirframesDraft,
  simBriefCustomAirframeIdDraft,
  simBriefCustomAirframeNameDraft,
  simBriefCustomAirframeMatchTypeDraft,
  simBriefAircraftTypes,
  isSimBriefAircraftTypesLoading,
  simBriefAircraftTypesError,
  isSimBriefSaving,
  onSimBriefUsernameDraftChange,
  onSimBriefPilotIdDraftChange,
  onSimBriefDispatchUnitsChange,
  onSimBriefCustomAirframeIdDraftChange,
  onSimBriefCustomAirframeNameDraftChange,
  onSimBriefCustomAirframeMatchTypeDraftChange,
  onAddCustomAirframeDraft,
  onRemoveCustomAirframeDraft,
  onSaveSimBriefCredentials,
  addonScan,
  addonScanSummary,
  isAddonScanBusy,
  isDesktopAddonScanAvailable,
  onAddAddonRoot,
  onRemoveAddonRoot,
  onSkipAddonSetup,
  isDeleteUserDataConfirmOpen,
  onResolveDeleteUserDataConfirmation,
  isDutyBoardOverwriteConfirmOpen,
  onResolveDutyBoardOverwriteConfirmation,
  isSimBriefDispatchBlockedOpen,
  simBriefDispatchBlockedMessage,
  onCloseSimBriefDispatchBlocked,
  isStaleScheduleBlockedOpen,
  onCloseStaleScheduleBlocked,
  onSyncStaleSchedule,
  isUpdatePromptOpen,
  isNoUpdatePromptOpen,
  onCloseUpdatePrompt,
  availableUpdate,
  onDownloadUpdate,
  isAddonAutoScanning,
  dvaSyncWarning,
  isDvaSyncWarningOpen,
  onCloseDvaSyncWarning,
  onOpenDeltaVirtualSettings
}) {
  return (
    <>
      {isDevContextMenuOpen ? (
        <div
          ref={devContextMenuRef}
          className={cn("fixed z-50 min-w-[236px]", dropdownPanelClassName)}
          style={{
            left: `${devContextMenuPosition.x}px`,
            top: `${devContextMenuPosition.y}px`
          }}
          role="menu"
          aria-label="Developer tools context menu"
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <Button
            variant="ghost"
            className={cn("justify-start rounded-none", dropdownOptionRowClassName)}
            onClick={onOpenMainDevtools}
            role="menuitem"
          >
            Open Dev Tools
          </Button>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <ModalBackdrop onClick={onCloseSettings}>
          <SettingsModalBoundary onClose={onCloseSettings}>
            <Panel
              as="section"
              padding="lg"
              className="flex h-[min(calc(100vh-24px),46rem)] w-[min(860px,calc(100vw-24px))] max-w-full flex-col gap-4 overflow-hidden bg-[var(--modal-shell-bg)] bp-1024:h-[min(calc(100vh-24px),44rem)] bp-1024:gap-3"
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              onClick={(event) => event.stopPropagation()}
            >
              <SectionHeader
                eyebrow="Settings"
                title="Application Settings"
                actions={<Button variant="ghost" onClick={onCloseSettings}>Close</Button>}
              />

              <div
                className="planner-tabs mt-2 flex w-full min-w-0 flex-nowrap items-end gap-4 overflow-x-auto border-b border-[color:var(--line)] pb-1"
                role="tablist"
                aria-orientation="horizontal"
                aria-label="Settings sections"
              >
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`settings-tab-${tab.id}`}
                    aria-controls={`settings-panel-${tab.id}`}
                    aria-selected={settingsTab === tab.id}
                    tabIndex={settingsTab === tab.id ? 0 : -1}
                    className={cn(
                      plannerTabClassName,
                      "shrink-0 whitespace-nowrap",
                      getPlannerTabStateClassName(settingsTab === tab.id)
                    )}
                    onClick={() => onSetSettingsTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex min-h-0 flex-1 pt-1">
                <div
                  id={`settings-panel-${settingsTab}`}
                  role="tabpanel"
                  aria-labelledby={`settings-tab-${settingsTab}`}
                  className="app-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
                >
                  {settingsTabContent}
                </div>
              </div>
            </Panel>
          </SettingsModalBoundary>
        </ModalBackdrop>
      ) : null}

      {isReadmeOpen ? <ReadmeModal isOpen={isReadmeOpen} onClose={onCloseReadme} /> : null}

      {shouldShowGettingStarted ? (
        <GettingStartedModal
          isOpen={shouldShowGettingStarted}
          dvaComplete={dvaCredentialsConfigured}
          simBriefComplete={simBriefCredentialsConfigured}
          addonComplete={addonSetupComplete}
          onFinalize={onFinalizeGettingStarted}
          onSkip={onDismissGettingStarted}
          dvaFormProps={{
            firstName: dvaFirstNameDraft,
            lastName: dvaLastNameDraft,
            passwordFieldValue: dvaPasswordFieldValue,
            isPasswordDisplayText: isDvaPasswordDisplayText,
            hasSavedPassword: dvaHasPassword,
            isSaving: isDvaCredentialsSaving,
            isSaveDisabled:
              isDvaCredentialsSaving || isImporting || isSyncing || !hasDvaCredentialChanges,
            isClearDisabled: isDvaCredentialsSaving || isImporting || isSyncing,
            onFirstNameChange: onDvaFirstNameDraftChange,
            onLastNameChange: onDvaLastNameDraftChange,
            onPasswordChange: onDvaPasswordDraftChange,
            onPasswordFocus: () => {
              if (isDvaPasswordDisplayText) {
                onDvaPasswordEditingChange(true);
                onDvaPasswordDraftChange("");
              }
            },
            onPasswordBlur: () => onDvaPasswordEditingChange(false),
            onSaveCredentials: onSaveDeltaVirtualCredentials,
            onClearCredentials: onClearDeltaVirtualCredentials
          }}
          simBriefFormProps={{
            username: simBriefUsernameDraft,
            pilotId: simBriefPilotIdDraft,
            dispatchUnits: simBriefDispatchUnits,
            customAirframes: simBriefCustomAirframesDraft,
            customAirframeDraftId: simBriefCustomAirframeIdDraft,
            customAirframeDraftName: simBriefCustomAirframeNameDraft,
            customAirframeDraftMatchType: simBriefCustomAirframeMatchTypeDraft,
            simBriefAircraftTypes,
            isSimBriefAircraftTypesLoading,
            simBriefAircraftTypesError,
            isSaving: isSimBriefSaving,
            onUsernameChange: onSimBriefUsernameDraftChange,
            onPilotIdChange: onSimBriefPilotIdDraftChange,
            onDispatchUnitsChange: onSimBriefDispatchUnitsChange,
            onCustomAirframeDraftIdChange: onSimBriefCustomAirframeIdDraftChange,
            onCustomAirframeDraftNameChange: onSimBriefCustomAirframeNameDraftChange,
            onCustomAirframeDraftMatchTypeChange: onSimBriefCustomAirframeMatchTypeDraftChange,
            onAddCustomAirframe: onAddCustomAirframeDraft,
            onRemoveCustomAirframe: onRemoveCustomAirframeDraft,
            onSaveCredentials: onSaveSimBriefCredentials
          }}
          addonProps={{
            addonScan,
            addonScanSummary,
            isAddonScanBusy,
            isDesktopAddonScanAvailable,
            onAddAddonRoot,
            onRemoveAddonRoot,
            onSkipAddonSetup
          }}
        />
      ) : null}

      {!shouldShowGettingStarted && isWhatsNewOpen ? (
        <WhatsNewModal
          isOpen={isWhatsNewOpen}
          mode={whatsNewMode}
          cards={whatsNewCards}
          appVersion={whatsNewAppVersion}
          onFinish={onFinishWhatsNew}
          onCloseManual={onCloseManualWhatsNew}
        />
      ) : null}

      {isDeleteUserDataConfirmOpen ? (
        <ModalBackdrop onClick={() => onResolveDeleteUserDataConfirmation(false)}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(520px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Delete User Info"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Delete User Info" title="Delete all stored user data?" />

            <p className={mutedTextClassName}>
              This removes saved schedules, UI state, SimBrief settings, addon folder roots, logs,
              and stored Delta Virtual login settings from this device.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onResolveDeleteUserDataConfirmation(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => onResolveDeleteUserDataConfirmation(true)}>
                Delete
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isDutyBoardOverwriteConfirmOpen ? (
        <ModalBackdrop onClick={() => onResolveDutyBoardOverwriteConfirmation(false)}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(560px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Overwrite flight board"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader
              eyebrow="Duty Schedule"
              title="Overwrite the current flight board?"
            />

            <p className={mutedTextClassName}>
              Generate Schedule will replace the active flight board with a newly generated duty
              schedule. Choose Yes to continue or No to cancel.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onResolveDutyBoardOverwriteConfirmation(false)}>
                No
              </Button>
              <Button variant="danger" onClick={() => onResolveDutyBoardOverwriteConfirmation(true)}>
                Yes
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isSimBriefDispatchBlockedOpen ? (
        <ModalBackdrop onClick={onCloseSimBriefDispatchBlocked}>
          <Panel
            as="section"
            padding="lg"
            className={cn(modalPanelClassName, "!w-[min(620px,100%)]")}
            role="dialog"
            aria-modal="true"
            aria-label="Custom SimBrief airframe required"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader
              eyebrow="SimBrief"
              title="Custom SimBrief airframe required"
            />

            <p className={mutedTextClassName}>
              {simBriefDispatchBlockedMessage ||
                "This aircraft is supported by Delta Virtual but is not directly selectable in SimBrief. Please create a custom SimBrief airframe and link it to this aircraft in Flight Planner."}
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCloseSimBriefDispatchBlocked}>
                Close
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isStaleScheduleBlockedOpen ? (
        <ModalBackdrop onClick={onCloseStaleScheduleBlocked}>
          <Panel
            as="section"
            padding="lg"
            className={cn(modalPanelClassName, "!w-[min(620px,100%)]")}
            role="dialog"
            aria-modal="true"
            aria-label="Schedule out of date"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Schedule" title="Schedule Out of Date" />

            <p className={mutedTextClassName}>Please click <b>Sync Now</b> to add flights to the flight board.</p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCloseStaleScheduleBlocked}>
                Close
              </Button>
              <Button
                onClick={() => {
                  onCloseStaleScheduleBlocked?.();
                  void onSyncStaleSchedule?.();
                }}
              >
                Sync Now
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isUpdatePromptOpen && availableUpdate?.updateAvailable ? (
        <ModalBackdrop onClick={onCloseUpdatePrompt}>
          <Panel
            as="section"
            padding="lg"
            className={cn(modalPanelClassName, "!w-[min(520px,100%)]")}
            role="dialog"
            aria-modal="true"
            aria-label="Update Available"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Update Available" title="A newer version is ready." />

            <div className={mutedTextStackClassName}>
              <p className="m-0">
                Current version: <strong className="text-[var(--text-heading)]">{availableUpdate.currentVersion}</strong>
              </p>
              <p className="m-0">
                Latest release: <strong className="text-[var(--text-heading)]">{availableUpdate.latestVersion}</strong>
              </p>
              <p className="m-0">
                Click the Update button to download the latest version. Close the app, replace
                the old .exe file with the downloaded one to update. All of your settings will be
                retained.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCloseUpdatePrompt}>
                Later
              </Button>
              <Button onClick={onDownloadUpdate}>
                Download Update
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isNoUpdatePromptOpen ? (
        <ModalBackdrop onClick={onCloseUpdatePrompt}>
          <Panel
            as="section"
            padding="lg"
            className={cn(modalPanelClassName, "!w-[min(520px,100%)]")}
            role="dialog"
            aria-modal="true"
            aria-label="No Update Required"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader eyebrow="Update Check" title="No update required." />

            <p className={mutedTextClassName}>
              No update required, currently on the latest version.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCloseUpdatePrompt}>
                Close
              </Button>
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}

      {isSyncing ? (
        <SpinnerStatusModal
          eyebrow="Delta Virtual Sync"
          title="Syncing data from Delta Virtual"
          description="Refreshing your schedule and logbook data."
          ariaLabel="Delta Virtual sync in progress"
        />
      ) : null}

      {isAddonAutoScanning ? (
        <SpinnerStatusModal
          eyebrow="Addon Airports"
          title="Scanning Addon Folders"
          description="Refreshing your addon airport cache."
          ariaLabel="Addon folder scan in progress"
        />
      ) : null}

      {isDvaSyncWarningOpen ? (
        <ModalBackdrop onClick={onCloseDvaSyncWarning}>
          <Panel
            as="section"
            padding="lg"
            className="grid w-[min(520px,100%)] gap-5 rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:gap-4"
            role="dialog"
            aria-modal="true"
            aria-label="Delta Virtual Sync Warning"
            onClick={(event) => event.stopPropagation()}
          >
            <SectionHeader
              eyebrow="Delta Virtual Sync"
              title={dvaSyncWarning?.title || "Delta Virtual Sync failed."}
            />

            <div className={mutedTextStackClassName}>
              <p className="m-0">{dvaSyncWarning?.message}</p>
              {dvaSyncWarning?.detail ? <p className="m-0">{dvaSyncWarning.detail}</p> : null}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCloseDvaSyncWarning}>
                Close
              </Button>
              {dvaSyncWarning?.primaryAction === "open_delta_virtual_settings" ? (
                <Button variant="danger" onClick={onOpenDeltaVirtualSettings}>
                  {dvaSyncWarning.primaryLabel || "Open Delta Virtual Settings"}
                </Button>
              ) : null}
            </div>
          </Panel>
        </ModalBackdrop>
      ) : null}
    </>
  );
}
