"use client";

import { useState } from "react";
import { useMyProfile, useUpdateStudent } from "@/hooks/use-students";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldClass } from "@/components/ui/field";
import type { MyProfileDTO } from "@/lib/types";

export function MyProfile() {
  const { data, isLoading, error } = useMyProfile();
  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (error) return <p role="alert" className="text-sm text-danger">{error.message}</p>;
  if (!data) return null;
  return <ProfileCard profile={data} />;
}

function ProfileCard({ profile }: { profile: MyProfileDTO }) {
  const update = useUpdateStudent();
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(profile.whatsappNumber ?? "");
  const [saved, setSaved] = useState(false);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Your details</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="space-y-2 text-sm">
            <Row label="Name" value={profile.name} />
            <Row label="Roll number" value={profile.rollNumber} />
            <Row label="Email" value={profile.email} />
            <Row label="Course" value={profile.course ? `${profile.course}${profile.year ? `, year ${profile.year}` : ""}` : "-"} />
            <Row label="Room" value={profile.room ? `${profile.room.block.name}-${profile.room.roomNumber} (floor ${profile.room.floor})` : "Not allocated yet"} />
          </dl>
          <p className="mt-3 text-xs text-muted">To change anything else, ask your warden.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact numbers</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(false);
              update.mutate({ id: profile.id, body: { phone, whatsappNumber: whatsapp } }, { onSuccess: () => setSaved(true) });
            }}
          >
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">WhatsApp</span>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={fieldClass} />
            </label>
            {update.error && <p role="alert" className="text-sm text-danger">{update.error.message}</p>}
            {saved && <p role="status" className="text-sm text-success">Saved.</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
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
