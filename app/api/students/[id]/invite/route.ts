import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, fromError, notFound, ok } from "@/lib/api";
import { audit } from "@/lib/events";
import { createInviteToken, sendInvite } from "@/lib/invites";
import { assertStudentAccess } from "@/lib/students";
import { inviteSchema } from "@/lib/validators/students";

// Sends a fresh set-password link (older links stop working).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("students", g.user.role);
  if (blocked) return blocked;

  const parsed = inviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("target must be student, parent or both");

  try {
    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: {
        name: true,
        userId: true,
        user: { select: { email: true } },
        room: { select: { blockId: true } },
        parent: { select: { name: true, userId: true, user: { select: { email: true } } } },
      },
    });
    if (!student) return notFound("Student not found");
    assertStudentAccess(g.user, student);

    const targets: { userId: string; email: string; name: string }[] = [];
    if (parsed.data.target !== "parent") targets.push({ userId: student.userId, email: student.user.email, name: student.name });
    if (parsed.data.target !== "student" && student.parent) {
      targets.push({ userId: student.parent.userId, email: student.parent.user.email, name: student.parent.name });
    }

    const tokens = await prisma.$transaction(async (tx) => {
      const out: string[] = [];
      for (const t of targets) out.push(await createInviteToken(tx, t.userId));
      await audit(tx, { actorId: g.user.id, actorRole: g.user.role, action: "INVITE_SENT", targetEntity: "Student", targetId: id });
      return out;
    });

    const results = await Promise.all(targets.map((t, i) => sendInvite(t.email, t.name, tokens[i])));
    return ok({ emailed: results.every(Boolean) });
  } catch (error) {
    return fromError(error);
  }
}
