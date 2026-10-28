import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { badRequest, fromError, ok } from "@/lib/api";
import { audit } from "@/lib/events";
import { hashToken } from "@/lib/invites";
import { setPasswordSchema } from "@/lib/validators/students";

// Public endpoint: the emailed token is the credential.
export async function POST(req: Request) {
  const parsed = setPasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request");

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { token: hashToken(parsed.data.token) },
      include: { user: { select: { id: true, role: true, isActive: true, deletedAt: true } } },
    });
    if (!record || record.expiresAt < new Date() || !record.user.isActive || record.user.deletedAt) {
      return badRequest("This link is invalid or has expired. Ask your warden to send a new one.");
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      await audit(tx, {
        actorId: record.userId,
        actorRole: record.user.role,
        action: "PASSWORD_SET",
        targetEntity: "User",
        targetId: record.userId,
      });
    });
    return ok({ done: true });
  } catch (error) {
    return fromError(error);
  }
}
