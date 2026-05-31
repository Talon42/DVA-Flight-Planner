import Button from "../../components/ui/Button";
import { mutedTextClassName } from "../../components/ui/patterns";

// Renders the repair prompt for stale flight-board entries.
export default function DetailsFlightBoardRepairPanel({ flight, onRemoveFromFlightBoard, onRepairFlightBoardEntry }) {
  return (
    <div className="grid min-w-0 max-w-full gap-3 rounded-none border border-[color:transparent] bg-[var(--surface-panel)] p-3">
      <p className={mutedTextClassName}>
        This flight board entry is from a previous schedule and needs repair.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button className="min-w-0 w-full" variant="board" size="sm" onClick={() => onRepairFlightBoardEntry(flight.boardEntryId)}>
          Repair
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
    </div>
  );
}
