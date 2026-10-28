import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit, notify } from "@/lib/events";
import { managedBlockIds } from "@/lib/scope";
import { shiftSelect, shiftStatus, toShiftDTO } from "@/lib/shifts";
import { resolveShiftSchema } from "@/lib/validators/shifts";

// A warden closes a flagged shift by giving the time it really ended. This is the only way a flagged shift
// gets an end time, and the original flag stays on it as the record of what happened.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole([Role.Warden, Role.ChiefWarden]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("shifts", g.user.role);
  if (blocked) return blocked;

  const parsed = resolveShiftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Enter the time the shift ended");
  const shiftOut = new Date(parsed.data.shiftOut);

  try {
    const shift = await prisma.shift.findUnique({ where: { id }, select: { ...shiftSelect, guard: { select: { name: true, userId: true } } } });
    if (!shift) return notFound("Shift not found");
    if (!(await managedBlockIds(g.user)).includes(shift.blockId)) return forbidden("This shift is not in a block you manage");
    if (shiftStatus(shift) !== "NeedsReview") return badRequest("This shift is not waiting for review");
    if (shiftOut.getTime() <= shift.shiftIn.getTime()) return badRequest("The end time must be after the shift started");
    // One minute of slack for a slightly fast clock on the device that sent the time.
    if (shiftOut.getTime() > Date.now() + 60_000) return badRequest("The end time cannot be in the future");

    const updated = await prisma.$transaction(async (tx) => {
      const done = await tx.shift.updateMany({ where: { id, flag: "MissedLogout", shiftOut: null }, data: { shiftOut } });
      if (done.count === 0) throw new ApiError(409, "This shift was just resolved. Refresh to see it.");
      await notify(tx, {
        recipientId: shift.guard.userId,
        category: "Shift",
        title: "Your shift was closed by your warden",
        body: "Remember to end your shift when you finish, or sign out.",
        linkEntity: "Shift",
        linkId: id,
      });
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "SHIFT_RESOLVED",
        targetEntity: "Shift",
        targetId: id,
        snapshot: { shiftOut: shiftOut.toISOString() },
      });
      return tx.shift.findUniqueOrThrow({ where: { id }, select: shiftSelect });
    });
    return ok(toShiftDTO(updated));
  } catch (error) {
    return fromError(error);
  }
}
