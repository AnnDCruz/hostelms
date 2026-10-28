import type { RoomDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE = {
  Vacant: "border-border bg-background hover:bg-surface",
  Occupied: "border-accent/30 bg-accent/5 hover:bg-accent/10",
  Blocked: "border-danger/30 bg-danger/5 hover:bg-danger/10",
  Staff: "border-staff/30 bg-staff/5 hover:bg-staff/10",
} as const;

function subtitle(room: RoomDTO) {
  if (room.state === "Occupied") return room.student?.name ?? "Occupied";
  if (room.state === "Staff") return room.staffOccupant?.name ?? "Staff";
  return room.state;
}

export function RoomCell({ room, blockName, onSelect }: { room: RoomDTO; blockName: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Room ${blockName}-${room.roomNumber}, ${room.state}`}
      className={cn(
        "flex min-h-16 flex-col items-start rounded-md border p-2 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        TONE[room.state],
      )}
    >
      <span className="text-sm font-semibold">{room.roomNumber}</span>
      <span className="w-full truncate text-xs text-muted">{subtitle(room)}</span>
    </button>
  );
}
