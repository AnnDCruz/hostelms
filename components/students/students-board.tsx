"use client";

import { useDeferredValue, useState } from "react";
import { useInvite, useStudents } from "@/hooks/use-students";
import type { StudentDTO } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StudentForm } from "./student-form";

const roomLabel = (s: StudentDTO) => (s.room ? `${s.room.block.name}-${s.room.roomNumber}` : null);

export function StudentsBoard() {
  const [search, setSearch] = useState("");
  const [unallocated, setUnallocated] = useState(false);
  const deferred = useDeferredValue(search.trim());
  const students = useStudents({ search: deferred || undefined, unallocated: unallocated || undefined });

  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const invite = useInvite();
  const selected = students.data?.find((s) => s.id === selectedId) ?? null;

  const emailNote = (emailed: boolean) =>
    emailed ? "Invite emails sent." : "Saved. Email is not configured, so the invite links were printed in the server console.";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {notice && (
        <p role="status" className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Students</CardTitle>
          <Button onClick={() => { setNotice(null); setCreating(true); }}>Add student</Button>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              aria-label="Search students"
              placeholder="Search by name or roll number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${fieldClass} max-w-xs`}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={unallocated} onChange={(e) => setUnallocated(e.target.checked)} />
              Without a room
            </label>
          </div>
          {students.isLoading && <p className="text-sm text-muted">Loading…</p>}
          {students.error && <p role="alert" className="text-sm text-danger">{students.error.message}</p>}
          {students.data?.length === 0 && <p className="text-sm text-muted">No students found.</p>}
        </CardBody>
        {students.data && students.data.length > 0 && (
          <table className="w-full text-left text-sm">
            <thead className="border-y border-border bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Room</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Phone</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Parent</th>
              </tr>
            </thead>
            <tbody>
              {students.data.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="text-left font-medium focus-visible:outline-2 focus-visible:outline-accent"
                      onClick={() => { setEditing(false); invite.reset(); setSelectedId(s.id); }}
                    >
                      {s.name}
                    </button>
                    <div className="text-xs text-muted">{s.rollNumber}</div>
                  </td>
                  <td className="px-4 py-2">{roomLabel(s) ?? <Badge tone="warn">No room</Badge>}</td>
                  <td className="hidden px-4 py-2 sm:table-cell">{s.phone ?? "-"}</td>
                  <td className="hidden px-4 py-2 md:table-cell">{s.parent?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Popover open={creating} onOpenChange={setCreating} title="Add a student" description="Logins for the student and parent are created, and each gets an email to set a password.">
        <StudentForm onDone={(emailed) => { setCreating(false); if (emailed !== undefined) setNotice(emailNote(emailed)); }} />
      </Popover>

      {selected && (
        <Popover open onOpenChange={(o) => { if (!o) setSelectedId(null); }} title={editing ? `Edit ${selected.name}` : selected.name}>
          {editing ? (
            <StudentForm student={selected} onDone={() => setEditing(false)} />
          ) : (
            <div className="space-y-4">
              <dl className="space-y-2 text-sm">
                <Row label="Roll number" value={selected.rollNumber} />
                <Row label="Email" value={selected.email} />
                <Row label="Room" value={roomLabel(selected) ?? "Not allocated"} />
                <Row label="Gender" value={selected.gender} />
                <Row label="Course" value={selected.course ? `${selected.course}${selected.year ? `, year ${selected.year}` : ""}` : "-"} />
                <Row label="Phone" value={selected.phone ?? "-"} />
                <Row label="WhatsApp" value={selected.whatsappNumber ?? "-"} />
                <Row label="Parent" value={selected.parent ? `${selected.parent.name}${selected.parent.phone ? `, ${selected.parent.phone}` : ""}` : "-"} />
                <Row label="Parent email" value={selected.parent?.email ?? "-"} />
                {selected.secondaryContact && (
                  <Row label="Secondary contact" value={[selected.secondaryContact.name, selected.secondaryContact.phone, selected.secondaryContact.email].filter(Boolean).join(", ") || "-"} />
                )}
              </dl>

              <div className="space-y-2 rounded-md border border-border bg-surface p-3">
                <p className="text-sm font-medium">Resend set-password email</p>
                <div className="flex flex-wrap gap-2">
                  {(["student", "parent", "both"] as const).map((t) => (
                    <Button key={t} variant="secondary" disabled={invite.isPending} onClick={() => invite.mutate({ id: selected.id, target: t })}>
                      {t === "both" ? "Both" : t === "student" ? "Student" : "Parent"}
                    </Button>
                  ))}
                </div>
                {invite.data && <p role="status" className="text-sm text-success">{invite.data.emailed ? "Email sent." : "Email is not configured. The link was printed in the server console."}</p>}
                {invite.error && <p role="alert" className="text-sm text-danger">{invite.error.message}</p>}
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setEditing(true)}>Edit details</Button>
              </div>
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
