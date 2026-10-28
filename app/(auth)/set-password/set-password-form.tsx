"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";

export function SetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const save = useMutation({
    mutationFn: () => apiFetch("/api/account/set-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  });

  if (save.isSuccess) {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p role="status" className="text-success">Your password is set.</p>
        <Link href="/login" className="font-medium text-accent underline">Go to sign in</Link>
      </div>
    );
  }

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirm) return setMismatch(true);
        setMismatch(false);
        save.mutate();
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">New password</span>
        <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} />
        <span className="text-xs text-muted">At least 8 characters, with a letter and a number.</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Confirm password</span>
        <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={fieldClass} />
      </label>
      {mismatch && <p role="alert" className="text-sm text-danger">The two passwords do not match.</p>}
      {save.error && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
      <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? "Saving…" : "Set password"}</Button>
    </form>
  );
}
