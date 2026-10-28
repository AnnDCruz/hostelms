import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/events";
import { addMinutes, loadMachine, postFeed, studentLaundryContext } from "@/lib/laundry";
import { durationSchema } from "@/lib/validators/laundry";

// A student starts a free machine for a chosen number of minutes.
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

    const session = await prisma.$transaction(async (tx) => {
      // One washer and one dryer per student at a time. A machine left in its grace period still counts.
      const already = await tx.laundrySession.count({ where: { studentId: ctx.studentId, endedAt: null, machine: { type: machine.type } } });
      if (already > 0) throw new ApiError(409, `You already have a ${machine.type.toLowerCase()} in use. Collect your clothes from it first.`);

      // Claim the machine. If two students tap at once, only one update matches state = Free.
      const claimed = await tx.machine.updateMany({ where: { id: machine.id, state: "Free", deletedAt: null }, data: { state: "InUse" } });
      if (claimed.count === 0) throw new ApiError(409, "Someone just took this machine, or it is not available. Pick another one.");

      const now = new Date();
      const created = await tx.laundrySession.create({
        data: {
          machineId: machine.id,
          studentId: ctx.studentId,
          laundryRoomId: machine.laundryRoomId,
          durationMinutes,
          startedAt: now,
          endsAt: addMinutes(now, durationMinutes),
        },
        select: { id: true, endsAt: true },
      });
      await postFeed(tx, machine.laundryRoomId, "SessionStart", `${ctx.name} started ${machine.label} for ${durationMinutes} min.`, created.id);
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "LAUNDRY_STARTED",
        targetEntity: "Machine",
        targetId: machine.id,
        snapshot: { sessionId: created.id, durationMinutes },
      });
      return created;
    });
    return ok({ sessionId: session.id, endsAt: session.endsAt.toISOString() }, 201);
  } catch (error) {
    return fromError(error);
  }
}
