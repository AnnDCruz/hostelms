"use client";

import { useState } from "react";
import { useSelection } from "@/hooks/use-selection";
import { useGatepassAction, useGatepasses } from "@/hooks/use-gatepass";
import type { GatepassDTO } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover } from "@/components/ui/popover";
import { StatusBadge } from "./status-badge";
import { GatepassForm } from "./gatepass-form";

type BoardRole = "Student" | "Parent" | "Warden" | "ChiefWarden";

const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function canAct(role: BoardRole, g: GatepassDTO) {
  return (role === "Parent" && g.status === "Request") || (role === "Warden" && g.status === "ParentApproval");
}

// The return time has passed: it can still be rejected, but no longer approved.
const isExpired = (g: GatepassDTO) => new Date(g.expectedReturnTime).getTime() < Date.now();

export function GatepassBoard({ role }: { role: BoardRole }) {
  const { data, isLoading, error } = useGatepasses();
  const act = useGatepassAction();
  const { selectedId, select: setSelectedId, close } = useSelection();
  const [creating, setCreating] = useState(false);

  const selected = data?.find((g) => g.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{role === "Student" ? "Your gate passes" : "Gate passes"}</CardTitle>
          {role === "Student" && <Button onClick={() => setCreating(true)}>New request</Button>}
        </CardHeader>
        <CardBody className="p-0">
          {isLoading && <p className="p-4 text-sm text-muted">Loading…</p>}
          {error && (
            <p role="alert" className="p-4 text-sm text-danger">
              {error.message}
            </p>
          )}
          {data && data.length === 0 && (
            <p className="p-4 text-sm text-muted">
              {role === "Student" ? "No gate passes yet. Use New request to ask for one." : "No gate passes to show."}
            </p>
          )}
          {data && data.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-4 py-2 font-medium">Leaving</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Back by</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((g) => (
                  <tr
                    key={g.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface"
                    onClick={() => setSelectedId(g.id)}
                  >
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        className="text-left font-medium focus-visible:outline-2 focus-visible:outline-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(g.id);
                        }}
                      >
                        {g.student.name}
                      </button>
                      <div className="text-xs text-muted">
                        {g.student.rollNumber} · Block {g.block.name}
                      </div>
                    </td>
                    <td className="px-4 py-2">{fmt(g.departureTime)}</td>
                    <td className="hidden px-4 py-2 sm:table-cell">{fmt(g.expectedReturnTime)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={g.status} expired={isExpired(g)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Popover open={creating} onOpenChange={setCreating} title="New gate pass request" description="Your parent approves first, then your warden.">
        <GatepassForm onDone={() => setCreating(false)} />
      </Popover>

      {selected && (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) {
              close();
              act.reset();
            }
          }}
          title={`Gate pass: ${selected.student.name}`}
        >
          <dl className="space-y-2 text-sm">
            <Row label="Status" value={<StatusBadge status={selected.status} expired={isExpired(selected)} />} />
            <Row label="Room" value={selected.student.room ? `${selected.block.name}-${selected.student.room.roomNumber}` : "Not allocated"} />
            <Row label="Leaving" value={fmt(selected.departureTime)} />
            <Row label="Back by" value={fmt(selected.expectedReturnTime)} />
            <Row label="Reason" value={selected.reason} />
            {selected.parentApprovedAt && <Row label="Parent approved" value={fmt(selected.parentApprovedAt)} />}
            {selected.wardenApprovedAt && <Row label="Warden approved" value={fmt(selected.wardenApprovedAt)} />}
          </dl>

          {act.error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {act.error.message}
            </p>
          )}

          {canAct(role, selected) && isExpired(selected) && (
            <p role="status" className="mt-3 text-sm text-warn">
              The return time has passed, so this request can no longer be approved. You can still reject it.
            </p>
          )}

          {canAct(role, selected) && (
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="danger"
                disabled={act.isPending}
                onClick={() => act.mutate({ id: selected.id, action: "reject" }, { onSuccess: () => close() })}
              >
                Reject
              </Button>
              {!isExpired(selected) && (
                <Button
                  disabled={act.isPending}
                  onClick={() => act.mutate({ id: selected.id, action: "approve" }, { onSuccess: () => close() })}
                >
                  Approve
                </Button>
              )}
            </div>
          )}
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
