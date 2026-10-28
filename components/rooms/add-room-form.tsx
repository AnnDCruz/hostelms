"use client";

import { useState } from "react";
import { useCreateRoom } from "@/hooks/use-rooms";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";

export function AddRoomForm({ blockId, onDone }: { blockId: string; onDone: () => void }) {
  const create = useCreateRoom();
  const [roomNumber, setRoomNumber] = useState("");
  const [floor, setFloor] = useState("1");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ blockId, roomNumber: roomNumber.trim(), floor: Number(floor) }, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Room number</span>
        <input required maxLength={10} value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} className={fieldClass} placeholder="e.g. 204" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Floor</span>
        <input required type="number" min={0} max={30} value={floor} onChange={(e) => setFloor(e.target.value)} className={fieldClass} />
      </label>
      {create.error && (
        <p role="alert" className="text-sm text-danger">
          {create.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add room"}
        </Button>
      </div>
    </form>
  );
}
