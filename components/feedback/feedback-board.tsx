"use client";

import { useState } from "react";
import { useSelection } from "@/hooks/use-selection";
import type { FeedbackStatus } from "@prisma/client";
import { useFeedbackAction, useFeedbackList, useSubmitFeedback } from "@/hooks/use-feedback";
import type { FeedbackDTO } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { FeedbackStatusBadge } from "./status-badge";

type BoardRole = "Student" | "Parent" | "Warden" | "ChiefWarden";
type Filter = "All" | FeedbackStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "All", label: "All" },
  { key: "Submitted", label: "Submitted" },
  { key: "Acknowledged", label: "Acknowledged" },
  { key: "InReview", label: "In review" },
  { key: "Escalated", label: "Escalated" },
  { key: "Resolved", label: "Resolved" },
];

const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export function FeedbackBoard({ role }: { role: BoardRole }) {
  const { data, isLoading, error } = useFeedbackList();
  const submit = useSubmitFeedback();
  const act = useFeedbackAction();
  const [filter, setFilter] = useState<Filter>("All");
  const { selectedId, select: setSelectedId, close } = useSelection();
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState("");

  const rows = (data ?? []).filter((f) => filter === "All" || f.status === filter);
  const selected = data?.find((f) => f.id === selectedId) ?? null;
  const staff = role === "Warden" || role === "ChiefWarden";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{staff ? "Feedback" : "Your feedback"}</CardTitle>
          {!staff && (
            <Button
              onClick={() => {
                submit.reset();
                setBody("");
                setWriting(true);
              }}
            >
              Give feedback
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
          {data && rows.length === 0 && <p className="text-sm text-muted">No feedback to show.</p>}
        </CardBody>
        {rows.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-y border-border bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Feedback</th>
                {staff && <th className="hidden px-4 py-2 font-medium sm:table-cell">From</th>}
                <th className="hidden px-4 py-2 font-medium md:table-cell">Submitted</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="max-w-xs px-4 py-2">
                    <button
                      type="button"
                      className="block w-full truncate text-left font-medium focus-visible:outline-2 focus-visible:outline-accent"
                      onClick={() => {
                        act.reset();
                        setEscalating(false);
                        setNote("");
                        setSelectedId(f.id);
                      }}
                    >
                      {f.body}
                    </button>
                    <div className="text-xs text-muted">Block {f.blockName}</div>
                  </td>
                  {staff && <td className="hidden px-4 py-2 sm:table-cell">{f.submittedBy}</td>}
                  <td className="hidden px-4 py-2 md:table-cell">{fmt(f.createdAt)}</td>
                  <td className="px-4 py-2">
                    <FeedbackStatusBadge status={f.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Popover open={writing} onOpenChange={setWriting} title="Give feedback" description="It goes to the warden of your block.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate({ body }, { onSuccess: () => setWriting(false) });
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Your feedback</span>
            <textarea required minLength={5} maxLength={1000} rows={5} value={body} onChange={(e) => setBody(e.target.value)} className={fieldClass} />
          </label>
          {submit.error && <p role="alert" className="text-sm text-danger">{submit.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setWriting(false)}>Cancel</Button>
            <Button type="submit" disabled={submit.isPending}>{submit.isPending ? "Sending…" : "Send feedback"}</Button>
          </div>
        </form>
      </Popover>

      {selected && (
        <Popover open onOpenChange={(o) => !o && close()} title="Feedback">
          <Detail
            f={selected}
            role={role}
            staff={staff}
            pending={act.isPending}
            error={act.error?.message}
            escalating={escalating}
            note={note}
            setNote={setNote}
            setEscalating={setEscalating}
            onAction={(action, n) => act.mutate({ id: selected.id, action, note: n }, { onSuccess: () => setEscalating(false) })}
          />
        </Popover>
      )}
    </div>
  );
}

function Detail({ f, role, staff, pending, error, escalating, note, setNote, setEscalating, onAction }: {
  f: FeedbackDTO; role: BoardRole; staff: boolean; pending: boolean; error?: string; escalating: boolean; note: string;
  setNote: (v: string) => void; setEscalating: (v: boolean) => void;
  onAction: (a: "acknowledge" | "review" | "resolve" | "escalate", note?: string) => void;
}) {
  const steps: { label: string; at: string | null }[] = [
    { label: "Submitted", at: f.createdAt },
    { label: "Acknowledged", at: f.acknowledgedAt },
    { label: "In review", at: f.inReviewAt },
    { label: "Escalated to chief warden", at: f.escalatedAt },
    { label: f.chiefWardenResolvedAt ? "Resolved by chief warden" : "Resolved", at: f.resolvedAt },
  ];
  const warden = role === "Warden";
  const canEscalate = warden && (f.status === "Submitted" || f.status === "Acknowledged" || f.status === "InReview");

  return (
    <div className="space-y-4">
      <p className="whitespace-pre-wrap text-sm">{f.body}</p>
      <dl className="space-y-2 text-sm">
        <Row label="Status" value={<FeedbackStatusBadge status={f.status} />} />
        {staff && <Row label="From" value={f.submittedBy} />}
        <Row label="Block" value={`Block ${f.blockName}`} />
        {f.wardenName && <Row label="Warden" value={f.wardenName} />}
      </dl>

      <ol className="space-y-1 text-sm">
        {steps.filter((s) => s.at).map((s) => (
          <li key={s.label} className="flex justify-between gap-4">
            <span>{s.label}</span>
            <span className="text-muted">{fmt(s.at!)}</span>
          </li>
        ))}
      </ol>

      {staff && f.escalationNote && (
        <p className="rounded-md border border-border bg-surface p-2 text-sm">
          <span className="font-medium">Internal note: </span>
          {f.escalationNote}
        </p>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {warden && !escalating && (
        <div className="flex flex-wrap justify-end gap-2">
          {canEscalate && <Button variant="secondary" disabled={pending} onClick={() => setEscalating(true)}>Escalate</Button>}
          {f.status === "Submitted" && <Button disabled={pending} onClick={() => onAction("acknowledge")}>Acknowledge</Button>}
          {f.status === "Acknowledged" && <Button disabled={pending} onClick={() => onAction("review")}>Start review</Button>}
          {f.status === "InReview" && <Button disabled={pending} onClick={() => onAction("resolve")}>Mark resolved</Button>}
        </div>
      )}
      {warden && escalating && (
        <div className="space-y-2 rounded-md border border-border bg-surface p-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Internal note for the chief warden (optional)</span>
            <textarea maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={fieldClass} />
            <span className="text-xs text-muted">Students and parents cannot see this note.</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEscalating(false)}>Cancel</Button>
            <Button disabled={pending} onClick={() => onAction("escalate", note)}>Escalate to chief warden</Button>
          </div>
        </div>
      )}
      {role === "ChiefWarden" && f.status === "Escalated" && (
        <div className="flex justify-end">
          <Button disabled={pending} onClick={() => onAction("resolve")}>Mark resolved</Button>
        </div>
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
