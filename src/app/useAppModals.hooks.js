import { useRef, useState } from "react";

// Owns the low-risk app modals so App.jsx can keep workflow logic focused elsewhere.
export function useAppModals() {
  const [isReadmeOpen, setIsReadmeOpen] = useState(false);
  const [isDeleteUserDataConfirmOpen, setIsDeleteUserDataConfirmOpen] = useState(false);
  const [isDutyBoardOverwriteConfirmOpen, setIsDutyBoardOverwriteConfirmOpen] = useState(false);
  const [isSimBriefDispatchBlockedOpen, setIsSimBriefDispatchBlockedOpen] = useState(false);
  const [simBriefDispatchBlockedMessage, setSimBriefDispatchBlockedMessage] = useState("");
  const deleteUserDataConfirmResolverRef = useRef(null);
  const dutyBoardOverwriteConfirmResolverRef = useRef(null);

  function handleOpenReadme() {
    setIsReadmeOpen(true);
  }

  function handleToggleReadme() {
    setIsReadmeOpen((current) => !current);
  }

  function handleCloseReadme() {
    setIsReadmeOpen(false);
  }

  function handleOpenDeleteUserDataConfirm() {
    setIsDeleteUserDataConfirmOpen(true);
  }

  function handleCloseDeleteUserDataConfirm() {
    setIsDeleteUserDataConfirmOpen(false);
  }

  function handleOpenDutyBoardOverwriteConfirm() {
    setIsDutyBoardOverwriteConfirmOpen(true);
  }

  function handleCloseDutyBoardOverwriteConfirm() {
    setIsDutyBoardOverwriteConfirmOpen(false);
  }

  function handleOpenSimBriefDispatchBlocked(message) {
    setSimBriefDispatchBlockedMessage(String(message || "").trim());
    setIsSimBriefDispatchBlockedOpen(true);
  }

  function handleCloseSimBriefDispatchBlocked() {
    setIsSimBriefDispatchBlockedOpen(false);
    setSimBriefDispatchBlockedMessage("");
  }

  return {
    isReadmeOpen,
    setIsReadmeOpen,
    handleOpenReadme,
    handleToggleReadme,
    handleCloseReadme,
    isDeleteUserDataConfirmOpen,
    setIsDeleteUserDataConfirmOpen,
    handleOpenDeleteUserDataConfirm,
    handleCloseDeleteUserDataConfirm,
    isDutyBoardOverwriteConfirmOpen,
    setIsDutyBoardOverwriteConfirmOpen,
    handleOpenDutyBoardOverwriteConfirm,
    handleCloseDutyBoardOverwriteConfirm,
    isSimBriefDispatchBlockedOpen,
    setIsSimBriefDispatchBlockedOpen,
    simBriefDispatchBlockedMessage,
    setSimBriefDispatchBlockedMessage,
    handleOpenSimBriefDispatchBlocked,
    handleCloseSimBriefDispatchBlocked,
    deleteUserDataConfirmResolverRef,
    dutyBoardOverwriteConfirmResolverRef
  };
}
