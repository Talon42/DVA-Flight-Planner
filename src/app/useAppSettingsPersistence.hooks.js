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
import { useRef } from "react";
import { normalizeSimBriefDepartureOffsetMinutes } from "../services/storage/storage.js";
import { saveSimBriefSettings } from "../services/storage/simBriefSettings.storage.js";
import { normalizeSimBriefCustomAirframe } from "../services/tauri/simbrief.client.js";
import { clearLogbookPirepDetailsRequests } from "../features/logbook/logbookPirepDetailsRequests.js";

// Owns settings persistence workflows so App can keep the modal state and tab selection only.
export function useAppSettingsPersistence({
  dvaFirstName,
  dvaFirstNameDraft,
  dvaLastName,
  dvaLastNameDraft,
  dvaPasswordDraft,
  isDvaCredentialsSaving,
  savedSimBriefDepartureOffsetMinutes,
  savedSimBriefDispatchUnits,
  simBriefCustomAirframes,
  simBriefDepartureOffsetMinutes,
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
  setSavedSimBriefDepartureOffsetMinutes,
  setSimBriefCustomAirframeIdDraft,
  setSimBriefCustomAirframeMatchTypeDraft,
  setSimBriefCustomAirframeNameDraft,
  setSimBriefCustomAirframes,
  setSimBriefCustomAirframesDraft,
  setSimBriefDepartureOffsetMinutes,
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
  const simBriefSaveCountRef = useRef(0);
  const latestSimBriefSettingsRef = useRef(null);
  if (simBriefSaveCountRef.current === 0) {
    latestSimBriefSettingsRef.current = {
      username: simBriefUsernameDraft,
      pilotId: simBriefPilotIdDraft,
      useCurrentUtcForDispatchTime: Boolean(simBriefUseCurrentUtcForDispatchTime),
      dispatchUnits: simBriefDispatchUnits,
      departureOffsetMinutes: simBriefDepartureOffsetMinutes,
      customAirframes: simBriefCustomAirframesDraft
    };
  }

  function beginSimBriefSave() {
    simBriefSaveCountRef.current += 1;
    setIsSimBriefSaving(true);
  }

  function endSimBriefSave() {
    simBriefSaveCountRef.current = Math.max(0, simBriefSaveCountRef.current - 1);
    if (simBriefSaveCountRef.current === 0) setIsSimBriefSaving(false);
  }
  // Serializes the current SimBrief draft state into the persisted profile shape.
  function buildSimBriefSettingsPayload(overrides = {}) {
    const latestSettings = latestSimBriefSettingsRef.current || {};
    const nextUsername =
      overrides.username !== undefined ? String(overrides.username || "") : latestSettings.username;
    const nextPilotId =
      overrides.pilotId !== undefined ? String(overrides.pilotId || "") : latestSettings.pilotId;
    const nextUseCurrentUtcForDispatchTime =
      overrides.useCurrentUtcForDispatchTime !== undefined
        ? Boolean(overrides.useCurrentUtcForDispatchTime)
        : Boolean(latestSettings.useCurrentUtcForDispatchTime);
    const nextDispatchUnits = overrides.dispatchUnits !== undefined
      ? String(overrides.dispatchUnits || "").trim().toUpperCase() === "KGS"
        ? "KGS"
        : "LBS"
      : latestSettings.dispatchUnits;
    const nextDepartureOffsetMinutes =
      overrides.departureOffsetMinutes !== undefined
        ? normalizeSimBriefDepartureOffsetMinutes(overrides.departureOffsetMinutes)
        : normalizeSimBriefDepartureOffsetMinutes(latestSettings.departureOffsetMinutes);
    const nextCustomAirframes =
      overrides.customAirframes !== undefined ? overrides.customAirframes : latestSettings.customAirframes;

    const nextSettings = {
      username: String(nextUsername || "").trim(),
      pilotId: String(nextPilotId || "").trim(),
      useCurrentUtcForDispatchTime: nextUseCurrentUtcForDispatchTime,
      dispatchUnits: nextDispatchUnits,
      departureOffsetMinutes: nextDepartureOffsetMinutes,
      customAirframes: Array.isArray(nextCustomAirframes)
        ? nextCustomAirframes.map(normalizeSimBriefCustomAirframe).filter(Boolean)
        : []
    };
    latestSimBriefSettingsRef.current = nextSettings;
    return nextSettings;
  }

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
      clearLogbookPirepDetailsRequests();
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
    const nextSettings = buildSimBriefSettingsPayload({
      username: overrides.username,
      pilotId: overrides.pilotId,
      customAirframes: simBriefCustomAirframesDraft
    });
    const { username: nextUsername, pilotId: nextPilotId, customAirframes: nextCustomAirframes } =
      nextSettings;

    if (
      nextUsername === simBriefUsername &&
      nextPilotId === simBriefPilotId &&
      JSON.stringify(nextCustomAirframes) === JSON.stringify(simBriefCustomAirframes)
    ) {
      return false;
    }

    beginSimBriefSave();

    try {
      const saveResult = await saveSimBriefSettings(nextSettings);
      if (!saveResult.authoritative) return false;
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSavedSimBriefDepartureOffsetMinutes(simBriefDepartureOffsetMinutes);
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
        departureOffsetMinutes: simBriefDepartureOffsetMinutes,
        customAirframeCount: nextCustomAirframes.length
      });
      return true;
    } catch (error) {
      setStatusMessage(error.message || "Unable to save SimBrief settings.");
      await logSystemError("SimBrief", "settings-save-failed", error);
      return false;
    } finally {
      endSimBriefSave();
    }
  }

  // Saves the dispatch-units toggle immediately so it stays in sync with the stored profile.
  async function handleSimBriefDispatchUnitsChange(nextUnits) {
    const normalizedUnits = nextUnits === "KGS" ? "KGS" : "LBS";
    setSimBriefDispatchUnits(normalizedUnits);

    if (normalizedUnits === savedSimBriefDispatchUnits) {
      return;
    }

    beginSimBriefSave();

    try {
      const nextSettings = buildSimBriefSettingsPayload({
        dispatchUnits: normalizedUnits,
        customAirframes: simBriefCustomAirframesDraft
      });
      const { username: nextUsername, pilotId: nextPilotId, customAirframes: nextCustomAirframes } =
        nextSettings;
      const saveResult = await saveSimBriefSettings(nextSettings);
      if (!saveResult.authoritative) return;
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(normalizedUnits);
      setSavedSimBriefDepartureOffsetMinutes(simBriefDepartureOffsetMinutes);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage(`SimBrief dispatch units set to ${normalizedUnits}.`);
      await logSystemEvent("SimBrief", "dispatch-units-saved", {
        dispatchUnits: normalizedUnits,
        departureOffsetMinutes: simBriefDepartureOffsetMinutes
      });
    } catch (error) {
      setSimBriefDispatchUnits(savedSimBriefDispatchUnits);
      setStatusMessage(error.message || "Unable to save SimBrief dispatch units.");
      await logSystemError("SimBrief", "dispatch-units-save-failed", error, {
        dispatchUnits: normalizedUnits
      });
    } finally {
      endSimBriefSave();
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

    beginSimBriefSave();

    try {
      const nextSettings = buildSimBriefSettingsPayload({
        customAirframes: nextCustomAirframes
      });
      const { username: nextUsername, pilotId: nextPilotId } = nextSettings;
      const saveResult = await saveSimBriefSettings(nextSettings);
      if (!saveResult.authoritative) return;
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSavedSimBriefDepartureOffsetMinutes(simBriefDepartureOffsetMinutes);
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
      endSimBriefSave();
    }
  }

  // Removes a stored custom airframe and rewrites the saved SimBrief profile.
  async function handleRemoveCustomAirframeDraft(internalId) {
    const nextCustomAirframes = simBriefCustomAirframesDraft.filter(
      (entry) => entry.internalId !== internalId
    );

    beginSimBriefSave();

    try {
      const nextSettings = buildSimBriefSettingsPayload({
        customAirframes: nextCustomAirframes
      });
      const { username: nextUsername, pilotId: nextPilotId } = nextSettings;
      const saveResult = await saveSimBriefSettings(nextSettings);
      if (!saveResult.authoritative) return;
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSavedSimBriefDepartureOffsetMinutes(simBriefDepartureOffsetMinutes);
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
      endSimBriefSave();
    }
  }

  // Persists the dispatch-time mode alongside the current SimBrief drafts.
  async function handleSimBriefDispatchTimeModeChange(nextMode) {
    const nextUseCurrentUtcForDispatchTime = nextMode === "current-utc";
    const previousUseCurrentUtcForDispatchTime = Boolean(
      simBriefUseCurrentUtcForDispatchTime
    );
    setSimBriefUseCurrentUtcForDispatchTime(nextUseCurrentUtcForDispatchTime);

    if (previousUseCurrentUtcForDispatchTime === nextUseCurrentUtcForDispatchTime) {
      return;
    }

    beginSimBriefSave();

    try {
      const nextSettings = buildSimBriefSettingsPayload({
        useCurrentUtcForDispatchTime: nextUseCurrentUtcForDispatchTime,
        customAirframes: simBriefCustomAirframesDraft
      });
      const { username: nextUsername, pilotId: nextPilotId, customAirframes: nextCustomAirframes } =
        nextSettings;
      const saveResult = await saveSimBriefSettings(nextSettings);
      if (!saveResult.authoritative) return;
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSavedSimBriefDepartureOffsetMinutes(simBriefDepartureOffsetMinutes);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage(
        `SimBrief dispatch time set to ${
          nextUseCurrentUtcForDispatchTime ? "Current UTC" : "Schedule UTC"
        }.`
      );
      await logSystemEvent("SimBrief", "dispatch-time-saved", {
        useCurrentUtcForDispatchTime: nextUseCurrentUtcForDispatchTime,
        departureOffsetMinutes: simBriefDepartureOffsetMinutes
      });
    } catch (error) {
      setSimBriefUseCurrentUtcForDispatchTime(previousUseCurrentUtcForDispatchTime);
      setStatusMessage(error.message || "Unable to save SimBrief dispatch time.");
      await logSystemError("SimBrief", "dispatch-time-save-failed", error, {
        useCurrentUtcForDispatchTime: nextUseCurrentUtcForDispatchTime,
        departureOffsetMinutes: simBriefDepartureOffsetMinutes
      });
    } finally {
      endSimBriefSave();
    }
  }

  // Saves the departure offset immediately so dispatch timing stays in sync with the stored profile.
  async function handleSimBriefDepartureOffsetChange(nextOffsetMinutes) {
    const normalizedOffsetMinutes = normalizeSimBriefDepartureOffsetMinutes(nextOffsetMinutes);
    setSimBriefDepartureOffsetMinutes(normalizedOffsetMinutes);

    if (
      normalizedOffsetMinutes === savedSimBriefDepartureOffsetMinutes
    ) {
      return;
    }

    beginSimBriefSave();

    try {
      const nextSettings = buildSimBriefSettingsPayload({
        departureOffsetMinutes: normalizedOffsetMinutes,
        customAirframes: simBriefCustomAirframesDraft
      });
      const { username: nextUsername, pilotId: nextPilotId, customAirframes: nextCustomAirframes } =
        nextSettings;
      const saveResult = await saveSimBriefSettings(nextSettings);
      if (!saveResult.authoritative) return;
      setSimBriefUsername(nextUsername);
      setSimBriefUsernameDraft(nextUsername);
      setSimBriefPilotId(nextPilotId);
      setSimBriefPilotIdDraft(nextPilotId);
      setSavedSimBriefDispatchUnits(simBriefDispatchUnits);
      setSavedSimBriefDepartureOffsetMinutes(normalizedOffsetMinutes);
      setSimBriefCustomAirframes(nextCustomAirframes);
      setSimBriefCustomAirframesDraft(nextCustomAirframes);
      setStatusMessage(
        normalizedOffsetMinutes
          ? `SimBrief departure offset set to ${normalizedOffsetMinutes} minutes.`
          : "SimBrief departure offset set to none."
      );
      await logSystemEvent("SimBrief", "departure-offset-saved", {
        departureOffsetMinutes: normalizedOffsetMinutes
      });
    } catch (error) {
      setSimBriefDepartureOffsetMinutes(savedSimBriefDepartureOffsetMinutes);
      setStatusMessage(error.message || "Unable to save SimBrief departure offset.");
      await logSystemError("SimBrief", "departure-offset-save-failed", error, {
        departureOffsetMinutes: normalizedOffsetMinutes
      });
    } finally {
      endSimBriefSave();
    }
  }

  return {
    handleSaveDeltaVirtualCredentials,
    handleClearDeltaVirtualCredentials,
    handleSaveSimBriefCredentials,
    handleSimBriefDispatchUnitsChange,
    handleSimBriefDispatchTimeModeChange,
    handleSimBriefDepartureOffsetChange,
    handleAddCustomAirframeDraft,
    handleRemoveCustomAirframeDraft
  };
}

export default useAppSettingsPersistence;
