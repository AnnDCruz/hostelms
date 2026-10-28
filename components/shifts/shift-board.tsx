"use client";

import { useEffect, useState } from "react";
import { useShiftMutations, useShifts } from "@/hooks/use-shifts";
import { cn } from "@/lib/utils";
import type { GuardShiftsDTO, ManagerShiftsDTO, ShiftDTO } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { STATUS_META, fmtDate, fmtDateTime, fmtDuration, fmtRunning, fmtTime, toLocalInput } from "./format";

type BoardRole = "Security" | "Warden" | "ChiefWarden";

// Re-renders every second so the running clock ticks. The server is only asked every 30 seconds.
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function ShiftBoard({ role }: { role: BoardRole }) {
  return role === "Security" ? <GuardView /> : <ManagerView />;
}

// ─────────────────────────────────────────────
// Guard
// ─────────────────────────────────────────────

function GuardView() {
  const { data, isLoading, error } = useShifts();
  const m = useShiftMutations();
  const now = useNow();
  const [blockId, setBlockId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ShiftDTO | null>(null);

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error) return <p role="alert" className="text-sm text-danger">{error.message}</p>;
  if (!data || data.view !== "guard") return null;

  const guard: GuardShiftsDTO & { clockOffsetMs: number } = data;
  const serverNow = now + guard.clockOffsetMs;
  const current = guard.current;
  const chosen = guard.blocks.find((b) => b.id === blockId) ?? guard.blocks[0] ?? null;
  const flagged = guard.history.filter((s) => s.status === "NeedsReview").length;
  const busy = m.start.isPending || m.end.isPending;
  const actionError = m.start.error ?? m.end.error;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Your shift</CardTitle>
          <Badge tone={current ? "accent" : "neutral"}>{current ? "On shift" : "Off shift"}</Badge>
        </CardHeader>
        <CardBody className="space-y-4">
          {current ? (
            <>
              <div className="space-y-1">
                <p className="text-3xl font-semibold tabular-nums" aria-label="Time on shift">{fmtRunning(serverNow - new Date(current.shiftIn).getTime())}</p>
                <p className="text-sm text-muted">
                  Block {current.blockName}, started {fmtDateTime(current.shiftIn)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={busy} onClick={() => m.end.mutate()}>
                  {m.end.isPending ? "Ending…" : "End shift"}
                </Button>
                <p className="text-xs text-muted">Signing out also ends your shift. A shift left open for more than {guard.maxShiftHours} hours is flagged for your warden.</p>
              </div>
            </>
          ) : guard.blocks.length === 0 ? (
            <p className="text-sm text-muted">You are not assigned to a block yet. Ask the chief warden to assign you.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              {guard.blocks.length > 1 && (
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Block</span>
                  <select className={cn(fieldClass, "w-40")} value={chosen?.id ?? ""} onChange={(e) => setBlockId(e.target.value)}>
                    {guard.blocks.map((b) => (
                      <option key={b.id} value={b.id}>Block {b.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <Button disabled={busy || !chosen} onClick={() => chosen && m.start.mutate(chosen.id)}>
                {m.start.isPending ? "Starting…" : `Start shift${chosen && guard.blocks.length === 1 ? ` in Block ${chosen.name}` : ""}`}
              </Button>
            </div>
          )}
          {actionError && <p role="alert" className="text-sm text-danger">{actionError.message}</p>}
          {flagged > 0 && (
            <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted">
              {flagged === 1 ? "A previous shift was" : `${flagged} previous shifts were`} flagged because it was not ended. Your warden will set the end time.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift history</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <ShiftTable shifts={guard.history} showGuard={false} showBlock={guard.blocks.length > 1} serverNow={serverNow} onOpen={setSelected} empty="No shifts yet. Your shifts will be listed here." />
        </CardBody>
      </Card>

      {selected && <ShiftPopover shift={guard.history.find((s) => s.id === selected.id) ?? selected} serverNow={serverNow} canResolve={false} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Warden and chief warden
// ─────────────────────────────────────────────

function ManagerView() {
  const [blockId, setBlockId] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const { data, isLoading, error } = useShifts({ blockId: blockId || undefined, review: reviewOnly });
  const now = useNow();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error) return <p role="alert" className="text-sm text-danger">{error.message}</p>;
  if (!data || data.view !== "manager") return null;

  const mgr: ManagerShiftsDTO & { clockOffsetMs: number } = data;
  const serverNow = now + mgr.clockOffsetMs;
  const selected = mgr.shifts.find((s) => s.id === selectedId) ?? mgr.onShift.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {mgr.needsReview > 0 && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <span>
            <strong>{mgr.needsReview}</strong> {mgr.needsReview === 1 ? "shift was" : "shifts were"} not ended by the guard and need an end time.
          </span>
          {!reviewOnly && <Button variant="secondary" onClick={() => setReviewOnly(true)}>Show them</Button>}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>On shift now</CardTitle>
          <span className="text-xs text-muted">{mgr.onShift.length} {mgr.onShift.length === 1 ? "guard" : "guards"}</span>
        </CardHeader>
        <CardBody>
          {mgr.onShift.length === 0 ? (
            <p className="text-sm text-muted">No guard is on shift in your blocks right now.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {mgr.onShift.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span>
                      <span className="block font-medium">{s.guardName}</span>
                      <span className="block text-xs text-muted">Block {s.blockName}, since {fmtTime(s.shiftIn)}</span>
                    </span>
                    <span className="text-sm tabular-nums text-muted">{fmtRunning(serverNow - new Date(s.shiftIn).getTime())}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shift history</CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {mgr.blocks.length > 1 && (
              <select aria-label="Block" className={cn(fieldClass, "w-36")} value={blockId} onChange={(e) => setBlockId(e.target.value)}>
                <option value="">All blocks</option>
                {mgr.blocks.map((b) => (
                  <option key={b.id} value={b.id}>Block {b.name}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
              Needs review only
            </label>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <ShiftTable
            shifts={mgr.shifts}
            showGuard
            showBlock={mgr.blocks.length > 1}
            serverNow={serverNow}
            onOpen={(s) => setSelectedId(s.id)}
            empty={reviewOnly ? "Nothing needs review." : "No shifts recorded yet."}
          />
        </CardBody>
      </Card>

      {selected && <ManagerPopover key={selected.id} shift={selected} serverNow={serverNow} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function ManagerPopover({ shift, serverNow, onClose }: { shift: ShiftDTO; serverNow: number; onClose: () => void }) {
  return <ShiftPopover shift={shift} serverNow={serverNow} canResolve onClose={onClose} />;
}

// ─────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────

function ShiftTable({
  shifts,
  showGuard,
  showBlock,
  serverNow,
  onOpen,
  empty,
}: {
  shifts: ShiftDTO[];
  showGuard: boolean;
  showBlock: boolean;
  serverNow: number;
  onOpen: (s: ShiftDTO) => void;
  empty: string;
}) {
  if (shifts.length === 0) return <p className="px-4 py-6 text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-surface text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Date</th>
            {showGuard && <th className="px-4 py-2 font-medium">Guard</th>}
            {showBlock && <th className="px-4 py-2 font-medium">Block</th>}
            <th className="px-4 py-2 font-medium">In</th>
            <th className="px-4 py-2 font-medium">Out</th>
            <th className="px-4 py-2 font-medium">Duration</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => {
            const meta = STATUS_META[s.status];
            const duration =
              s.durationMinutes !== null ? fmtDuration(s.durationMinutes) : s.status === "Active" ? fmtDuration(Math.max(0, Math.floor((serverNow - new Date(s.shiftIn).getTime()) / 60_000))) : "Unknown";
            return (
              <tr key={s.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface" onClick={() => onOpen(s)}>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    className="text-left font-medium focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(s);
                    }}
                  >
                    {fmtDate(s.shiftIn)}
                  </button>
                </td>
                {showGuard && <td className="px-4 py-2">{s.guardName}</td>}
                {showBlock && <td className="px-4 py-2">{s.blockName}</td>}
                <td className="px-4 py-2 tabular-nums">{fmtTime(s.shiftIn)}</td>
                <td className="px-4 py-2 tabular-nums">{s.shiftOut ? fmtTime(s.shiftOut) : "—"}</td>
                <td className="px-4 py-2 tabular-nums">{duration}</td>
                <td className="px-4 py-2"><Badge tone={meta.tone}>{meta.label}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ShiftPopover({ shift, serverNow, canResolve, onClose }: { shift: ShiftDTO; serverNow: number; canResolve: boolean; onClose: () => void }) {
  const { resolve } = useShiftMutations();
  const meta = STATUS_META[shift.status];
  // Defaults to now, which is right when the warden is resolving it straight away. Typed values are kept as typed.
  const [value, setValue] = useState(() => toLocalInput(new Date()));

  const out = value ? new Date(value) : null;
  const outOk = !!out && !Number.isNaN(out.getTime());
  const afterStart = outOk && out.getTime() > new Date(shift.shiftIn).getTime();
  const notFuture = outOk && out.getTime() <= serverNow + 60_000;
  const valid = afterStart && notFuture;
  const running = shift.status === "Active" ? Math.max(0, Math.floor((serverNow - new Date(shift.shiftIn).getTime()) / 60_000)) : null;

  return (
    <Popover open onOpenChange={(o) => !o && onClose()} title={`${shift.guardName}, Block ${shift.blockName}`}>
      <div className="space-y-4">
        <dl className="space-y-2 text-sm">
          <Row label="Status" value={<Badge tone={meta.tone}>{meta.label}</Badge>} />
          <Row label="Shift in" value={fmtDateTime(shift.shiftIn)} />
          <Row label="Shift out" value={shift.shiftOut ? fmtDateTime(shift.shiftOut) : "Not recorded"} />
          <Row label="Duration" value={shift.durationMinutes !== null ? fmtDuration(shift.durationMinutes) : running !== null ? `${fmtDuration(running)} so far` : "Unknown"} />
          {shift.flag && <Row label="Flag" value="Guard did not end the shift" />}
        </dl>

        {shift.status === "NeedsReview" && !canResolve && (
          <p className="text-sm text-muted">Your warden will set the time this shift ended.</p>
        )}

        {shift.status === "NeedsReview" && canResolve && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && out) resolve.mutate({ id: shift.id, shiftOut: out.toISOString() }, { onSuccess: onClose });
            }}
          >
            <label className="block space-y-1 text-sm">
              <span className="font-medium">When did this shift end?</span>
              <input type="datetime-local" className={fieldClass} value={value} min={toLocalInput(new Date(shift.shiftIn))} onChange={(e) => setValue(e.target.value)} />
            </label>
            {value && !valid && (
              <p className="text-xs text-danger">{!afterStart ? "The end time must be after the shift started." : "The end time cannot be in the future."}</p>
            )}
            {resolve.error && <p role="alert" className="text-sm text-danger">{resolve.error.message}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Close</Button>
              <Button type="submit" disabled={!valid || resolve.isPending}>{resolve.isPending ? "Saving…" : "Set end time"}</Button>
            </div>
          </form>
        )}

        {!(shift.status === "NeedsReview" && canResolve) && (
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </Popover>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
