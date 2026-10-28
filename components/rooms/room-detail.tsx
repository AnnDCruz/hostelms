"use client";

import { useState } from "react";
import type { BlockDTO, RoomActionInput, RoomDTO } from "@/lib/types";
import { useRoomAction, useRoomHistory, useRooms } from "@/hooks/use-rooms";
import { useStudents } from "@/hooks/use-students";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";

type Mode = null | "allocate" | "vacate" | "transfer" | "block" | "staff";

const STATE_TONE: Record<RoomDTO["state"], Tone> = { Vacant: "neutral", Occupied: "accent", Blocked: "danger", Staff: "staff" };
const EVENT_LABEL = {
  Allocated: "Allocated",
  Vacated: "Vacated",
  Blocked: "Blocked",
  Unblocked: "Unblocked",
  TransferIn: "Transferred in",
  TransferOut: "Transferred out",
} as const;

const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export function RoomDetail({ room, block, blocks }: { room: RoomDTO; block: BlockDTO; blocks: BlockDTO[] }) {
  const [mode, setMode] = useState<Mode>(null);
  const act = useRoomAction();
  const history = useRoomHistory(room.id);

  const open = (m: Mode) => {
    act.reset();
    setMode(m);
  };
  const run = (body: RoomActionInput) => act.mutate({ roomId: room.id, body }, { onSuccess: () => setMode(null) });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone={STATE_TONE[room.state]}>{room.state}</Badge>
        <span className="text-sm text-muted">
          Block {block.name}, floor {room.floor}, {block.gender === "Male" ? "boys" : "girls"} block
        </span>
      </div>

      {room.state === "Occupied" && room.student && (
        <p className="text-sm">
          <span className="text-muted">Student: </span>
          {room.student.name} ({room.student.rollNumber})
        </p>
      )}
      {room.state === "Staff" && room.staffOccupant && (
        <p className="text-sm">
          <span className="text-muted">Staff: </span>
          {room.staffOccupant.name}
          {room.staffOccupant.designation ? `, ${room.staffOccupant.designation}` : ""}
          {room.staffOccupant.phone ? `, ${room.staffOccupant.phone}` : ""}
        </p>
      )}
      {room.state === "Blocked" && (
        <p className="text-sm">
          <span className="text-muted">Reason: </span>
          {room.blockedReason}
          {room.blockedAt ? ` (since ${fmt(room.blockedAt)})` : ""}
        </p>
      )}

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          {room.state === "Vacant" && (
            <>
              <Button onClick={() => open("allocate")}>Allocate student</Button>
              <Button variant="secondary" onClick={() => open("staff")}>
                Assign staff
              </Button>
              <Button variant="secondary" onClick={() => open("block")}>
                Block room
              </Button>
            </>
          )}
          {room.state === "Occupied" && (
            <>
              <Button onClick={() => open("transfer")}>Transfer</Button>
              <Button variant="secondary" onClick={() => open("vacate")}>
                Vacate
              </Button>
            </>
          )}
          {room.state === "Blocked" && <Button onClick={() => run({ type: "unblock" })} disabled={act.isPending}>Unblock room</Button>}
          {room.state === "Staff" && (
            <Button variant="secondary" onClick={() => run({ type: "removeStaff" })} disabled={act.isPending}>
              Remove staff occupant
            </Button>
          )}
        </div>
      )}

      {mode === "allocate" && <AllocateForm block={block} pending={act.isPending} onCancel={() => open(null)} onSubmit={(studentId) => run({ type: "allocate", studentId })} />}
      {mode === "vacate" && (
        <div className="space-y-3 rounded-md border border-border bg-surface p-3 text-sm">
          <p>Move {room.student?.name} out of this room? The room becomes vacant.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => open(null)}>Cancel</Button>
            <Button variant="danger" disabled={act.isPending} onClick={() => run({ type: "vacate" })}>Confirm vacate</Button>
          </div>
        </div>
      )}
      {mode === "transfer" && <TransferForm room={room} block={block} blocks={blocks} pending={act.isPending} onCancel={() => open(null)} onSubmit={(targetRoomId) => run({ type: "transfer", targetRoomId })} />}
      {mode === "block" && <BlockForm pending={act.isPending} onCancel={() => open(null)} onSubmit={(reason) => run({ type: "block", reason })} />}
      {mode === "staff" && <StaffForm pending={act.isPending} onCancel={() => open(null)} onSubmit={(v) => run({ type: "assignStaff", ...v })} />}

      {act.error && (
        <p role="alert" className="text-sm text-danger">
          {act.error.message}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold">History</h3>
        {history.isLoading && <p className="text-sm text-muted">Loading…</p>}
        {history.data?.length === 0 && <p className="text-sm text-muted">No history yet.</p>}
        <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
          {history.data?.map((h) => (
            <li key={h.id} className="border-b border-border pb-2 last:border-0">
              <span className="font-medium">{EVENT_LABEL[h.event]}</span>
              {(h.studentName || h.staffName) && <span>: {h.studentName ?? h.staffName}</span>}
              {(h.reason || h.note) && <span className="text-muted"> ({h.reason ?? h.note})</span>}
              <div className="text-xs text-muted">
                {fmt(h.createdAt)}
                {h.actor ? ` by ${h.actor}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Actions({ pending, label, onCancel, disabled }: { pending: boolean; label: string; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={pending || disabled}>{pending ? "Saving…" : label}</Button>
    </div>
  );
}

function AllocateForm({ block, pending, onCancel, onSubmit }: { block: BlockDTO; pending: boolean; onCancel: () => void; onSubmit: (studentId: string) => void }) {
  const students = useStudents({ unallocated: true, gender: block.gender });
  const [studentId, setStudentId] = useState("");
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(studentId);
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Student without a room</span>
        <select required value={studentId} onChange={(e) => setStudentId(e.target.value)} className={fieldClass}>
          <option value="">Choose a student</option>
          {students.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.rollNumber})
            </option>
          ))}
        </select>
      </label>
      {students.data?.length === 0 && (
        <p className="text-sm text-muted">No unallocated {block.gender === "Male" ? "male" : "female"} students. Add one on the Students page first.</p>
      )}
      <Actions pending={pending} label="Allocate" onCancel={onCancel} disabled={!studentId} />
    </form>
  );
}

function TransferForm({ room, block, blocks, pending, onCancel, onSubmit }: { room: RoomDTO; block: BlockDTO; blocks: BlockDTO[]; pending: boolean; onCancel: () => void; onSubmit: (roomId: string) => void }) {
  const sameGender = blocks.filter((b) => b.gender === block.gender);
  const [targetBlockId, setTargetBlockId] = useState(block.id);
  const [targetRoomId, setTargetRoomId] = useState("");
  const rooms = useRooms(targetBlockId);
  const vacant = rooms.data?.filter((r) => r.state === "Vacant" && r.id !== room.id) ?? [];
  const targetBlock = sameGender.find((b) => b.id === targetBlockId);

  return (
    <form
      className="space-y-3 rounded-md border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(targetRoomId);
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Block</span>
        <select
          value={targetBlockId}
          onChange={(e) => {
            setTargetBlockId(e.target.value);
            setTargetRoomId("");
          }}
          className={fieldClass}
        >
          {sameGender.map((b) => (
            <option key={b.id} value={b.id}>
              Block {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Vacant room</span>
        <select required value={targetRoomId} onChange={(e) => setTargetRoomId(e.target.value)} className={fieldClass}>
          <option value="">Choose a room</option>
          {vacant.map((r) => (
            <option key={r.id} value={r.id}>
              {targetBlock?.name}-{r.roomNumber}
            </option>
          ))}
        </select>
      </label>
      {rooms.data && vacant.length === 0 && <p className="text-sm text-muted">No vacant rooms in this block.</p>}
      <Actions pending={pending} label="Transfer" onCancel={onCancel} disabled={!targetRoomId} />
    </form>
  );
}

function BlockForm({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(reason);
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Why is this room being blocked?</span>
        <textarea required minLength={3} maxLength={300} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass} />
      </label>
      <Actions pending={pending} label="Block room" onCancel={onCancel} />
    </form>
  );
}

function StaffForm({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: (v: { name: string; designation?: string; phone?: string }) => void }) {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <form
      className="space-y-3 rounded-md border border-border bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, designation: designation || undefined, phone: phone || undefined });
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Name</span>
        <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Designation (optional)</span>
        <input value={designation} onChange={(e) => setDesignation(e.target.value)} className={fieldClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Phone (optional)</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} />
      </label>
      <Actions pending={pending} label="Assign staff" onCancel={onCancel} />
    </form>
  );
}
