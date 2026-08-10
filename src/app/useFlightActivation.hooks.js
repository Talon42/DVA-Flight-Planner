import { useCallback } from "react";

// Coordinates the successful double-click add with the panel that should reveal the Flight Board.
export function useFlightActivation({
  handleAddToFlightBoard,
  scheduleView,
  setIsAccomplishmentSelectorCollapsed,
  setIsTourSelectorCollapsed,
  setPlannerControlsCollapsed
}) {
  return useCallback(
    (row) => {
      const didAddRow = handleAddToFlightBoard(row);

      // Keep the current context visible when an add is rejected, such as for a duplicate flight.
      if (!didAddRow) {
        return;
      }

      if (scheduleView === "flights") {
        setPlannerControlsCollapsed(true);
      } else if (scheduleView === "accomplishments") {
        setIsAccomplishmentSelectorCollapsed(true);
      } else if (scheduleView === "tours") {
        setIsTourSelectorCollapsed(true);
      }
    },
    [
      handleAddToFlightBoard,
      scheduleView,
      setIsAccomplishmentSelectorCollapsed,
      setIsTourSelectorCollapsed,
      setPlannerControlsCollapsed
    ]
  );
}
