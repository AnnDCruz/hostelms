"use client";

import { useEffect, useState } from "react";
import { useLaundry, useLaundryMutations } from "@/hooks/use-laundry";
import { cn } from "@/lib/utils";
import type { LaundryRoomDTO, MachineDTO } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { MAX_DURATION, MAX_MACHINES_PER_TYPE, MIN_DURATION } from "@/lib/validators/laundry";
import { FEED_LABELS, describeMachine, formatClock } from "./machine-status";

type BoardRole = "Student" | "Warden" | "ChiefWarden";

const PRESETS = [15, 30, 45, 60];
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Re-renders every second so countdowns tick. The server is only asked every few seconds (see use-laundry).
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function LaundryBoard({ role }: { role: BoardRole }) {
  const { data, isLoading, error } = useLaundry();
  const m = useLaundryMutations();
  const now = useNow();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);

  const isManager = role !== "Student";
  const rooms = data?.rooms ?? [];
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0] ?? null;
  const serverNow = now + (data?.clockOffsetMs ?? 0);
  const selected = room?.machines.find((x) => x.id === selectedId) ?? null;

  const resetErrors = () => [m.start, m.restart, m.empty, m.maintenance, m.config].forEach((x) => x.reset());
  const open = (id: string) => {
    resetErrors();
    setSelectedId(id);
  };

  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error) return <p role="alert" className="text-sm text-danger">{error.message}</p>;

  if (!room) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardBody>
          <p className="text-sm text-muted">
            {isManager
              ? "No laundry room is linked to the blocks you manage yet."
              : "You need an allocated room before you can use the laundry. Ask your warden."}
          </p>
        </CardBody>
      </Card>
    );
  }

  const washers = room.machines.filter((x) => x.type === "Washer");
  const dryers = room.machines.filter((x) => x.type === "Dryer");
  const mine = room.machines.filter((x) => x.session?.isMine);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {(rooms.length > 1 || isManager) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Laundry room">
            {rooms.length > 1 &&
              rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={r.id === room.id}
                  onClick={() => setRoomId(r.id)}
                  className={cn(
                    "rounded-md border px-3 py-1 text-sm",
                    r.id === room.id ? "border-accent bg-accent/10 font-medium text-accent" : "border-border text-muted hover:bg-surface",
                  )}
                >
                  {r.name}
                </button>
              ))}
          </div>
          {isManager && (
            <Button
              variant="secondary"
              onClick={() => {
                resetErrors();
                setConfiguring(true);
              }}
            >
              Set machine count
            </Button>
          )}
        </div>
      )}

      {mine.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your laundry</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-2 sm:grid-cols-2">
            {mine.map((x) => {
              const d = describeMachine(x, serverNow);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => open(x.id)}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="font-medium">{x.label}</span>
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-muted tabular-nums">{d.timer}</span>
                    <Badge tone={d.tone}>{d.label}</Badge>
                  </span>
                </button>
              );
            })}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <MachineGroup title="Washers" machines={washers} serverNow={serverNow} onOpen={open} />
          <MachineGroup title="Dryers" machines={dryers} serverNow={serverNow} onOpen={open} />
        </div>
        <FeedCard room={room} />
      </div>

      {selected && (
        <MachinePopover
          key={selected.id}
          machine={selected}
          serverNow={serverNow}
          onClose={() => setSelectedId(null)}
          mutations={m}
        />
      )}

      {configuring && <ConfigPopover key={room.id} room={room} onClose={() => setConfiguring(false)} mutations={m} />}
    </div>
  );
}

