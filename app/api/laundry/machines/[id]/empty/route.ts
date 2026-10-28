import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit, notify } from "@/lib/events";
import { canEmpty, loadMachine, postFeed, runLaundryTick, studentLaundryContext } from "@/lib/laundry";

// The clothes are out and the machine is free again. The owner can do this once the cycle is running or done.
// Someone else can do it only after the owner's collect window has passed, which is when the feed asks nearby
// students to move unattended clothes.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole([Role.Student]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("laundry", g.user.role);
  if (blocked) return blocked;

  try {
    // Make sure a timer that has just expired is reflected before we judge what is allowed.
    await runLaundryTick(true);

    const ctx = await studentLaundryContext(g.user.id);
    if (!ctx) return notFound("Student profile not found");
    const machine = await loadMachine(id);
    if (!machine) return notFound("Machine not found");
    if (machine.laundryRoomId !== ctx.laundryRoomId) return forbidden("This machine is not in your laundry room");
    const session = machine.sessions[0] ?? null;
    if (!session) return badRequest("This machine is already empty");
    if (!canEmpty(machine, session, ctx.studentId)) {
      return forbidden(
        session.studentId === ctx.studentId
          ? "This machine cannot be emptied right now"
          : "You can move someone else's clothes only after their collect window has passed",
      );
    }

    const byOther = session.studentId !== ctx.studentId;

    await prisma.$transaction(async (tx) => {
      const ended = await tx.laundrySession.updateMany({ where: { id: session.id, endedAt: null }, data: { endedAt: new Date() } });
      if (ended.count === 0) throw new ApiError(409, "This machine was just emptied. Refresh to see it.");
      await tx.machine.updateMany({ where: { id: machine.id, state: { in: ["InUse", "GracePeriod"] } }, data: { state: "Free" } });

      await postFeed(
        tx,
        machine.laundryRoomId,
        "MachineEmptied",
        byOther
          ? `${ctx.name} moved ${session.student.name}'s clothes out of ${machine.label}. It is free now.`
          : `${ctx.name} collected their clothes from ${machine.label}. It is free now.`,
        session.id,
      );
      if (byOther) {
        await notify(tx, {
          recipientId: session.student.userId,
          category: "Laundry",
          title: `Your clothes were moved from ${machine.label}`,
          body: `${ctx.name} moved them because they were left unattended.`,
          linkEntity: "Laundry",
          linkId: machine.id,
        });
      }
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "LAUNDRY_EMPTIED",
        targetEntity: "Machine",
        targetId: machine.id,
        snapshot: { sessionId: session.id, byOther },
      });
    });
    return ok({ emptied: true });
  } catch (error) {
    return fromError(error);
  }
}
