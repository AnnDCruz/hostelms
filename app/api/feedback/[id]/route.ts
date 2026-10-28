import type { FeedbackStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit, notifyMany } from "@/lib/events";
import { managedBlockIds } from "@/lib/scope";
import { feedbackActionSchema } from "@/lib/validators/feedback";

// Warden: acknowledge -> review -> resolve, or escalate at any point before it is resolved.
// Chief warden: resolves escalated items. Every step is audited and the submitter is notified.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("feedback", g.user.role);
  if (blocked) return blocked;

  const parsed = feedbackActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);
  const { action, note } = parsed.data;
  const isChief = g.user.role === "ChiefWarden";

  try {
    const fb = await prisma.feedback.findFirst({
      where: { id, deletedAt: null },
      select: {
        status: true,
        blockId: true,
        body: true,
        student: { select: { userId: true } },
        parent: { select: { userId: true } },
        warden: { select: { userId: true } },
      },
    });
    if (!fb) return notFound("Feedback not found");
    if (!isChief && !(await managedBlockIds(g.user)).includes(fb.blockId)) return forbidden("This feedback is not in one of your blocks");

    const now = new Date();
    let from: FeedbackStatus = fb.status;
    let data: Prisma.FeedbackUpdateManyMutationInput;
    let submitterTitle: string;

    switch (action) {
      case "acknowledge":
        if (isChief) return forbidden();
        if (fb.status !== "Submitted") return badRequest("Only new feedback can be acknowledged");
        data = { status: "Acknowledged", acknowledgedAt: now };
        submitterTitle = "Your feedback was acknowledged";
        break;
      case "review":
        if (isChief) return forbidden();
        if (fb.status !== "Acknowledged") return badRequest("Acknowledge the feedback before reviewing it");
        data = { status: "InReview", inReviewAt: now };
        submitterTitle = "Your feedback is being reviewed";
        break;
      case "resolve":
        if (isChief) {
          if (fb.status !== "Escalated") return badRequest("The chief warden resolves escalated feedback only");
          data = { status: "Resolved", resolvedAt: now, chiefWardenUserId: g.user.id, chiefWardenResolvedAt: now };
        } else {
          if (fb.status === "Escalated") return badRequest("Escalated feedback is resolved by the chief warden");
          if (fb.status !== "InReview") return badRequest("Move the feedback to review before resolving it");
          data = { status: "Resolved", resolvedAt: now };
        }
        submitterTitle = "Your feedback was resolved";
        break;
      case "escalate":
        if (isChief) return forbidden();
        if (!(["Submitted", "Acknowledged", "InReview"] as FeedbackStatus[]).includes(fb.status)) {
          return badRequest("Only feedback that is not yet resolved or escalated can be escalated");
        }
        data = { status: "Escalated", escalatedAt: now, escalationNote: note || null };
        submitterTitle = "Your feedback was escalated to the chief warden";
        break;
    }
    from = fb.status;

    await prisma.$transaction(async (tx) => {
      // Guards against two people moving the same item at once.
      const updated = await tx.feedback.updateMany({ where: { id, status: from }, data });
      if (updated.count === 0) throw new ApiError(409, "This feedback just changed. Refresh and try again");

      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: `FEEDBACK_${action.toUpperCase()}`,
        targetEntity: "Feedback",
        targetId: id,
        snapshot: { from },
      });

      const submitter = fb.student?.userId ?? fb.parent?.userId;
      if (submitter) {
        await notifyMany(tx, [submitter], {
          category: "Feedback",
          title: submitterTitle,
          body: fb.body.slice(0, 100),
          linkEntity: "Feedback",
          linkId: id,
        });
      }
      if (action === "escalate") {
        const chiefs = await tx.user.findMany({ where: { role: "ChiefWarden", isActive: true, deletedAt: null }, select: { id: true } });
        await notifyMany(tx, chiefs.map((c) => c.id), {
          category: "Feedback",
          title: "Feedback escalated to you",
          body: fb.body.slice(0, 100),
          linkEntity: "Feedback",
          linkId: id,
        });
      }
      if (action === "resolve" && isChief && fb.warden) {
        await notifyMany(tx, [fb.warden.userId], {
          category: "Feedback",
          title: "Escalated feedback was resolved by the chief warden",
          body: fb.body.slice(0, 100),
          linkEntity: "Feedback",
          linkId: id,
        });
      }
    });
    return ok({ done: true });
  } catch (error) {
    return fromError(error);
  }
}
