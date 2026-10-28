import { NextResponse } from "next/server";
import { Prisma, type Role } from "@prisma/client";
import { auth } from "@/lib/auth/config";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { SessionUser } from "@/lib/types";
import { ApiError } from "@/lib/errors";

// Standard response envelope: { ok: true, data } or { ok: false, error: { message, details? } }
export const ok = <T>(data: T, status = 200) => NextResponse.json({ ok: true, data }, { status });

const fail = (status: number, message: string, details?: unknown) =>
  NextResponse.json({ ok: false, error: { message, details } }, { status });

export const badRequest = (message = "Bad request", details?: unknown) => fail(400, message, details);
export const unauthorized = (message = "Sign in required") => fail(401, message);
export const forbidden = (message = "You do not have access to this") => fail(403, message);
export const notFound = (message = "Not found") => fail(404, message);
export const serverError = (message = "Something went wrong") => fail(500, message);

// Usage: const g = await assertRole([...]); if ("error" in g) return g.error;
export async function assertRole(roles: Role[]) {
  const session = await auth();
  if (!session?.user) return { error: unauthorized() } as const;
  if (!roles.includes(session.user.role)) return { error: forbidden() } as const;
  return { user: session.user as SessionUser } as const;
}

// Returns a response when the feature is switched off for this role, otherwise null.
export async function assertFeature(feature: string, role: Role) {
  const enabled = await isFeatureEnabled(feature, role);
  return enabled ? null : forbidden("This feature is turned off for your role");
}

// Turns anything thrown inside a handler into the standard envelope.
export function fromError(error: unknown) {
  if (error instanceof ApiError) return fail(error.status, error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return fail(409, "That conflicts with an existing record. Refresh and try again.");
  }
  console.error(error);
  return serverError();
}
