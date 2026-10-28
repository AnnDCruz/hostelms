import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/events";
import { activeShiftWhere, shiftSelect, toShiftDTO } from "@/lib/shifts";

// A guard ends the shift they are on. Signing out does the same thing (see logoutAction).
export async function POST() {
  const g = await assertRole([Role.Security]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("shifts", g.user.role);
  if (blocked) return blocked;

  try {
    const guard = await prisma.securityGuard.findFirst({ where: { userId: g.user.id, deletedAt: null }, select: { id: true } });
    if (!guard) return notFound("Security profile not found");

    const shift = await prisma.$transaction(async (tx) => {
      const running = await tx.shift.findFirst({ where: { guardId: guard.id, ...activeShiftWhere }, select: { id: true } });
      if (!running) throw new ApiError(409, "You do not have a shift running.");
      const ended = await tx.shift.updateMany({ where: { id: running.id, ...activeShiftWhere }, data: { shiftOut: new Date() } });
      if (ended.count === 0) throw new ApiError(409, "This shift was just ended. Refresh to see it.");
      await audit(tx, { actorId: g.user.id, actorRole: g.user.role, action: "SHIFT_ENDED", targetEntity: "Shift", targetId: running.id });
      return tx.shift.findUniqueOrThrow({ where: { id: running.id }, select: shiftSelect });
    });
    return ok(toShiftDTO(shift));
  } catch (error) {
    return fromError(error);
  }
}
