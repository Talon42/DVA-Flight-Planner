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
  findCustomAirframeByInternalId,
  getSelectedAircraftForFlight,
  resolveSimBriefDispatchAircraft
} from "../../domain/aircraft/aircraftIdentity.js";
import { normalizeDraftNetwork } from "../flightBoard/flightBoard.model.js";

// SimBrief reuses the status field for success copy, so the dismissible popup only shows errors.
const SIMBRIEF_SUCCESS_STATUS_MESSAGES = new Set([
  "SimBrief flight plan loaded.",
  "SimBrief flight plan refreshed.",
  "SimBrief flight plan regenerated."
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
    <div className="grid gap-1.5">
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
        className="[&_.multi-select__trigger]:!min-h-9 [&_.multi-select__trigger]:!px-3 [&_.multi-select__trigger]:!py-2 [&_.multi-select__trigger]:bp-1024:!min-h-8 [&_.multi-select__trigger]:bp-1024:!px-2.5 [&_.multi-select__trigger]:bp-1024:!py-2"
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
            "!min-h-9 !px-3 !py-2 text-[0.9rem] leading-none bp-1024:!min-h-8 bp-1024:!px-2.5 bp-1024:!py-2"
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
            "!min-h-9 !px-3 !py-2 text-[0.9rem] leading-none bp-1024:!min-h-8 bp-1024:!px-2.5 bp-1024:!py-2"
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
  deltaDraftDeleteState = {
    boardEntryId: "",
    isDeleting: false,
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
  onRegenerateDispatch,
  onOpenSimBriefFlight,
  onDraftOnlySubmit,
  onDeleteDeltaVirtualDraftReport = () => {}
}) {
  const rawSelectedAircraft = String(flight?.selectedAircraft || "").trim();
  const normalizedSelectedAircraft = getSelectedAircraftForFlight(flight, simBriefCustomAirframes);
  const selectedCustomAirframe = findCustomAirframeByInternalId(
    rawSelectedAircraft,
    simBriefCustomAirframes
  );
  const selectorSelectedAircraft = selectedCustomAirframe?.internalId
    ? rawSelectedAircraft
    : normalizedSelectedAircraft;
  const lockedSelectedAircraft =
    selectorSelectedAircraft && !/[\s/]/.test(selectorSelectedAircraft)
      ? selectorSelectedAircraft
      : "";
  const simBriefStaticId = String(
    flight?.simbriefPlan?.staticId || flight?.simbriefPlan?.static_id || ""
  ).trim();
  const hasSimBriefPlan = Boolean(simBriefStaticId);
  const draftDeleteRequiresRegenerate = Boolean(flight?.draftDeleteRequiresRegenerate);
  const draftReportId = Number.parseInt(
    String(flight?.draftReportId ?? flight?.dvaDraftReportId ?? ""),
    10
  );
  const hasDraftReportId = Number.isInteger(draftReportId) && draftReportId > 0;
  const draftAircraftResolution = resolveDraftAircraftCompatibility(
    {
      ...flight,
      selectedAircraft: normalizedSelectedAircraft || rawSelectedAircraft
    },
    simBriefCustomAirframes
  );
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
  const isDraftDeleting =
    deltaDraftDeleteState.boardEntryId === flight.boardEntryId &&
    deltaDraftDeleteState.isDeleting;
  const draftOnlyErrorMessage =
    deltaDraftSubmitState.boardEntryId === flight.boardEntryId
      ? String(deltaDraftSubmitState.error || "").trim()
      : "";
  const deleteDraftErrorMessage =
    deltaDraftDeleteState.boardEntryId === flight.boardEntryId
      ? String(deltaDraftDeleteState.error || "").trim()
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
    Boolean(selectorSelectedAircraft) &&
    (Boolean(selectedCustomAirframe?.internalId) ||
      availableAircraftTypes.some((type) => type?.value === selectorSelectedAircraft));
  const dispatchAircraftResolution = resolveSimBriefDispatchAircraft(
    {
      ...flight,
      selectedAircraft: selectorSelectedAircraft
    },
    simBriefCustomAirframes
  );
  const canResolveDispatchAircraft =
    Boolean(selectorSelectedAircraft) &&
    Boolean(dispatchAircraftResolution?.ok) &&
    Boolean(selectedTypeSupported);
  const canGenerateDispatch =
    Boolean(canResolveDispatchAircraft);
  const dispatchDisabled = hasSimBriefPlan
    ? !isDesktopSimBriefAvailable ||
      isDispatching ||
      isDraftSubmitting ||
      draftDeleteRequiresRegenerate ||
      !simBriefStaticId ||
      !simBriefCredentialsConfigured
    : !isDesktopSimBriefAvailable ||
      isDispatching ||
      isDraftSubmitting ||
      !canGenerateDispatch ||
      !simBriefCredentialsConfigured;
  const regenerateDisabled =
    !isDesktopSimBriefAvailable ||
    isDispatching ||
    isDraftSubmitting ||
    !simBriefCredentialsConfigured ||
    !canResolveDispatchAircraft;
  const dispatchLabel = isDispatching
    ? hasSimBriefPlan
      ? "Refreshing Dispatch..."
      : "Generating Dispatch..."
    : hasSimBriefPlan
      ? "Refresh Dispatch"
      : "Generate Dispatch";
  const isRegeneratingDispatch =
    isDispatching &&
    hasSimBriefPlan &&
    String(simBriefDispatchState.message || "").startsWith("Regenerating");
  const regenerateLabel = isRegeneratingDispatch
    ? "Regenerating Dispatch..."
    : "Regenerate Dispatch";
  const draftDisabled = isDraftSubmitting || !draftValidation.valid;
  const draftDisabledTitle =
    draftDisabled && draftValidation.errors.length ? draftValidation.errors.join("; ") : "";
  const showDraftOnlyAction = !hasSimBriefPlan;
  const draftReportUrl = hasDraftReportId
    ? `https://www.deltava.org/pirep.do?id=0x${Number(draftReportId).toString(16)}`
    : "";
  const deleteDraftDisabled =
    isDraftSubmitting || isDispatching || isDraftDeleting || !hasDraftReportId ||
    draftDeleteRequiresRegenerate;
  const deleteDraftLabel = isDraftDeleting ? "Deleting DVA Draft..." : "Delete DVA Draft";
  const draftLabel = isDraftSubmitting
    ? hasDraftReportId
      ? "Updating Draft Only..."
      : "Creating Draft Only..."
    : hasDraftReportId
      ? "Update Draft Only"
      : "Create Draft Only";
  const actionGridClassName = gridClassNames.boardActionsQuad;
  const actionErrorMessage =
    deleteDraftErrorMessage || draftOnlyErrorMessage || simBriefErrorMessage;
  const actionErrorSignature = actionErrorMessage
    ? `${deleteDraftErrorMessage ? "delete" : draftOnlyErrorMessage ? "draft" : "simbrief"}:${actionErrorMessage}`
    : "";
  const finalActionRowClassName = hasDraftReportId
    ? "grid gap-2 bp-1400:grid-cols-3"
    : "grid gap-2 bp-1400:grid-cols-2";
  const [dismissedErrorSignature, setDismissedErrorSignature] = useState("");
  const [isDeleteDraftConfirmOpen, setIsDeleteDraftConfirmOpen] = useState(false);
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

  useEffect(() => {
    if (!isDeleteDraftConfirmOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsDeleteDraftConfirmOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDeleteDraftConfirmOpen]);

  const isActionErrorVisible =
    Boolean(actionErrorSignature) && dismissedErrorSignature !== actionErrorSignature;

  return (
    <div className="relative grid min-w-0 max-w-full gap-3 rounded-none border border-[color:transparent] bg-[var(--surface-panel)] p-3">
      <div className={selectorRowClassName}>
        <FlightCardAircraftSelector
          options={aircraftTypeOptions}
          selectedValue={hasSimBriefPlan ? lockedSelectedAircraft : selectorSelectedAircraft}
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
          title={hasSimBriefPlan && draftDeleteRequiresRegenerate ? "Regenerate dispatch before refreshing." : ""}
        >
          {dispatchLabel}
        </Button>
        {hasSimBriefPlan && (
          <Button
            className="min-w-0 w-full"
            variant="board"
            size="sm"
            onClick={onRegenerateDispatch}
            disabled={regenerateDisabled}
          >
            {regenerateLabel}
          </Button>
        )}
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
        {showDraftOnlyAction ? (
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
      </div>

      <div className={finalActionRowClassName}>
        <Button
          className="min-w-0 w-full !bg-[#2D8C5A] !text-white hover:!bg-[#25774C] dark:!bg-[#1F7A4D] dark:hover:!bg-[#25945D]"
          variant={flight.isCompleted ? "ghost" : "success"}
          size="sm"
          onClick={() => onCompleteTourFlight(flight.boardEntryId)}
        >
          {flight.isCompleted ? "Click to Revert Status" : "Complete Flight"}
        </Button>
        {hasDraftReportId ? (
          <Button
            className="min-w-0 w-full"
            variant="danger"
            size="sm"
            onClick={() => setIsDeleteDraftConfirmOpen(true)}
            disabled={deleteDraftDisabled}
            title={
              draftDeleteRequiresRegenerate
                ? "Regenerate dispatch before deleting again."
                : ""
            }
          >
            {deleteDraftLabel}
          </Button>
        ) : null}
        <Button
          className="min-w-0 w-full"
          variant="danger"
          size="sm"
          onClick={() => onRemoveFromFlightBoard(flight.boardEntryId)}
        >
          Remove from Board
        </Button>
      </div>
      {isDeleteDraftConfirmOpen ? (
        <div
          className="absolute inset-0 z-[70] flex items-center justify-center overflow-hidden p-4 bp-1024:p-3"
          role="presentation"
          onClick={() => setIsDeleteDraftConfirmOpen(false)}
        >
          <div
            className="absolute inset-0 bg-[rgba(5,10,18,0.55)]"
            aria-hidden="true"
          />
          <Panel
            className={cn(
              modalPanelClassName,
              "relative z-[71] w-[min(520px,calc(100%-1.5rem))] p-5 bp-1024:w-[min(500px,calc(100%-1rem))] bp-1024:p-4"
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Delete DVA draft confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid gap-4">
              <div className="grid gap-2">
                <p className="m-0 text-[var(--text-heading)] text-[1rem] font-semibold">
                  Delete DVA draft?
                </p>
                <p className={cn("m-0", bodySmTextClassName)}>
                  This will delete the draft from the Delta Virtual website and remove it from your
                  logbook. It will not remove the flight board entry.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="board"
                  size="sm"
                  onClick={() => setIsDeleteDraftConfirmOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    setIsDeleteDraftConfirmOpen(false);
                    await onDeleteDeltaVirtualDraftReport(flight.boardEntryId);
                  }}
                  disabled={deleteDraftDisabled}
                >
                  Delete DVA Draft
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}
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
