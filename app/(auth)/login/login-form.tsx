"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

const field =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent";

export function LoginForm() {
  const [error, formAction, pending] = useActionState(loginAction, undefined);
  return (
    <form action={formAction} className="mt-5 space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className={field} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
