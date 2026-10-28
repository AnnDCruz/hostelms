import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, notFound, ok, serverError } from "@/lib/api";
import { audit, notify } from "@/lib/events";
import { gatepassActionSchema } from "@/lib/validators/gatepass";

// Approval chain: Request -> (parent) -> ParentApproval -> (warden) -> WardenApproval, or Rejected at either step.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const g = await assertRole(["Parent", "Warden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("gatepass", g.user.role);
  if (blocked) return blocked;

  const parsed = gatepassActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Action must be approve or reject");
  const approve = parsed.data.action === "approve";

  const gp = await prisma.gatepass.findFirst({
    where: { id, deletedAt: null },
    include: { student: { include: { parent: true } } },
  });
  if (!gp) return notFound("Gate pass not found");

  const now = new Date();
  let data: Prisma.GatepassUpdateInput;
  let action: string;

  if (g.user.role === "Parent") {
    const parent = gp.student.parent;
    if (!parent || parent.userId !== g.user.id) return forbidden();
    if (gp.status !== "Request") return badRequest("This request is not waiting for a parent");
    data = approve
      ? { status: "ParentApproval", parentApprovedAt: now }
      : { status: "Rejected", parentRejectedAt: now, parentRejectedBy: parent.id };
    action = approve ? "GATEPASS_PARENT_APPROVED" : "GATEPASS_PARENT_REJECTED";
  } else {
    if (!g.user.blockIds.includes(gp.blockId)) return forbidden();
    if (gp.status !== "ParentApproval") return badRequest("This request is not waiting for a warden");
    const warden = await prisma.warden.findFirst({ where: { userId: g.user.id, deletedAt: null } });
    if (!warden) return forbidden();
    data = approve
      ? { status: "WardenApproval", wardenApprovedAt: now }
      : { status: "Rejected", wardenRejectedAt: now, wardenRejectedBy: warden.id };
    action = approve ? "GATEPASS_WARDEN_APPROVED" : "GATEPASS_WARDEN_REJECTED";
  }

  // Once the return time has passed, the pass can no longer be approved (rejecting is still allowed).
  if (approve && gp.expectedReturnTime < now) {
    return badRequest("This gate pass has expired: its return time has passed, so it can no longer be approved");
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.gatepass.update({ where: { id }, data });

      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action,
        targetEntity: "Gatepass",
        targetId: id,
        snapshot: { from: gp.status, to: next.status },
      });

      const verdict = approve ? "approved" : "rejected";
      const by = g.user.role === "Parent" ? "your parent" : "the warden";
      await notify(tx, {
        recipientId: gp.student.userId,
        category: "Gatepass",
        title: `Gate pass ${verdict}`,
        body: `Your gate pass was ${verdict} by ${by}.`,
        linkEntity: "Gatepass",
        linkId: id,
      });

      // Parent approved: tell the block's active warden it is their turn.
      if (g.user.role === "Parent" && approve) {
        const wardens = await tx.blockWarden.findMany({
          where: { blockId: gp.blockId, removedAt: null },
          select: { warden: { select: { userId: true } } },
        });
        for (const w of wardens) {
          await notify(tx, {
            recipientId: w.warden.userId,
            category: "Gatepass",
            title: "Gate pass needs your approval",
            body: `${gp.student.name} has a gate pass approved by their parent.`,
            linkEntity: "Gatepass",
            linkId: id,
          });
        }
      }
      return next;
    });
    return ok(updated);
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
