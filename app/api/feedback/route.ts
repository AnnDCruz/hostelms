import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { audit, notifyMany } from "@/lib/events";
import { feedbackSelect, feedbackWhere, toFeedbackDTO } from "@/lib/feedback";
import { createFeedbackSchema } from "@/lib/validators/feedback";

export async function GET() {
  const g = await assertRole(["Student", "Parent", "Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("feedback", g.user.role);
  if (blocked) return blocked;

  try {
    const where = await feedbackWhere(g.user);
    if (!where) return forbidden();
    const rows = await prisma.feedback.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: feedbackSelect,
    });
    const staff = g.user.role === "Warden" || g.user.role === "ChiefWarden";
    return ok(rows.map((f) => toFeedbackDTO(f, staff)));
  } catch (error) {
    return fromError(error);
  }
}

// Routed automatically to the active warden of the submitter's block.
export async function POST(req: Request) {
  const g = await assertRole(["Student", "Parent"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("feedback", g.user.role);
  if (blocked) return blocked;

  const parsed = createFeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);

  try {
    let blockId: string | null = null;
    let studentId: string | null = null;
    let parentId: string | null = null;
    let submitterName = "";

    if (g.user.role === "Student") {
      const s = await prisma.student.findFirst({
        where: { userId: g.user.id, deletedAt: null },
        select: { id: true, name: true, room: { select: { blockId: true } } },
      });
      if (!s) return notFound("Student profile not found");
      blockId = s.room?.blockId ?? null;
      studentId = s.id;
      submitterName = s.name;
    } else {
      const p = await prisma.parent.findFirst({
        where: { userId: g.user.id },
        select: { id: true, name: true, student: { select: { room: { select: { blockId: true } } } } },
      });
      if (!p) return notFound("Parent profile not found");
      blockId = p.student.room?.blockId ?? null;
      parentId = p.id;
      submitterName = p.name;
    }
    if (!blockId) return badRequest("There is no hostel block linked to this account yet, so the feedback cannot be routed");
    const routeBlockId = blockId;

    const created = await prisma.$transaction(async (tx) => {
      const assignment = await tx.blockWarden.findFirst({
        where: { blockId: routeBlockId, removedAt: null },
        select: { wardenId: true, warden: { select: { userId: true } } },
      });
      const fb = await tx.feedback.create({
        data: { blockId: routeBlockId, studentId, parentId, wardenId: assignment?.wardenId ?? null, body: parsed.data.body },
      });
      await audit(tx, { actorId: g.user.id, actorRole: g.user.role, action: "FEEDBACK_SUBMITTED", targetEntity: "Feedback", targetId: fb.id });

      // No active warden on the block: tell the chief warden instead.
      let recipients: string[];
      if (assignment) {
        recipients = [assignment.warden.userId];
      } else {
        const chiefs = await tx.user.findMany({ where: { role: "ChiefWarden", isActive: true, deletedAt: null }, select: { id: true } });
        recipients = chiefs.map((c) => c.id);
      }
      await notifyMany(tx, recipients, {
        category: "Feedback",
        title: "New feedback",
        body: `${submitterName}: ${parsed.data.body.slice(0, 80)}`,
        linkEntity: "Feedback",
        linkId: fb.id,
      });
      return fb;
    });
    return ok({ id: created.id }, 201);
  } catch (error) {
    return fromError(error);
  }
}
