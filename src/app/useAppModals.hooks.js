import { useState } from "react";

// Owns the low-risk app modals so App.jsx can keep workflow logic focused elsewhere.
export function useAppModals() {
  const [isReadmeOpen, setIsReadmeOpen] = useState(false);
  const [isSimBriefDispatchBlockedOpen, setIsSimBriefDispatchBlockedOpen] = useState(false);
  const [isStaleScheduleBlockedOpen, setIsStaleScheduleBlockedOpen] = useState(false);
  const [simBriefDispatchBlockedMessage, setSimBriefDispatchBlockedMessage] = useState("");

  function handleOpenReadme() {
    setIsReadmeOpen(true);
  }

  function handleToggleReadme() {
    setIsReadmeOpen((current) => !current);
  }

  function handleCloseReadme() {
    setIsReadmeOpen(false);
  }

  function handleOpenSimBriefDispatchBlocked(message) {
    setSimBriefDispatchBlockedMessage(String(message || "").trim());
    setIsSimBriefDispatchBlockedOpen(true);
  }

  function handleCloseSimBriefDispatchBlocked() {
    setIsSimBriefDispatchBlockedOpen(false);
    setSimBriefDispatchBlockedMessage("");
  }

  // Keeps stale schedule blocking separate from the app's other confirmation popups.
  function handleOpenStaleScheduleBlocked() {
    setIsStaleScheduleBlockedOpen(true);
  }

  function handleCloseStaleScheduleBlocked() {
    setIsStaleScheduleBlockedOpen(false);
  }

  return {
    isReadmeOpen,
    setIsReadmeOpen,
    handleOpenReadme,
    handleToggleReadme,
    handleCloseReadme,
    isSimBriefDispatchBlockedOpen,
    setIsSimBriefDispatchBlockedOpen,
    simBriefDispatchBlockedMessage,
    setSimBriefDispatchBlockedMessage,
    handleOpenSimBriefDispatchBlocked,
    handleCloseSimBriefDispatchBlocked,
    isStaleScheduleBlockedOpen,
    setIsStaleScheduleBlockedOpen,
    handleOpenStaleScheduleBlocked,
    handleCloseStaleScheduleBlocked
  };
}
