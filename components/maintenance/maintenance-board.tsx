"use client";

import { useState } from "react";
import { useSelection } from "@/hooks/use-selection";
import type { MaintenanceStatus } from "@prisma/client";
import { useCreateMaintenance, useMaintenance, useMaintenanceAction } from "@/hooks/use-maintenance";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { MaintenanceStatusBadge } from "./status-badge";

type BoardRole = "Student" | "Warden" | "ChiefWarden" | "Security" | "Facilities";
type Filter = "All" | MaintenanceStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "All", label: "All" },
  { key: "Pending", label: "Pending" },
  { key: "InProgress", label: "In progress" },
  { key: "Resolved", label: "Resolved" },
];

const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export function MaintenanceBoard({ role }: { role: BoardRole }) {
  const { data, isLoading, error } = useMaintenance();
  const act = useMaintenanceAction();
  const create = useCreateMaintenance();
  const [filter, setFilter] = useState<Filter>("All");
  const { selectedId, select: setSelectedId, close } = useSelection();
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState("");

  const rows = (data ?? []).filter((r) => filter === "All" || r.status === filter);
  const selected = data?.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{role === "Student" ? "Your maintenance requests" : "Maintenance requests"}</CardTitle>
          {role === "Student" && (
            <Button
              onClick={() => {
                create.reset();
                setDescription("");
                setCreating(true);
              }}
            >
              New request
            </Button>
          )}
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm",
                  filter === f.key ? "border-accent bg-accent/10 font-medium text-accent" : "border-border text-muted hover:bg-surface",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {isLoading && <p className="text-sm text-muted">Loading…</p>}
          {error && <p role="alert" className="text-sm text-danger">{error.message}</p>}
          {act.error && !selected && <p role="alert" className="text-sm text-danger">{act.error.message}</p>}
          {data && rows.length === 0 && <p className="text-sm text-muted">No requests to show.</p>}
        </CardBody>
        {rows.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-y border-border bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Problem</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Room</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Raised</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {(role === "Facilities" || role === "Student") && <th className="px-4 py-2 text-right font-medium">Action</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="max-w-xs px-4 py-2">
                    <button
                      type="button"
                      className="block w-full truncate text-left font-medium focus-visible:outline-2 focus-visible:outline-accent"
                      onClick={() => {
                        act.reset();
                        setSelectedId(r.id);
                      }}
                    >
                      {r.description}
                    </button>
                    {role !== "Student" && <div className="text-xs text-muted">{r.student.name}</div>}
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">
                    {r.block.name}-{r.room.roomNumber}
                  </td>
                  <td className="hidden px-4 py-2 md:table-cell">{fmt(r.createdAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <MaintenanceStatusBadge status={r.status} />
                      {r.reopenCount > 0 && <Badge tone="danger">Reopened {r.reopenCount}x</Badge>}
                    </div>
                  </td>
                  {(role === "Facilities" || role === "Student") && (
                    <td className="px-4 py-2 text-right">
                      {role === "Facilities" && r.status === "Pending" && (
                        <Button className="h-8 px-2" disabled={act.isPending} aria-label={`Start work: ${r.description}`} onClick={() => { act.reset(); act.mutate({ id: r.id, action: "start" }); }}>
                          Start work
                        </Button>
                      )}
                      {role === "Facilities" && r.status === "InProgress" && (
                        <Button className="h-8 px-2" disabled={act.isPending} aria-label={`Mark resolved: ${r.description}`} onClick={() => { act.reset(); act.mutate({ id: r.id, action: "resolve" }); }}>
                          Mark resolved
                        </Button>
                      )}
                      {role === "Student" && r.status === "Resolved" && (
                        <Button variant="secondary" className="h-8 px-2" disabled={act.isPending} aria-label={`Reopen: ${r.description}`} onClick={() => { act.reset(); act.mutate({ id: r.id, action: "reopen" }); }}>
                          Reopen
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Popover open={creating} onOpenChange={setCreating} title="New maintenance request" description="Facilities staff are notified straight away.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ description }, { onSuccess: () => setCreating(false) });
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="font-medium">What needs fixing?</span>
            <textarea required minLength={5} maxLength={500} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
          </label>
          {create.error && <p role="alert" className="text-sm text-danger">{create.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Sending…" : "Send request"}</Button>
          </div>
        </form>
      </Popover>

      {selected && (
        <Popover open onOpenChange={(o) => !o && close()} title={`Request in ${selected.block.name}-${selected.room.roomNumber}`}>
          <div className="space-y-4">
            <p className="text-sm">{selected.description}</p>
            <dl className="space-y-2 text-sm">
              <Row label="Status" value={<MaintenanceStatusBadge status={selected.status} />} />
              <Row label="Raised by" value={`${selected.student.name} (${selected.student.rollNumber})`} />
              <Row label="Raised" value={fmt(selected.createdAt)} />
              {selected.inProgressAt && <Row label="Work started" value={fmt(selected.inProgressAt)} />}
              {selected.resolvedAt && <Row label="Resolved" value={fmt(selected.resolvedAt)} />}
              {selected.reopenCount > 0 && (
                <Row label="Reopened" value={`${selected.reopenCount} time${selected.reopenCount === 1 ? "" : "s"}${selected.lastReopenAt ? `, last ${fmt(selected.lastReopenAt)}` : ""}`} />
              )}
            </dl>
            {act.error && <p role="alert" className="text-sm text-danger">{act.error.message}</p>}
            <div className="flex justify-end gap-2">
              {role === "Facilities" && selected.status === "Pending" && (
                <Button disabled={act.isPending} onClick={() => act.mutate({ id: selected.id, action: "start" })}>Start work</Button>
              )}
              {role === "Facilities" && selected.status === "InProgress" && (
                <Button disabled={act.isPending} onClick={() => act.mutate({ id: selected.id, action: "resolve" })}>Mark resolved</Button>
              )}
              {role === "Student" && selected.status === "Resolved" && (
                <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ id: selected.id, action: "reopen" })}>
                  Problem is back: reopen
                </Button>
              )}
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
