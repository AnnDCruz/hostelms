import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit, notify } from "@/lib/events";
import { notifyFacilities } from "@/lib/maintenance";
import { maintenanceActionSchema } from "@/lib/validators/maintenance";

// Facilities: start (Pending -> InProgress) and resolve (InProgress -> Resolved).
// The student who raised it: reopen (Resolved -> Pending, reopenCount + 1).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Facilities", "Student"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("maintenance", g.user.role);
  if (blocked) return blocked;

  const parsed = maintenanceActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Action must be start, resolve or reopen");
  const { action } = parsed.data;

  try {
    const mr = await prisma.maintenanceRequest.findFirst({
      where: { id, deletedAt: null },
      include: { student: { select: { userId: true, name: true } }, room: { select: { roomNumber: true } }, block: { select: { name: true } } },
    });
    if (!mr) return notFound("Request not found");

    const now = new Date();
    let data: Prisma.MaintenanceRequestUpdateManyMutationInput;
    let from: "Pending" | "InProgress" | "Resolved";

    if (action === "reopen") {
      if (g.user.role !== "Student" || mr.student.userId !== g.user.id) return forbidden();
      if (mr.status !== "Resolved") return badRequest("Only a resolved request can be reopened");
      from = "Resolved";
      data = {
        status: "Pending",
        pendingAt: now,
        inProgressAt: null,
        resolvedAt: null,
        reopenCount: { increment: 1 },
        lastReopenAt: now,
      };
    } else {
      if (g.user.role !== "Facilities") return forbidden();
      if (action === "start") {
        if (mr.status !== "Pending") return badRequest("Only a pending request can be started");
        from = "Pending";
        data = { status: "InProgress", inProgressAt: now };
      } else {
        if (mr.status !== "InProgress") return badRequest("Only a request in progress can be resolved");
        from = "InProgress";
        data = { status: "Resolved", resolvedAt: now };
      }
    }

    await prisma.$transaction(async (tx) => {
      // Guards against two people moving the same request at once.
      const updated = await tx.maintenanceRequest.updateMany({ where: { id, status: from }, data });
      if (updated.count === 0) throw new ApiError(409, "This request just changed. Refresh and try again");

      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: `MAINTENANCE_${action.toUpperCase()}`,
        targetEntity: "MaintenanceRequest",
        targetId: id,
        snapshot: { from },
      });

      const where = `${mr.block.name}-${mr.room.roomNumber}`;
      if (action === "reopen") {
        await notifyFacilities(tx, {
          title: "Maintenance request reopened",
          body: `${mr.student.name} (${where}) reopened a request: ${mr.description.slice(0, 80)}`,
          requestId: id,
        });
      } else {
        await notify(tx, {
          recipientId: mr.student.userId,
          category: "Maintenance",
          title: action === "start" ? "Work has started on your request" : "Your request was resolved",
          body: mr.description.slice(0, 100),
          linkEntity: "MaintenanceRequest",
          linkId: id,
        });
      }
    });
    return ok({ done: true });
  } catch (error) {
    return fromError(error);
  }
}
