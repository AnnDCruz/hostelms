"use client";

import { useState } from "react";
import { useCreateGatepass } from "@/hooks/use-gatepass";
import { Button } from "@/components/ui/button";

const field =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent";

export function GatepassForm({ onDone }: { onDone: () => void }) {
  const create = useCreateGatepass();
  const [departure, setDeparture] = useState("");
  const [back, setBack] = useState("");
  const [reason, setReason] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate(
      {
        departureTime: new Date(departure).toISOString(),
        expectedReturnTime: new Date(back).toISOString(),
        reason,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Leaving at</span>
        <input type="datetime-local" required value={departure} onChange={(e) => setDeparture(e.target.value)} className={field} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Back by</span>
        <input type="datetime-local" required value={back} onChange={(e) => setBack(e.target.value)} className={field} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Reason</span>
        <textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
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
          {create.isPending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}