function MachineGroup({ title, machines, serverNow, onOpen }: { title: string; machines: MachineDTO[]; serverNow: number; onOpen: (id: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <span className="text-xs text-muted">{machines.filter((x) => x.state === "Free").length} free of {machines.length}</span>
      </CardHeader>
      <CardBody>
        {machines.length === 0 ? (
          <p className="text-sm text-muted">None set up in this laundry room.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {machines.map((x) => {
              const d = describeMachine(x, serverNow);
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(x.id)}
                    aria-label={`${x.label}: ${d.label}. ${d.detail}`}
                    className={cn(
                      "flex h-full w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent",
                      x.session?.isMine ? "border-accent" : "border-border",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{x.label}</span>
                      <Badge tone={d.tone}>{d.label}</Badge>
                    </span>
                    <span className="text-sm text-muted tabular-nums">{d.detail}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function FeedCard({ room }: { room: LaundryRoomDTO }) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Laundry feed</CardTitle>
      </CardHeader>
      <CardBody>
        {room.feed.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. Updates appear here as machines are used.</p>
        ) : (
          <ul className="max-h-[32rem] space-y-3 overflow-y-auto" aria-live="polite">
            {room.feed.map((f) => {
              const meta = FEED_LABELS[f.messageType];
              return (
                <li key={f.id} className="space-y-1 border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <time dateTime={f.createdAt} className="text-xs text-muted">{fmtTime(f.createdAt)}</time>
                  </div>
                  <p>{f.message}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

type Mutations = ReturnType<typeof useLaundryMutations>;

function MachinePopover({ machine, serverNow, onClose, mutations }: { machine: MachineDTO; serverNow: number; onClose: () => void; mutations: Mutations }) {
  const [duration, setDuration] = useState(30);
  const d = describeMachine(machine, serverNow);
  const s = machine.session;
  const a = machine.actions;
  const busy = mutations.start.isPending || mutations.restart.isPending || mutations.empty.isPending || mutations.maintenance.isPending;
  const error = mutations.start.error ?? mutations.restart.error ?? mutations.empty.error ?? mutations.maintenance.error;
  const durationOk = Number.isInteger(duration) && duration >= MIN_DURATION && duration <= MAX_DURATION;
  const done = { onSuccess: onClose };
  const isOwner = !!s?.isMine;

  return (
    <Popover open onOpenChange={(o) => !o && onClose()} title={machine.label}>
      <div className="space-y-4">
        <dl className="space-y-2 text-sm">
          <Row label="Status" value={<Badge tone={d.tone}>{d.label}</Badge>} />
          {s && <Row label="Clothes belong to" value={isOwner ? "You" : s.ownerName} />}
          {s && <Row label="Cycle" value={`${s.durationMinutes} min, ${fmtTime(s.startedAt)} to ${fmtTime(s.endsAt)}`} />}
          {s && machine.state === "InUse" && <Row label="Time left" value={<span className="tabular-nums">{formatClock(new Date(s.endsAt).getTime() - serverNow)}</span>} />}
          {s && machine.state === "GracePeriod" && s.gracePeriodEndsAt && new Date(s.gracePeriodEndsAt).getTime() > serverNow && (
            <Row label="Collect within" value={<span className="tabular-nums">{formatClock(new Date(s.gracePeriodEndsAt).getTime() - serverNow)}</span>} />
          )}
          {s?.isRestartedByOther && s.restartedByName && <Row label="Restarted by" value={s.restartedByName} />}
        </dl>

        {machine.state === "GracePeriod" && s && !isOwner && !a.empty && (
          <p className="text-sm text-muted">
            {s.ownerName} is still within their time to collect. You can move these clothes only after that, when the feed asks for it.
          </p>
        )}

        {(a.start || a.restart) && (
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{a.start ? "How many minutes?" : isOwner ? "Run again for how many minutes?" : `Restart ${s?.ownerName}'s clothes for how many minutes?`}</span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={MIN_DURATION}
                max={MAX_DURATION}
                step={1}
                value={Number.isNaN(duration) ? "" : duration}
                onChange={(e) => setDuration(e.target.value === "" ? Number.NaN : Number(e.target.value))}
                className={cn(fieldClass, "w-24")}
                aria-label="Minutes"
              />
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={duration === p}
                  onClick={() => setDuration(p)}
                  className={cn("rounded-md border px-2 py-1 text-xs", duration === p ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-surface")}
                >
                  {p} min
                </button>
              ))}
            </div>
            {!durationOk && <span className="block text-xs text-danger">Choose between {MIN_DURATION} and {MAX_DURATION} minutes.</span>}
          </label>
        )}

        {machine.state === "Free" && !a.start && !a.maintenance && (
          <p className="text-sm text-muted">You already have a {machine.type.toLowerCase()} running. Collect your clothes from it first.</p>
        )}

        {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          {a.maintenance === "on" && (
            <Button variant="secondary" disabled={busy} onClick={() => mutations.maintenance.mutate({ id: machine.id, maintenance: true }, done)}>
              Take out of service
            </Button>
          )}
          {a.maintenance === "off" && (
            <Button disabled={busy} onClick={() => mutations.maintenance.mutate({ id: machine.id, maintenance: false }, done)}>
              Return to service
            </Button>
          )}
          {a.empty && (
            <Button variant={a.restart ? "secondary" : "primary"} disabled={busy} onClick={() => mutations.empty.mutate({ id: machine.id }, done)}>
              {isOwner ? (machine.state === "InUse" ? "Stop and collect clothes" : "I collected my clothes") : "I moved the clothes out"}
            </Button>
          )}
          {a.restart && (
            <Button disabled={busy || !durationOk} onClick={() => mutations.restart.mutate({ id: machine.id, durationMinutes: duration }, done)}>
              Restart dryer
            </Button>
          )}
          {a.start && (
            <Button disabled={busy || !durationOk} onClick={() => mutations.start.mutate({ id: machine.id, durationMinutes: duration }, done)}>
              {mutations.start.isPending ? "Starting…" : `Start ${machine.label}`}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Popover>
  );
}

function ConfigPopover({ room, onClose, mutations }: { room: LaundryRoomDTO; onClose: () => void; mutations: Mutations }) {
  const [washers, setWashers] = useState(room.machines.filter((x) => x.type === "Washer").length);
  const [dryers, setDryers] = useState(room.machines.filter((x) => x.type === "Dryer").length);
  const valid = [washers, dryers].every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_MACHINES_PER_TYPE);

  return (
    <Popover
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Machines in ${room.name}`}
      description="Adding creates new machines. Removing retires idle ones; machines in use are never removed."
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutations.config.mutate({ roomId: room.id, washers, dryers }, { onSuccess: onClose });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <CountField label="Washers" value={washers} onChange={setWashers} />
          <CountField label="Dryers" value={dryers} onChange={setDryers} />
        </div>
        {!valid && <p className="text-xs text-danger">Enter a whole number from 0 to {MAX_MACHINES_PER_TYPE}.</p>}
        {mutations.config.error && <p role="alert" className="text-sm text-danger">{mutations.config.error.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!valid || mutations.config.isPending}>{mutations.config.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Popover>
  );
}

function CountField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_MACHINES_PER_TYPE}
        step={1}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
        className={fieldClass}
      />
    </label>
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
