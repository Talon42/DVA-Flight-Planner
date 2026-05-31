import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import ModalBackdrop from "../../components/layout/ModalBackdrop";
import { SearchableMultiSelect } from "../../components/ui/SearchableSelect";
import { cn } from "../../components/ui/cn";
import {
  fieldLabelClassName,
  fieldTitleClassName,
  gridClassNames,
  toggleButtonClassName
} from "../../components/ui/forms";
import { bodySmTextClassName } from "../../components/ui/typography";
import { modalPanelClassName } from "../../components/ui/patterns";
import {
  buildDeltaVirtualDraftReportPayload,
  resolveDraftAircraftCompatibility,
  validateDeltaVirtualDraftReportPayload
} from "../../domain/deltaVirtual/draftReport.js";
import {
  getSelectedAircraftForFlight,
  resolveSimBriefDispatchAircraft
} from "../../domain/aircraft/aircraftIdentity.js";
import { normalizeDraftNetwork } from "../flightBoard/flightBoard.model.js";

// SimBrief reuses the status field for success copy, so the dismissible popup only shows errors.
const SIMBRIEF_SUCCESS_STATUS_MESSAGES = new Set([
  "SimBrief flight plan loaded.",
  "SimBrief flight plan refreshed."
]);

// Renders the aircraft selector shown above the expanded SimBrief/DVA action buttons.
function FlightCardAircraftSelector({
  options,
  selectedValue,
  isLoading,
  onChange,
  locked = false,
  readOnly = false,
  disabled = false
}) {
  const isLocked = locked || readOnly || disabled;

  return (
    <div className="grid gap-1">
      <SearchableMultiSelect
        label="Aircraft"
        placeholder={isLoading ? "Loading aircraft..." : "Search aircraft"}
        emptyLabel="No matching aircraft"
        allLabel="Select one aircraft"
        allowMultiple={false}
        hideChips
        showClearAction={false}
        showOptionMark={false}
        showSingleSelectedLabel
        options={options}
        selectedValues={selectedValue ? [selectedValue] : [""]}
        onChange={(values) => onChange(values[0] || "")}
        prioritizeSelectedOptions={false}
        disabled={isLocked}
      />
    </div>
  );
}

// Renders the draft network selector used by the expanded flight board card.
function FlightCardNetworkSelector({ value, onChange }) {
  const selectedValue = normalizeDraftNetwork(value);

  return (
    <label className={cn(fieldLabelClassName, "min-w-0")}>
      <span className={fieldTitleClassName}>Network</span>
      <div className="grid w-full grid-cols-2 gap-2">
        <button
          className={cn(
            toggleButtonClassName(selectedValue === "Offline", "choice", "compact"),
            "px-3 py-2 text-[0.9rem] leading-none"
          )}
          type="button"
          aria-pressed={selectedValue === "Offline"}
          onClick={() => onChange("Offline")}
        >
          Offline
        </button>
        <button
          className={cn(
            toggleButtonClassName(selectedValue === "VATSIM", "choice", "compact"),
            "px-3 py-2 text-[0.9rem] leading-none"
          )}
          type="button"
          aria-pressed={selectedValue === "VATSIM"}
          onClick={() => onChange("VATSIM")}
        >
          VATSIM
        </button>
      </div>
    </label>
  );
}

