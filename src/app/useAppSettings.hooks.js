import { useState } from "react";
import { logAppEvent } from "../services/logging/appLog.client.js";

const DVA_PASSWORD_MASK = "********";
const DVA_PASSWORD_PROMPT = "Enter Password";

// Owns the settings modal drafts so the main app can keep workflow logic focused elsewhere.
export function useAppSettings({ setIsDevWindowMenuOpen } = {}) {
  // DVA credential draft state keeps saved values separate from the editable fields.
  const [dvaFirstName, setDvaFirstName] = useState("");
  const [dvaFirstNameDraft, setDvaFirstNameDraft] = useState("");
  const [dvaLastName, setDvaLastName] = useState("");
  const [dvaLastNameDraft, setDvaLastNameDraft] = useState("");
  const [dvaHasPassword, setDvaHasPassword] = useState(false);
  const [dvaPasswordDraft, setDvaPasswordDraft] = useState("");
  const [isDvaPasswordEditing, setIsDvaPasswordEditing] = useState(false);
  const [isDvaCredentialsSaving, setIsDvaCredentialsSaving] = useState(false);

  // When a password is already saved, the form shows a mask; otherwise it shows a prompt.
  const isDvaPasswordMasked = dvaHasPassword && !dvaPasswordDraft && !isDvaPasswordEditing;
  const isDvaPasswordPromptVisible =
    !dvaHasPassword && !dvaPasswordDraft && !isDvaPasswordEditing;
  const isDvaPasswordDisplayText = isDvaPasswordMasked || isDvaPasswordPromptVisible;
  const dvaPasswordFieldValue = isDvaPasswordMasked
    ? DVA_PASSWORD_MASK
    : isDvaPasswordPromptVisible
      ? DVA_PASSWORD_PROMPT
      : dvaPasswordDraft;
  const hasDvaCredentialChanges =
    dvaFirstNameDraft.trim() !== dvaFirstName ||
    dvaLastNameDraft.trim() !== dvaLastName ||
    Boolean(dvaPasswordDraft);

  // SimBrief draft state mirrors the saved values until the user saves from the modal.
  const [simBriefUsername, setSimBriefUsername] = useState("");
  const [simBriefUsernameDraft, setSimBriefUsernameDraft] = useState("");
  const [simBriefPilotId, setSimBriefPilotId] = useState("");
  const [simBriefPilotIdDraft, setSimBriefPilotIdDraft] = useState("");
  const [simBriefUseCurrentUtcForDispatchTime, setSimBriefUseCurrentUtcForDispatchTime] =
    useState(false);
  const [simBriefDispatchUnits, setSimBriefDispatchUnits] = useState("LBS");
  const [savedSimBriefDispatchUnits, setSavedSimBriefDispatchUnits] = useState("LBS");
  const [simBriefCustomAirframes, setSimBriefCustomAirframes] = useState([]);
  const [simBriefCustomAirframesDraft, setSimBriefCustomAirframesDraft] = useState([]);
  const [simBriefCustomAirframeIdDraft, setSimBriefCustomAirframeIdDraft] = useState("");
  const [simBriefCustomAirframeNameDraft, setSimBriefCustomAirframeNameDraft] = useState("");
  const [simBriefCustomAirframeMatchTypeDraft, setSimBriefCustomAirframeMatchTypeDraft] =
    useState("");
  const [isSimBriefSaving, setIsSimBriefSaving] = useState(false);

  const [dvaSyncWarning, setDvaSyncWarning] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");

  // These modal helpers keep the settings UI, dev window menu, and warning prompt in sync.
  function handleToggleSettings() {
    setIsDevWindowMenuOpen?.(false);
    setIsSettingsOpen((current) => {
      const nextValue = !current;
      logAppEvent(nextValue ? "settings-opened" : "settings-closed", {
        section: "addon-airports"
      }).catch(() => {});
      return nextValue;
    });
  }

  function handleCloseSettings() {
    setIsDevWindowMenuOpen?.(false);
    setIsSettingsOpen(false);
    logAppEvent("settings-closed", {
      section: "addon-airports"
    }).catch(() => {});
  }

  function handleOpenDeltaVirtualSettings() {
    setDvaSyncWarning(null);
    setIsDevWindowMenuOpen?.(false);
    setSettingsTab("delta-virtual");
    setIsSettingsOpen(true);
    logAppEvent("settings-opened", {
      section: "delta-virtual"
    }).catch(() => {});
  }

  return {
    dvaSyncWarning,
    setDvaSyncWarning,
    isDvaSyncWarningOpen: Boolean(dvaSyncWarning),
    isSettingsOpen,
    setIsSettingsOpen,
    settingsTab,
    setSettingsTab,
    dvaFirstName,
    setDvaFirstName,
    dvaFirstNameDraft,
    setDvaFirstNameDraft,
    dvaLastName,
    setDvaLastName,
    dvaLastNameDraft,
    setDvaLastNameDraft,
    dvaHasPassword,
    setDvaHasPassword,
    dvaPasswordDraft,
    setDvaPasswordDraft,
    isDvaPasswordEditing,
    setIsDvaPasswordEditing,
    isDvaCredentialsSaving,
    setIsDvaCredentialsSaving,
    hasDvaCredentialChanges,
    isDvaPasswordMasked,
    isDvaPasswordPromptVisible,
    isDvaPasswordDisplayText,
    dvaPasswordFieldValue,
    dvaCredentialsConfigured: Boolean(
      String(dvaFirstName || "").trim() &&
        String(dvaLastName || "").trim() &&
        dvaHasPassword
    ),
    simBriefCredentialsConfigured: Boolean(
      String(simBriefUsername || "").trim() || String(simBriefPilotId || "").trim()
    ),
    simBriefUsername,
    setSimBriefUsername,
    simBriefUsernameDraft,
    setSimBriefUsernameDraft,
    simBriefPilotId,
    setSimBriefPilotId,
    simBriefPilotIdDraft,
    setSimBriefPilotIdDraft,
    simBriefUseCurrentUtcForDispatchTime,
    setSimBriefUseCurrentUtcForDispatchTime,
    simBriefDispatchUnits,
    setSimBriefDispatchUnits,
    savedSimBriefDispatchUnits,
    setSavedSimBriefDispatchUnits,
    simBriefCustomAirframes,
    setSimBriefCustomAirframes,
    simBriefCustomAirframesDraft,
    setSimBriefCustomAirframesDraft,
    simBriefCustomAirframeIdDraft,
    setSimBriefCustomAirframeIdDraft,
    simBriefCustomAirframeNameDraft,
    setSimBriefCustomAirframeNameDraft,
    simBriefCustomAirframeMatchTypeDraft,
    setSimBriefCustomAirframeMatchTypeDraft,
    isSimBriefSaving,
    setIsSimBriefSaving,
    handleToggleSettings,
    handleCloseSettings,
    handleOpenDeltaVirtualSettings
  };
}
