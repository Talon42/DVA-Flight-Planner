import { useCallback, useEffect, useRef, useState } from "react";

function usePromiseConfirmation() {
  const [isOpen, setIsOpen] = useState(false);
  const resolverRef = useRef(null);

  const resolve = useCallback((confirmed) => {
    setIsOpen(false);
    const pendingResolver = resolverRef.current;
    resolverRef.current = null;
    pendingResolver?.(Boolean(confirmed));
  }, []);

  const confirm = useCallback(() => {
    resolverRef.current?.(false);
    return new Promise((pendingResolver) => {
      resolverRef.current = pendingResolver;
      setIsOpen(true);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") resolve(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, resolve]);

  useEffect(() => () => {
    const pendingResolver = resolverRef.current;
    resolverRef.current = null;
    pendingResolver?.(false);
  }, []);

  return { isOpen, confirm, resolve };
}

// Owns promise resolver mechanics for destructive and overwrite confirmations.
export function useAppConfirmations() {
  const deleteUserData = usePromiseConfirmation();
  const dutyBoardOverwrite = usePromiseConfirmation();

  return {
    isDeleteUserDataConfirmOpen: deleteUserData.isOpen,
    confirmDeleteUserDataInApp: deleteUserData.confirm,
    resolveDeleteUserDataConfirmation: deleteUserData.resolve,
    isDutyBoardOverwriteConfirmOpen: dutyBoardOverwrite.isOpen,
    confirmDutyBoardOverwriteInApp: dutyBoardOverwrite.confirm,
    resolveDutyBoardOverwriteConfirmation: dutyBoardOverwrite.resolve
  };
}
