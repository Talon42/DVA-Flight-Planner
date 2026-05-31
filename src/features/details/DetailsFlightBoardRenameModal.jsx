import { createPortal } from "react-dom";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import ModalBackdrop from "../../components/layout/ModalBackdrop";
import { fieldInputClassName, fieldTitleClassName } from "../../components/ui/forms";
import { modalPanelClassName } from "../../components/ui/patterns";
import { cn } from "../../components/ui/cn";
import { supportCopyTextClassName } from "../../components/ui/typography";

// Renders the flight-board rename modal in the panel overlay host.
export default function DetailsFlightBoardRenameModal({
  isOpen,
  overlayHost,
  renamingBoard,
  renameDraft,
  renameInputRef,
  onRenameDraftChange,
  onClose,
  onSubmit
}) {
  if (!isOpen || !overlayHost || !renamingBoard) {
    return null;
  }

  return createPortal(
    <ModalBackdrop variant="embedded" onClick={onClose}>
      <Panel
        className={cn(
          modalPanelClassName,
          "relative z-[61] w-[min(520px,calc(100%-2rem))] p-5 bp-1024:w-[min(500px,calc(100%-1.5rem))] bp-1024:p-4"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Rename flight board"
        onClick={(event) => event.stopPropagation()}
      >
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="min-w-0">
            <div className={fieldTitleClassName}>Rename flight board</div>
            <p className={cn("m-0 text-[var(--text-muted)]", supportCopyTextClassName)}>
              Update the tab name shown in the flight board card.
            </p>
          </div>
          <input
            ref={renameInputRef}
            className={fieldInputClassName}
            type="text"
            value={renameDraft}
            maxLength={40}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            placeholder="Board name"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save
            </Button>
          </div>
        </form>
      </Panel>
    </ModalBackdrop>,
    overlayHost
  );
}
