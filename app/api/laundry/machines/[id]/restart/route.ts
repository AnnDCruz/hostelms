import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit, notify } from "@/lib/events";
import { addMinutes, canRestart, loadMachine, postFeed, studentLaundryContext } from "@/lib/laundry";
import { durationSchema } from "@/lib/validators/laundry";

// Restart a dryer that has finished (grace period). The owner can do it, and so can any other student in the
// same laundry room, e.g. when clothes are still damp. The session is reused, not replaced, so the clothes
// keep their owner and the restart is recorded on the same row.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole([Role.Student]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("laundry", g.user.role);
  if (blocked) return blocked;

  const parsed = durationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid duration");
  const { durationMinutes } = parsed.data;

  try {
    const ctx = await studentLaundryContext(g.user.id);
    if (!ctx) return notFound("Student profile not found");
    const machine = await loadMachine(id);
    if (!machine) return notFound("Machine not found");
    if (machine.laundryRoomId !== ctx.laundryRoomId) return forbidden("This machine is not in your laundry room");
    const session = machine.sessions[0] ?? null;
    if (machine.type !== "Dryer") return badRequest("Only dryers can be restarted");
    if (!session || !canRestart(machine, session, ctx.studentId)) return badRequest("This dryer is not waiting to be collected");

    const byOther = session.studentId !== ctx.studentId;

    await prisma.$transaction(async (tx) => {
      const moved = await tx.machine.updateMany({ where: { id: machine.id, state: "GracePeriod", deletedAt: null }, data: { state: "InUse" } });
      if (moved.count === 0) throw new ApiError(409, "This dryer changed just now. Refresh and try again.");

      const now = new Date();
      const updated = await tx.laundrySession.updateMany({
        where: { id: session.id, endedAt: null },
        data: {
          durationMinutes,
          endsAt: addMinutes(now, durationMinutes),
          gracePeriodEndsAt: null,
          graceStage: 0,
          warnedAt: null,
          restartedByStudentId: byOther ? ctx.studentId : null,
          isRestartedByOther: byOther,
        },
      });
      if (updated.count === 0) throw new ApiError(409, "This dryer changed just now. Refresh and try again.");

      if (byOther) {
        await postFeed(
          tx,
          machine.laundryRoomId,
          "DryerRestartByOther",
          `${ctx.name} restarted ${session.student.name}'s clothes in ${machine.label} for ${durationMinutes} min.`,
          session.id,
        );
        await notify(tx, {
          recipientId: session.student.userId,
          category: "Laundry",
          title: `${machine.label} was restarted`,
          body: `${ctx.name} restarted your dryer for ${durationMinutes} min.`,
          linkEntity: "Laundry",
          linkId: machine.id,
        });
      } else {
        await postFeed(tx, machine.laundryRoomId, "DryerRestartBySelf", `${ctx.name} restarted ${machine.label} for ${durationMinutes} min.`, session.id);
      }
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "LAUNDRY_DRYER_RESTARTED",
        targetEntity: "Machine",
        targetId: machine.id,
        snapshot: { sessionId: session.id, durationMinutes, byOther },
      });
    });
    return ok({ restarted: true });
  } catch (error) {
    return fromError(error);
  }
}
