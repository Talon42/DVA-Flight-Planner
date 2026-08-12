import { useCallback } from "react";

// Coordinates a double-click add with the panel that should reveal the Flight Board.
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

      // Basic Filters should never obscure the board after a Flights-table activation.
      if (scheduleView === "flights") {
        setPlannerControlsCollapsed(true);
        return;
      }

      // Keep selector context visible when an accomplishment or tour add is rejected.
      if (!didAddRow) {
        return;
      }

      if (scheduleView === "accomplishments") {
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
