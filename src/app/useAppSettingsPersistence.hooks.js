import {
  logAppError,
  logAppEvent,
  logSystemError,
  logSystemEvent
} from "../services/logging/appLog.client.js";
import {
  clearDeltaVirtualCredentials,
  getDefaultDeltaVirtualCredentials,
  saveDeltaVirtualCredentials
} from "../services/tauri/deltaVirtualCredentials.client.js";
import { writeSimBriefSettings } from "../services/storage/storage.js";
import { normalizeSimBriefCustomAirframe } from "../services/tauri/simbrief.client.js";

// Owns settings persistence workflows so App can keep the modal state and tab selection only.
export function useAppSettingsPersistence({
  dvaFirstName,
  dvaFirstNameDraft,
  dvaLastName,
  dvaLastNameDraft,
  dvaPasswordDraft,
  isDvaCredentialsSaving,
  isSimBriefSaving,
  savedSimBriefDispatchUnits,
  simBriefCustomAirframes,
  setDvaFirstName,
  setDvaFirstNameDraft,
  setDvaHasPassword,
  setDvaLastName,
  setDvaLastNameDraft,
  setDvaPasswordDraft,
  setIsDvaCredentialsSaving,
  setIsDvaPasswordEditing,
  setIsSimBriefSaving,
  setSavedSimBriefDispatchUnits,
  setSimBriefCustomAirframeIdDraft,
  setSimBriefCustomAirframeMatchTypeDraft,
  setSimBriefCustomAirframeNameDraft,
  setSimBriefCustomAirframes,
  setSimBriefCustomAirframesDraft,
  setSimBriefDispatchUnits,
  setSimBriefPilotId,
  setSimBriefPilotIdDraft,
  setSimBriefUsername,
  setSimBriefUsernameDraft,
  setSimBriefUseCurrentUtcForDispatchTime,
  setStatusMessage,
  simBriefCustomAirframeIdDraft,
  simBriefCustomAirframeMatchTypeDraft,
  simBriefCustomAirframeNameDraft,
  simBriefCustomAirframesDraft,
  simBriefDispatchUnits,
  simBriefPilotIdDraft,
  simBriefPilotId,
  simBriefUseCurrentUtcForDispatchTime,
  simBriefUsernameDraft,
  simBriefUsername
} = {}) {
  // Saves Delta Virtual credentials while preserving the existing masked-password workflow.
  async function handleSaveDeltaVirtualCredentials(overrides = {}) {
    if (isDvaCredentialsSaving) {
      return false;
    }

    const nextFirstName = String(
      overrides.firstName !== undefined ? overrides.firstName : dvaFirstNameDraft || ""
    ).trim();
    const nextLastName = String(
      overrides.lastName !== undefined ? overrides.lastName : dvaLastNameDraft || ""
    ).trim();
    const nextPasswordDraft =
      overrides.password !== undefined ? String(overrides.password || "") : dvaPasswordDraft;
    const shouldSavePassword = nextPasswordDraft.length > 0;

    if (nextFirstName === dvaFirstName && nextLastName === dvaLastName && !shouldSavePassword) {
      return false;
    }

    setIsDvaCredentialsSaving(true);

    try {
      const savedCredentials = await saveDeltaVirtualCredentials({
        firstName: nextFirstName,
        lastName: nextLastName,
        password: shouldSavePassword ? nextPasswordDraft : undefined
      });
      setDvaFirstName(savedCredentials.firstName);
      setDvaFirstNameDraft(savedCredentials.firstName);
      setDvaLastName(savedCredentials.lastName);
      setDvaLastNameDraft(savedCredentials.lastName);
      setDvaHasPassword(savedCredentials.hasPassword);
      setDvaPasswordDraft("");
      setIsDvaPasswordEditing(false);
      setStatusMessage("Delta Virtual login settings saved.");
      await logAppEvent("deltava-auth-saved", {
        firstNameSaved: Boolean(savedCredentials.firstName),
        lastNameSaved: Boolean(savedCredentials.lastName),
        hasPassword: savedCredentials.hasPassword
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to save Delta Virtual login settings.");
      await logAppError("deltava-auth-save-failed", error);
      return false;
    } finally {
      setIsDvaCredentialsSaving(false);
    }
  }

  // Clears Delta Virtual credentials and restores the default empty draft state.
  async function handleClearDeltaVirtualCredentials() {
    if (isDvaCredentialsSaving) {
      return;
    }

    setIsDvaCredentialsSaving(true);

    try {
      await clearDeltaVirtualCredentials();
      const clearedCredentials = getDefaultDeltaVirtualCredentials();
      setDvaFirstName(clearedCredentials.firstName);
      setDvaFirstNameDraft(clearedCredentials.firstName);
      setDvaLastName(clearedCredentials.lastName);
      setDvaLastNameDraft(clearedCredentials.lastName);
      setDvaHasPassword(clearedCredentials.hasPassword);
      setDvaPasswordDraft("");
      setIsDvaPasswordEditing(false);
      setStatusMessage("Delta Virtual login settings cleared.");
      await logAppEvent("deltava-auth-cleared");
    } catch (error) {
      setStatusMessage(error.message || "Unable to clear Delta Virtual login settings.");
      await logAppError("deltava-auth-clear-failed", error);
    } finally {
      setIsDvaCredentialsSaving(false);
    }
  }

  // Persists the SimBrief credentials and cached custom airframes together.
  async function handleSaveSimBriefCredentials(overrides = {}) {
    if (isSimBriefSaving) {
      return false;
    }

    const nextUsername = String(
      overrides.username !== undefined ? overrides.username : simBriefUsernameDraft || ""
    ).trim();
    const nextPilotId = String(
      overrides.pilotId !== undefined ? overrides.pilotId : simBriefPilotIdDraft || ""
    ).trim();
    const nextCustomAirframes = simBriefCustomAirframesDraft
      .map(normalizeSimBriefCustomAirframe)
      .filter(Boolean);

    if (
      nextUsername === simBriefUsername &&
      nextPilotId === simBriefPilotId &&
      JSON.stringify(nextCustomAirframes) === JSON.stringify(simBriefCustomAirframes)
    ) {
      return false;
    }

    setIsSimBriefSaving(true);

    try {
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        useCurrentUtcForDispatchTime: simBriefUseCurrentUtcForDispatchTime,
        dispatchUnits: simBriefDispatchUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage(
        nextUsername || nextPilotId || nextCustomAirframes.length
          ? "SimBrief settings saved."
          : "SimBrief settings cleared."
      );
      await logSystemEvent("SimBrief", "settings-saved", {
        hasUsername: Boolean(nextUsername),
        hasPilotId: Boolean(nextPilotId),
        dispatchUnits: simBriefDispatchUnits,
        customAirframeCount: nextCustomAirframes.length
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to save SimBrief settings.");
      await logSystemError("SimBrief", "settings-save-failed", error);
      return false;
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  // Saves the dispatch-units toggle immediately so it stays in sync with the stored profile.
  async function handleSimBriefDispatchUnitsChange(nextUnits) {
    const normalizedUnits = nextUnits === "KGS" ? "KGS" : "LBS";
    setSimBriefDispatchUnits(normalizedUnits);

    if (normalizedUnits === savedSimBriefDispatchUnits || isSimBriefSaving) {
      return;
    }

    setIsSimBriefSaving(true);

    try {
      const nextUsername = String(simBriefUsernameDraft || "").trim();
      const nextPilotId = String(simBriefPilotIdDraft || "").trim();
      const nextCustomAirframes = simBriefCustomAirframesDraft
        .map(normalizeSimBriefCustomAirframe)
        .filter(Boolean);
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        useCurrentUtcForDispatchTime: simBriefUseCurrentUtcForDispatchTime,
        dispatchUnits: normalizedUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(normalizedUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage(`SimBrief dispatch units set to ${normalizedUnits}.`);
      await logSystemEvent("SimBrief", "dispatch-units-saved", {
        dispatchUnits: normalizedUnits
      });
    } catch (error) {
      setSimBriefDispatchUnits(savedSimBriefDispatchUnits);
      setStatusMessage(error.message || "Unable to save SimBrief dispatch units.");
      await logSystemError("SimBrief", "dispatch-units-save-failed", error, {
        dispatchUnits: normalizedUnits
      });
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  // Normalizes and persists a newly drafted custom airframe entry.
  async function handleAddCustomAirframeDraft() {
    const normalizedEntry = normalizeSimBriefCustomAirframe({
      internalId: simBriefCustomAirframeIdDraft,
      name: simBriefCustomAirframeNameDraft,
      matchAircraft: simBriefCustomAirframeMatchTypeDraft
    });

    if (!normalizedEntry) {
      setStatusMessage(
        "Enter an airframe name, SimBrief internal ID, and matching DVA aircraft before adding it."
      );
      return;
    }

    if (
      simBriefCustomAirframesDraft.some(
        (entry) => entry.internalId === normalizedEntry.internalId
      )
    ) {
      setStatusMessage("That custom SimBrief airframe ID has already been added.");
      return;
    }

    const nextCustomAirframes = [...simBriefCustomAirframesDraft, normalizedEntry].sort(
      (left, right) =>
        String(left.matchAircraft || left.matchName || left.matchDva || left.baseType || "")
          .localeCompare(String(right.matchAircraft || right.matchName || right.matchDva || right.baseType || "")) ||
        left.internalId.localeCompare(right.internalId)
    );

    setIsSimBriefSaving(true);

    try {
      const nextUsername = String(simBriefUsernameDraft || "").trim();
      const nextPilotId = String(simBriefPilotIdDraft || "").trim();
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        useCurrentUtcForDispatchTime: simBriefUseCurrentUtcForDispatchTime,
        dispatchUnits: simBriefDispatchUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setSimBriefCustomAirframeIdDraft("");
      setSimBriefCustomAirframeNameDraft("");
      setSimBriefCustomAirframeMatchTypeDraft("");
      setStatusMessage("Custom SimBrief airframe saved.");
      await logSystemEvent("SimBrief", "custom-airframe-added", {
        internalId: normalizedEntry.internalId,
        matchAircraft: normalizedEntry.matchAircraft,
        matchDva: normalizedEntry.matchDva,
        customAirframeCount: nextCustomAirframes.length
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to save the custom SimBrief airframe.");
      await logSystemError("SimBrief", "custom-airframe-add-failed", error, {
        internalId: normalizedEntry.internalId,
        matchAircraft: normalizedEntry.matchAircraft,
        matchDva: normalizedEntry.matchDva
      });
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  // Removes a stored custom airframe and rewrites the saved SimBrief profile.
  async function handleRemoveCustomAirframeDraft(internalId) {
    const nextCustomAirframes = simBriefCustomAirframesDraft.filter(
      (entry) => entry.internalId !== internalId
    );

    setIsSimBriefSaving(true);

    try {
      const nextUsername = String(simBriefUsernameDraft || "").trim();
      const nextPilotId = String(simBriefPilotIdDraft || "").trim();
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        useCurrentUtcForDispatchTime: simBriefUseCurrentUtcForDispatchTime,
        dispatchUnits: simBriefDispatchUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage("Custom SimBrief airframe removed.");
      await logSystemEvent("SimBrief", "custom-airframe-removed", {
        internalId,
        customAirframeCount: nextCustomAirframes.length
      });
    } catch (error) {
      setStatusMessage(error.message || "Unable to remove the custom SimBrief airframe.");
      await logSystemError("SimBrief", "custom-airframe-remove-failed", error, {
        internalId
      });
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  // Persists the dispatch-time mode alongside the current SimBrief drafts.
  async function handleSimBriefDispatchTimeModeChange(nextMode) {
    const nextUseCurrentUtcForDispatchTime = nextMode === "current-utc";
    const previousUseCurrentUtcForDispatchTime = Boolean(
      simBriefUseCurrentUtcForDispatchTime
    );
    setSimBriefUseCurrentUtcForDispatchTime(nextUseCurrentUtcForDispatchTime);

    if (previousUseCurrentUtcForDispatchTime === nextUseCurrentUtcForDispatchTime || isSimBriefSaving) {
      return;
    }

    setIsSimBriefSaving(true);

    try {
      const nextUsername = String(simBriefUsernameDraft || "").trim();
      const nextPilotId = String(simBriefPilotIdDraft || "").trim();
      const nextCustomAirframes = simBriefCustomAirframesDraft
        .map(normalizeSimBriefCustomAirframe)
        .filter(Boolean);
      await writeSimBriefSettings({
        username: nextUsername,
        pilotId: nextPilotId,
        useCurrentUtcForDispatchTime: nextUseCurrentUtcForDispatchTime,
        dispatchUnits: simBriefDispatchUnits,
        customAirframes: nextCustomAirframes
      });
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage(
        `SimBrief dispatch time set to ${
          nextUseCurrentUtcForDispatchTime ? "Current UTC" : "Schedule UTC"
        }.`
      );
      await logSystemEvent("SimBrief", "dispatch-time-saved", {
        useCurrentUtcForDispatchTime: nextUseCurrentUtcForDispatchTime
      });
    } catch (error) {
      setSimBriefUseCurrentUtcForDispatchTime(previousUseCurrentUtcForDispatchTime);
      setStatusMessage(error.message || "Unable to save SimBrief dispatch time.");
      await logSystemError("SimBrief", "dispatch-time-save-failed", error, {
        useCurrentUtcForDispatchTime: nextUseCurrentUtcForDispatchTime
      });
    } finally {
      setIsSimBriefSaving(false);
    }
  }

  return {
    handleSaveDeltaVirtualCredentials,
    handleClearDeltaVirtualCredentials,
    handleSaveSimBriefCredentials,
    handleSimBriefDispatchUnitsChange,
    handleSimBriefDispatchTimeModeChange,
    handleAddCustomAirframeDraft,
    handleRemoveCustomAirframeDraft
  };
}

export default useAppSettingsPersistence;
