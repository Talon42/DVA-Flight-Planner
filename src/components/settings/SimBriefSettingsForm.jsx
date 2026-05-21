import { useEffect, useMemo, useState } from "react";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { cn } from "../ui/cn";
import { groupSimBriefAircraftTypesByManufacturer } from "../../lib/simbrief";
import { fieldInputClassName, gridClassNames, toggleButtonClassName } from "../ui/forms";
import { insetPanelClassName, mutedTextClassName } from "../ui/patterns";
import SectionHeader from "../ui/SectionHeader";
import { bodySmTextClassName, supportCopyTextClassName } from "../ui/typography";
import { Field } from "../ui/filterFields";
import { SearchableMultiSelect } from "../ui/SearchableSelect";

// Renders the SimBrief settings form in settings or onboarding mode.
export function SimBriefSettingsForm({
  mode = "settings",
  compact = false,
  username,
  pilotId,
  dispatchUnits,
  customAirframes,
  customAirframeDraftId,
  customAirframeDraftName,
  customAirframeDraftMatchType,
  simBriefAircraftTypes,
  isSimBriefAircraftTypesLoading,
  simBriefAircraftTypesError,
  isSaving,
  onUsernameChange,
  onPilotIdChange,
  onDispatchUnitsChange,
  onCustomAirframeDraftIdChange,
  onCustomAirframeDraftNameChange,
  onCustomAirframeDraftMatchTypeChange,
  onAddCustomAirframe,
  onRemoveCustomAirframe,
  onSaveCredentials,
  onSaved
}) {
  const isOnboardingMode = mode === "onboarding";
  const aircraftTypeGroups = groupSimBriefAircraftTypesByManufacturer(simBriefAircraftTypes);
  const customAirframeMatchOptions = useMemo(
    () =>
      aircraftTypeGroups.flatMap((group) =>
        group.items.map((type) => ({
          value: type.code,
          label: type.name,
          selectedLabel: type.name,
          keywords: `${group.manufacturer} ${type.name} ${type.code}`.trim(),
          groupLabel: group.manufacturer
        }))
      ),
    [aircraftTypeGroups]
  );
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
          description="Save your Navigraph alias, Pilot ID, dispatch units, and any custom airframes."
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
        <Field label="Dispatch Units" className="simbrief-units-toggle">
          <div className="toggle-row flex flex-wrap gap-2">
            <button
              className={toggleButtonClassName(dispatchUnits === "LBS")}
              type="button"
              onClick={() => onDispatchUnitsChange?.("LBS")}
            >
              LBS
            </button>
            <button
              className={toggleButtonClassName(dispatchUnits === "KGS")}
              type="button"
              onClick={() => onDispatchUnitsChange?.("KGS")}
            >
              KGS
            </button>
          </div>
        </Field>
      ) : null}

      {isOnboardingMode ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSaveClick} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save & Continue"}
          </Button>
        </div>
      ) : null}

      {isOnboardingMode ? null : (
        <div className={cn("grid gap-4 rounded-none border border-[color:transparent] bg-[var(--surface)] p-4", compact && "gap-3 p-3.5")}>
          <SectionHeader
            title="Saved custom airframes"
            titleClassName="text-[1rem]"
            description="Add a SimBrief internal ID and match it to the aircraft shown on the flight board."
          />

          <div className={gridClassNames.routing}>
            <Field label="Custom Airframe Internal ID">
              <input
                type="text"
                className={fieldInputClassName}
                value={customAirframeDraftId}
                onChange={(event) => onCustomAirframeDraftIdChange?.(event.target.value)}
                placeholder="1234_1234567891234"
              />
            </Field>

            <Field label="Airframe Name">
              <input
                type="text"
                className={fieldInputClassName}
                value={customAirframeDraftName}
                onChange={(event) => onCustomAirframeDraftNameChange?.(event.target.value)}
                placeholder="A320 Neo Charter"
              />
            </Field>

            <SearchableMultiSelect
              label="Matching Aircraft"
              placeholder={isSimBriefAircraftTypesLoading ? "Loading aircraft..." : "Search aircraft"}
              emptyLabel="No matching aircraft"
              allLabel="Select aircraft"
              allowMultiple={false}
              allowSingleDeselect={false}
              hideChips
              showClearAction={false}
              showOptionMark={false}
              showPinnedSelectedBlock={false}
              showSingleSelectedLabel
              disabled={!simBriefAircraftTypes.length}
              options={customAirframeMatchOptions}
              selectedValues={customAirframeDraftMatchType ? [customAirframeDraftMatchType] : []}
              onChange={(values) => onCustomAirframeDraftMatchTypeChange?.(values[0] || "")}
            />
          </div>

          {simBriefAircraftTypesError ? <p className={mutedTextClassName}>{simBriefAircraftTypesError}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={onAddCustomAirframe}
              disabled={!customAirframeDraftId.trim() || !customAirframeDraftName.trim() || !customAirframeDraftMatchType}
            >
              Add Custom Airframe ID
            </Button>
          </div>

          <div className="grid gap-2">
            {customAirframes.length ? (
              customAirframes.map((entry) => {
                const matchedType =
                  simBriefAircraftTypes.find((type) => type.code === entry.matchType)?.name ||
                  entry.matchType;

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
