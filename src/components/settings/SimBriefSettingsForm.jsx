import { useEffect, useState } from "react";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { cn } from "../ui/cn";
import {
  fieldInputClassName,
  gridClassNames
} from "../ui/forms";
import { insetPanelClassName, mutedTextClassName } from "../ui/patterns";
import SectionHeader from "../ui/SectionHeader";
import { bodySmTextClassName, supportCopyTextClassName } from "../ui/typography";
import { Field, SelectField } from "../ui/filterFields";
import { SearchableMultiSelect } from "../ui/SearchableSelect";
import { buildCustomAirframeMatchOptions } from "../../domain/aircraft/aircraftIdentity.js";

// Renders the SimBrief settings form in settings or onboarding mode.
export function SimBriefSettingsForm({
  mode = "settings",
  compact = false,
  username,
  pilotId,
  useCurrentUtcForDispatchTime,
  dispatchUnits,
  departureOffsetMinutes = 0,
  customAirframes,
  customAirframeDraftId,
  customAirframeDraftName,
  customAirframeDraftMatchType,
  isSaving,
  onDispatchUnitsChange,
  onDispatchTimeModeChange,
  onDepartureOffsetChange,
  onCustomAirframeDraftIdChange,
  onCustomAirframeDraftNameChange,
  onCustomAirframeDraftMatchTypeChange,
  onAddCustomAirframe,
  onRemoveCustomAirframe,
  onSaveCredentials,
  onSaved
}) {
  const isOnboardingMode = mode === "onboarding";
  const customAirframeMatchOptions = buildCustomAirframeMatchOptions();
  const departureOffsetOptions = [
    { label: "None", value: 0 },
    { label: "30 Minutes", value: 30 },
    { label: "45 Minutes", value: 45 },
    { label: "60 Minutes", value: 60 }
  ];
  const dispatchTimeSourceOptions = [
    { label: "Schedule UTC", value: "schedule-utc" },
    { label: "Current UTC", value: "current-utc" }
  ];
  const [usernameValue, setUsernameValue] = useState(username);
  const [pilotIdValue, setPilotIdValue] = useState(pilotId);

  useEffect(() => {
    setUsernameValue(username);
  }, [username]);

  useEffect(() => {
    setPilotIdValue(pilotId);
  }, [pilotId]);

  const commitCredentials = async () => {
    const saved = await onSaveCredentials?.({
      username: usernameValue,
      pilotId: pilotIdValue
    });

    if (saved) {
      onSaved?.();
    }

    return saved;
  };

  const handleCredentialKeyDown = async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await commitCredentials();
    }
  };

  const handleSaveClick = async () => {
    await commitCredentials();
  };

  const containerClassName = isOnboardingMode ? "grid gap-3" : cn(insetPanelClassName, compact && "gap-3");

  const content = (
    <>
      {!isOnboardingMode ? (
        <SectionHeader
          eyebrow="SimBrief"
          title="Configure SimBrief integration"
          description="Save your Navigraph alias, Pilot ID, dispatch units, departure offset, and any custom airframes."
        />
      ) : (
        <div className={cn("grid gap-1", supportCopyTextClassName, compact && "gap-0.5")}>
          <p className="m-0">
            Save your Navigraph alias and Pilot ID so the app can connect to SimBrief.
          </p>
        </div>
      )}

      <div className={gridClassNames.twoColumn}>
        <Field label="Navigraph Alias">
          <input
            type="text"
            className={fieldInputClassName}
            value={usernameValue}
            onChange={(event) => setUsernameValue(event.target.value)}
            onBlur={isOnboardingMode ? undefined : commitCredentials}
            onKeyDown={handleCredentialKeyDown}
            placeholder="Enter Alias"
          />
        </Field>

        <Field label="Pilot ID">
          <input
            type="text"
            className={fieldInputClassName}
            value={pilotIdValue}
            onChange={(event) => setPilotIdValue(event.target.value)}
            onBlur={isOnboardingMode ? undefined : commitCredentials}
            onKeyDown={handleCredentialKeyDown}
            placeholder="Enter Pilot ID"
          />
        </Field>
      </div>

      {!isOnboardingMode ? (
        <div className="grid gap-3">
          <SectionHeader title="Dispatch Defaults" />

          <div className="grid gap-3 bp-1024:grid-cols-3">
            <SelectField
              label="Dispatch Units"
              presentation="anchored"
              prioritizeSelectedOptions={false}
              value={dispatchUnits}
              onChange={(event) => onDispatchUnitsChange?.(event.target.value)}
              disabled={isSaving}
            >
              <option value="LBS">LBS</option>
              <option value="KGS">KGS</option>
            </SelectField>

            <SelectField
              label="Dispatch Time Source"
              presentation="anchored"
              prioritizeSelectedOptions={false}
              value={useCurrentUtcForDispatchTime ? "current-utc" : "schedule-utc"}
              onChange={(event) => onDispatchTimeModeChange?.(event.target.value)}
              disabled={isSaving}
            >
              {dispatchTimeSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Departure Offset"
              presentation="anchored"
              prioritizeSelectedOptions={false}
              value={departureOffsetMinutes}
              onChange={(event) => onDepartureOffsetChange?.(Number(event.target.value))}
              disabled={isSaving}
            >
              {departureOffsetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
      ) : null}

      {isOnboardingMode ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSaveClick} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save & Continue"}
          </Button>
        </div>
      ) : null}

      {isOnboardingMode ? null : (
        <div className={cn("grid gap-4", compact && "gap-3")}>
          <SectionHeader
            title="Saved custom airframes"
            description="Add a SimBrief internal ID and match it to a DVA aircraft from the identity table."
          />

          <div className="grid gap-3 bp-1024:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] bp-1400:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_auto]">
            <Field label="Airframe Internal ID" className="min-w-0">
              <input
                type="text"
                className={fieldInputClassName}
                value={customAirframeDraftId}
                onChange={(event) => onCustomAirframeDraftIdChange?.(event.target.value)}
                placeholder="1234_1234567891234"
              />
            </Field>

            <Field label="Airframe Name" className="min-w-0">
              <input
                type="text"
                className={fieldInputClassName}
                value={customAirframeDraftName}
                onChange={(event) => onCustomAirframeDraftNameChange?.(event.target.value)}
                placeholder="A320 Neo Charter"
              />
            </Field>

            <SearchableMultiSelect
              className="min-w-0"
              label="Matching Aircraft"
              placeholder="Search aircraft"
              emptyLabel="No matching aircraft"
              allLabel="Select one aircraft"
              allowMultiple={false}
              hideChips
              showClearAction={false}
              showOptionMark={false}
              showSingleSelectedLabel
              disabled={false}
              options={customAirframeMatchOptions}
              selectedValues={customAirframeDraftMatchType ? [customAirframeDraftMatchType] : []}
              onChange={(values) => onCustomAirframeDraftMatchTypeChange?.(values[0] || "")}
            />

            <div className="flex min-w-0 items-end justify-end">
              <Button
                variant="ghost"
                onClick={onAddCustomAirframe}
                disabled={
                  !customAirframeDraftId.trim() ||
                  !customAirframeDraftName.trim() ||
                  !customAirframeDraftMatchType
                }
              >
                Add
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            {customAirframes.length ? (
              customAirframes.map((entry) => {
                const matchedType =
                  entry.matchName ||
                  entry.matchAircraft ||
                  entry.matchDva ||
                  entry.baseType ||
                  "Relink required";

                return (
                  <div
                    key={entry.internalId}
                    className="flex items-center justify-between gap-3 rounded-none border border-[color:transparent] bg-[var(--input-bg)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <strong>{entry.name || matchedType}</strong>
                      <p className={cn("m-0 [overflow-wrap:anywhere] text-[var(--text-muted)]", bodySmTextClassName)}>
                        {entry.internalId}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-none"
                      onClick={() => onRemoveCustomAirframe?.(entry.internalId)}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })
            ) : (
              <p className={mutedTextClassName}>No custom SimBrief airframes saved yet.</p>
            )}
          </div>
        </div>
      )}

      {!isOnboardingMode ? null : (
        <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
          This uses the same saved SimBrief settings as the main app.
        </p>
      )}
    </>
  );

  if (isOnboardingMode) {
    return <div className={containerClassName}>{content}</div>;
  }

  return <Panel className={containerClassName}>{content}</Panel>;
}

export default SimBriefSettingsForm;
