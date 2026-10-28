import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sendMail } from "@/lib/email";

type Db = Prisma.TransactionClient | PrismaClient;

const INVITE_HOURS = 72;

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

// Only the hash is stored. The raw token exists only in the email.
export async function createInviteToken(db: Db, userId: string) {
  await db.passwordResetToken.deleteMany({ where: { userId } });
  const raw = randomBytes(32).toString("hex");
  await db.passwordResetToken.create({
    data: { userId, token: hashToken(raw), expiresAt: new Date(Date.now() + INVITE_HOURS * 3600 * 1000) },
  });
  return raw;
}

export function sendInvite(to: string, name: string, rawToken: string) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${base}/set-password?token=${rawToken}`;
  return sendMail({
    to,
    subject: "Set your HostelMS password",
    text: `Hello ${name},\n\nYour HostelMS account is ready. Choose your password here (the link works for ${INVITE_HOURS} hours):\n${url}\n\nIf you were not expecting this email, you can ignore it.`,
  });
}
