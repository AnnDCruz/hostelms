"use client";

import { useState } from "react";
import type { Gender } from "@prisma/client";
import type { StudentDTO } from "@/lib/types";
import { useCreateStudent, useUpdateStudent } from "@/hooks/use-students";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";

type F = {
  name: string; rollNumber: string; email: string; gender: Gender; course: string; year: string;
  phone: string; whatsappNumber: string;
  parentName: string; parentEmail: string; parentPhone: string;
  scName: string; scPhone: string; scEmail: string;
};

function initial(s?: StudentDTO): F {
  return {
    name: s?.name ?? "", rollNumber: s?.rollNumber ?? "", email: s?.email ?? "", gender: s?.gender ?? "Male",
    course: s?.course ?? "", year: s?.year ? String(s.year) : "", phone: s?.phone ?? "", whatsappNumber: s?.whatsappNumber ?? "",
    parentName: s?.parent?.name ?? "", parentEmail: s?.parent?.email ?? "", parentPhone: s?.parent?.phone ?? "",
    scName: s?.secondaryContact?.name ?? "", scPhone: s?.secondaryContact?.phone ?? "", scEmail: s?.secondaryContact?.email ?? "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

export function StudentForm({ student, onDone }: { student?: StudentDTO; onDone: (emailed?: boolean) => void }) {
  const editing = !!student;
  const create = useCreateStudent();
  const update = useUpdateStudent();
  const [f, setF] = useState<F>(() => initial(student));
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const mutation = editing ? update : create;
  const year = f.year ? Number(f.year) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (student) {
      update.mutate(
        {
          id: student.id,
          body: {
            name: f.name, course: f.course, year, phone: f.phone, whatsappNumber: f.whatsappNumber,
            ...(student.room ? {} : { gender: f.gender }),
            parent: { name: f.parentName, phone: f.parentPhone },
            secondaryContact: { name: f.scName, phone: f.scPhone, email: f.scEmail },
          },
        },
        { onSuccess: () => onDone() },
      );
    } else {
      create.mutate(
        {
          name: f.name, rollNumber: f.rollNumber, email: f.email, gender: f.gender, course: f.course, year,
          phone: f.phone, whatsappNumber: f.whatsappNumber,
          parent: { name: f.parentName, email: f.parentEmail, phone: f.parentPhone },
          secondaryContact: f.scName || f.scPhone || f.scEmail ? { name: f.scName, phone: f.scPhone, email: f.scEmail } : null,
        },
        { onSuccess: (r) => onDone(r.emailed) },
      );
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Student</legend>
        <Field label="Full name"><input required minLength={2} value={f.name} onChange={set("name")} className={fieldClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Roll number"><input required disabled={editing} value={f.rollNumber} onChange={set("rollNumber")} className={fieldClass} /></Field>
          <Field label="Gender">
            <select value={f.gender} onChange={set("gender")} disabled={!!student?.room} className={fieldClass}>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Official email (used to sign in)"><input required type="email" disabled={editing} value={f.email} onChange={set("email")} className={fieldClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Course"><input value={f.course} onChange={set("course")} className={fieldClass} /></Field>
          <Field label="Year"><input type="number" min={1} max={8} value={f.year} onChange={set("year")} className={fieldClass} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input value={f.phone} onChange={set("phone")} className={fieldClass} /></Field>
          <Field label="WhatsApp"><input value={f.whatsappNumber} onChange={set("whatsappNumber")} className={fieldClass} /></Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Parent (approves gate passes)</legend>
        <Field label="Name"><input required minLength={2} value={f.parentName} onChange={set("parentName")} className={fieldClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email (parent sign-in)"><input required type="email" disabled={editing} value={f.parentEmail} onChange={set("parentEmail")} className={fieldClass} /></Field>
          <Field label="Phone"><input value={f.parentPhone} onChange={set("parentPhone")} className={fieldClass} /></Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold">Secondary contact (optional)</legend>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name"><input value={f.scName} onChange={set("scName")} className={fieldClass} /></Field>
          <Field label="Phone"><input value={f.scPhone} onChange={set("scPhone")} className={fieldClass} /></Field>
          <Field label="Email"><input type="email" value={f.scEmail} onChange={set("scEmail")} className={fieldClass} /></Field>
        </div>
      </fieldset>

      {mutation.error && <p role="alert" className="text-sm text-danger">{mutation.error.message}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onDone()}>Cancel</Button>
        <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : editing ? "Save changes" : "Create and send invites"}</Button>
      </div>
    </form>
  );
}
