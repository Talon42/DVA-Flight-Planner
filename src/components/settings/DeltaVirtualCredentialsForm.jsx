import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { cn } from "../ui/cn";
import { fieldInputClassName, fieldLabelClassName, fieldTitleClassName, gridClassNames } from "../ui/forms";
import { insetPanelClassName } from "../ui/patterns";
import SectionHeader from "../ui/SectionHeader";
import { supportCopyTextClassName } from "../ui/typography";

// Renders the Delta Virtual credential form in settings or onboarding mode.
export function DeltaVirtualCredentialsForm({
  mode = "settings",
  compact = false,
  firstName,
  lastName,
  passwordFieldValue,
  isPasswordDisplayText,
  hasSavedPassword = false,
  isSaving,
  isSaveDisabled,
  isClearDisabled,
  onFirstNameChange,
  onLastNameChange,
  onPasswordChange,
  onPasswordFocus,
  onPasswordBlur,
  onSaveCredentials,
  onClearCredentials,
  onSaved
}) {
  const isOnboardingMode = mode === "onboarding";
  const containerClassName = isOnboardingMode ? "grid gap-3" : cn(insetPanelClassName, compact && "gap-3");
  const saveButtonLabel = isOnboardingMode ? "Save & Continue" : "Save";
  const isOnboardingSaveDisabled =
    isOnboardingMode &&
    (!String(firstName || "").trim() ||
      !String(lastName || "").trim() ||
      (!hasSavedPassword && !String(passwordFieldValue || "").trim()));

  const handleSave = async () => {
    const saved = await onSaveCredentials?.({
      firstName,
      lastName
    });

    if (saved) {
      onSaved?.();
    }

    return saved;
  };

  const content = (
    <>
      {!isOnboardingMode ? (
        <SectionHeader
          eyebrow="Delta Virtual"
          title="Login Credentials"
          description="Please enter your Delta Virtual Airlines information including First Name, Last Name, and Password."
        />
      ) : (
        <div className={cn("grid gap-1", supportCopyTextClassName, compact && "gap-0.5")}>
          <p className="m-0">
            Save the same First Name, Last Name, and Password you use for Delta Virtual.
          </p>
        </div>
      )}

      <div className={gridClassNames.twoColumn}>
        <label className={fieldLabelClassName}>
          <span className={fieldTitleClassName}>First Name</span>
          <input
            type="text"
            className={fieldInputClassName}
            value={firstName}
            onChange={(event) => onFirstNameChange?.(event.target.value)}
            placeholder="Enter first name"
          />
        </label>

        <label className={fieldLabelClassName}>
          <span className={fieldTitleClassName}>Last Name</span>
          <input
            type="text"
            className={fieldInputClassName}
            value={lastName}
            onChange={(event) => onLastNameChange?.(event.target.value)}
            placeholder="Enter last name"
          />
        </label>
      </div>

      <label className={fieldLabelClassName}>
        <span className={fieldTitleClassName}>Password</span>
        <input
          type={isPasswordDisplayText ? "text" : "password"}
          className={fieldInputClassName}
          value={passwordFieldValue}
          onFocus={onPasswordFocus}
          onBlur={onPasswordBlur}
          onChange={(event) => onPasswordChange?.(event.target.value)}
          autoComplete="new-password"
        />
      </label>

      <div className={cn("flex flex-wrap gap-2", compact && "gap-1.5")}>
        <Button
          onClick={handleSave}
          disabled={isSaving || isSaveDisabled || isOnboardingSaveDisabled}
        >
          {isSaving ? "Saving..." : saveButtonLabel}
        </Button>
        {!isOnboardingMode ? (
          <Button variant="danger" onClick={onClearCredentials} disabled={isSaving || isClearDisabled}>
            Clear Saved Credentials
          </Button>
        ) : null}
      </div>

    </>
  );

  if (isOnboardingMode) {
    return <div className={containerClassName}>{content}</div>;
  }

  return <Panel className={containerClassName}>{content}</Panel>;
}

export default DeltaVirtualCredentialsForm;