// Renders the expanded SimBrief/DVA action panel for a flight card.
export default function SimBriefInlinePanel({
  flight,
  simBriefDispatchState,
  deltaDraftSubmitState = {
    boardEntryId: "",
    isSubmitting: false,
    error: "",
    result: null
  },
  deltaDraftReportUrlState: _deltaDraftReportUrlState = {
    boardEntryId: "",
    url: ""
  },
  simBriefCredentialsConfigured,
  isDesktopSimBriefAvailable,
  simBriefAircraftTypes,
  simBriefCustomAirframes = [],
  onRemoveFromFlightBoard,
  onCompleteTourFlight,
  onSimBriefTypeChange,
  onDraftNetworkChange,
  onDispatchWorkflow,
  onOpenSimBriefFlight,
  onDraftOnlySubmit
}) {
  const selectedAircraft = getSelectedAircraftForFlight(flight, simBriefCustomAirframes);
  const lockedSelectedAircraft =
    selectedAircraft && !/[\s/]/.test(selectedAircraft) ? selectedAircraft : "";
  const simBriefStaticId = String(
    flight?.simbriefPlan?.staticId || flight?.simbriefPlan?.static_id || ""
  ).trim();
  const hasSimBriefPlan = Boolean(simBriefStaticId);
  const draftReportId = Number.parseInt(
    String(flight?.draftReportId ?? flight?.dvaDraftReportId ?? ""),
    10
  );
  const hasDraftReportId = Number.isInteger(draftReportId) && draftReportId > 0;
  const draftAircraftResolution = resolveDraftAircraftCompatibility(flight, simBriefCustomAirframes);
  const draftPayload = buildDeltaVirtualDraftReportPayload(
    flight,
    draftAircraftResolution,
    simBriefCustomAirframes
  );
  const draftValidation = validateDeltaVirtualDraftReportPayload(draftPayload, {
    selectedSimBriefAircraft: draftAircraftResolution
  });
  const isDraftSubmitting =
    deltaDraftSubmitState.boardEntryId === flight.boardEntryId &&
    deltaDraftSubmitState.isSubmitting;
  const draftOnlyErrorMessage =
    deltaDraftSubmitState.boardEntryId === flight.boardEntryId
      ? String(deltaDraftSubmitState.error || "").trim()
      : "";
  const selectedDraftNetwork = normalizeDraftNetwork(flight?.draftNetwork);
  const simBriefStatusMessage =
    simBriefDispatchState.flightId === flight.boardEntryId
      ? String(simBriefDispatchState.message || "").trim()
      : "";
  const simBriefErrorMessage =
    simBriefStatusMessage &&
    !simBriefDispatchState.isDispatching &&
    !SIMBRIEF_SUCCESS_STATUS_MESSAGES.has(simBriefStatusMessage)
      ? simBriefStatusMessage
      : "";
  const availableAircraftTypes = Array.isArray(simBriefAircraftTypes) ? simBriefAircraftTypes : [];
  const aircraftTypeOptions = availableAircraftTypes;

  const isDispatching =
    simBriefDispatchState.flightId === flight.boardEntryId && simBriefDispatchState.isDispatching;
  const selectedTypeSupported =
    !selectedAircraft || availableAircraftTypes.some((type) => type?.value === selectedAircraft);
  const dispatchAircraftResolution = hasSimBriefPlan
    ? null
    : resolveSimBriefDispatchAircraft(
        {
          ...flight,
          selectedAircraft
        },
        simBriefCustomAirframes
      );
  const canGenerateDispatch =
    Boolean(selectedAircraft) &&
    Boolean(dispatchAircraftResolution?.ok) &&
    Boolean(selectedTypeSupported);
  const dispatchDisabled = hasSimBriefPlan
    ? !isDesktopSimBriefAvailable ||
      isDispatching ||
      isDraftSubmitting ||
      !simBriefStaticId ||
      !simBriefCredentialsConfigured
    : !isDesktopSimBriefAvailable ||
      isDispatching ||
      isDraftSubmitting ||
      !canGenerateDispatch ||
      !simBriefCredentialsConfigured;
  const dispatchLabel = isDispatching
    ? hasSimBriefPlan
      ? "Refreshing Dispatch..."
      : "Generating Dispatch..."
    : hasSimBriefPlan
      ? "Refresh Dispatch"
      : "Generate Dispatch";
  const draftDisabled = isDraftSubmitting || !draftValidation.valid;
  const draftDisabledTitle =
    draftDisabled && draftValidation.errors.length ? draftValidation.errors.join("; ") : "";
  const draftReportUrl = hasDraftReportId
    ? `https://www.deltava.org/pirep.do?id=0x${Number(draftReportId).toString(16)}`
    : "";
  const draftLabel = isDraftSubmitting
    ? hasDraftReportId
      ? "Updating Draft Only..."
      : "Creating Draft Only..."
    : hasDraftReportId
      ? "Update Draft Only"
      : "Create Draft Only";
  const actionGridClassName = gridClassNames.boardActionsQuad;
  const actionErrorMessage = draftOnlyErrorMessage || simBriefErrorMessage;
  const actionErrorSignature = actionErrorMessage
    ? `${draftOnlyErrorMessage ? "draft" : "simbrief"}:${actionErrorMessage}`
    : "";
  const [dismissedErrorSignature, setDismissedErrorSignature] = useState("");
  const actionErrorOverlayHost = typeof document !== "undefined" ? document.body : null;
  const selectorRowClassName =
    "grid gap-2 bp-1400:grid-cols-[minmax(0,1fr)_13rem]";

  // Keep the popup closed until the underlying error changes or clears.
  useEffect(() => {
    if (!actionErrorSignature) {
      setDismissedErrorSignature("");
      return;
    }

    if (dismissedErrorSignature && dismissedErrorSignature !== actionErrorSignature) {
      setDismissedErrorSignature("");
    }
  }, [actionErrorSignature, dismissedErrorSignature]);

  const isActionErrorVisible =
    Boolean(actionErrorSignature) && dismissedErrorSignature !== actionErrorSignature;

  return (
    <div className="grid min-w-0 max-w-full gap-3 rounded-none border border-[color:transparent] bg-[var(--surface-panel)] p-3">
      <div className={selectorRowClassName}>
        <FlightCardAircraftSelector
          options={aircraftTypeOptions}
          selectedValue={hasSimBriefPlan ? lockedSelectedAircraft : selectedAircraft}
          isLoading={false}
          locked={hasSimBriefPlan}
          onChange={(value) => onSimBriefTypeChange(flight.boardEntryId, value || "")}
        />
        <FlightCardNetworkSelector
          value={selectedDraftNetwork}
          onChange={(value) => onDraftNetworkChange(flight.boardEntryId, value || "Offline")}
        />
      </div>

      <div className={actionGridClassName}>
        <Button
          className="min-w-0 w-full"
          variant="board"
          size="sm"
          onClick={onDispatchWorkflow}
          disabled={dispatchDisabled}
        >
          {dispatchLabel}
        </Button>
        {hasSimBriefPlan && (
          <Button
            className="min-w-0 w-full"
            variant="board"
            size="sm"
            onClick={() => onOpenSimBriefFlight(simBriefStaticId)}
          >
            Open in Simbrief
          </Button>
        )}
        {!hasSimBriefPlan ? (
          <Button
            className="min-w-0 w-full"
            variant="board"
            size="sm"
            onClick={() => onDraftOnlySubmit(flight.boardEntryId)}
            disabled={draftDisabled}
            title={draftDisabledTitle}
          >
            {draftLabel}
          </Button>
        ) : null}
        {draftReportUrl ? (
          <Button
            as="a"
            className="min-w-0 w-full"
            variant="board"
            size="sm"
            href={draftReportUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in DVA
          </Button>
        ) : null}
        <Button
          className="min-w-0 w-full !bg-[#2D8C5A] !text-white hover:!bg-[#25774C] dark:!bg-[#1F7A4D] dark:hover:!bg-[#25945D]"
          variant={flight.isCompleted ? "ghost" : "success"}
          size="sm"
          onClick={() => onCompleteTourFlight(flight.boardEntryId)}
        >
          {flight.isCompleted ? "Click to Revert Status" : "Complete Flight"}
        </Button>
        <Button
          className="min-w-0 w-full"
          variant="danger"
          size="sm"
          onClick={() => onRemoveFromFlightBoard(flight.boardEntryId)}
        >
          Remove from Flight Board
        </Button>
      </div>
      {isActionErrorVisible && actionErrorOverlayHost
        ? createPortal(
            <ModalBackdrop
              variant="embedded"
              onClick={() => setDismissedErrorSignature(actionErrorSignature)}
            >
              <Panel
                className={cn(
                  modalPanelClassName,
                  "relative z-[61] w-[min(520px,calc(100%-2rem))] p-5 bp-1024:w-[min(500px,calc(100%-1.5rem))] bp-1024:p-4"
                )}
                role="dialog"
                aria-modal="true"
                aria-label="Dispatch error"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="grid gap-4">
                  <p className={cn("m-0 text-[var(--danger)]", bodySmTextClassName)}>
                    {actionErrorMessage}
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setDismissedErrorSignature(actionErrorSignature)}
                    >
                      OK
                    </Button>
                  </div>
                </div>
              </Panel>
            </ModalBackdrop>,
            actionErrorOverlayHost
          )
        : null}
    </div>
  );
}
