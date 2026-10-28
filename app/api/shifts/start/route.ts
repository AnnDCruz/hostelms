import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/events";
import { securityBlocks } from "@/lib/scope";
import { activeShiftWhere, runShiftTick, shiftSelect, toShiftDTO } from "@/lib/shifts";
import { startShiftSchema } from "@/lib/validators/shifts";

// A guard starts a shift on one of the blocks they are assigned to. Only one shift can run at a time.
export async function POST(req: Request) {
  const g = await assertRole([Role.Security]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("shifts", g.user.role);
  if (blocked) return blocked;

  const parsed = startShiftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Choose a block");
  const { blockId } = parsed.data;

  try {
    // A shift that has been open for too long is flagged first, so it cannot block a new start.
    await runShiftTick(true);

    const guard = await prisma.securityGuard.findFirst({ where: { userId: g.user.id, deletedAt: null }, select: { id: true } });
    if (!guard) return notFound("Security profile not found");
    const blocks = await securityBlocks(g.user.id);
    if (!blocks.some((b) => b.id === blockId)) return forbidden("You are not assigned to this block");

    const shift = await prisma.$transaction(async (tx) => {
      // Touching the guard's row makes two quick taps on Start wait for each other, so only one shift is created.
      await tx.securityGuard.update({ where: { id: guard.id }, data: { updatedAt: new Date() } });
      const running = await tx.shift.findFirst({ where: { guardId: guard.id, ...activeShiftWhere }, select: { id: true } });
      if (running) throw new ApiError(409, "You already have a shift running. End it first.");

      const created = await tx.shift.create({ data: { guardId: guard.id, blockId, shiftIn: new Date() }, select: shiftSelect });
      await audit(tx, { actorId: g.user.id, actorRole: g.user.role, action: "SHIFT_STARTED", targetEntity: "Shift", targetId: created.id, snapshot: { blockId } });
      return created;
    });
    return ok(toShiftDTO(shift), 201);
  } catch (error) {
    return fromError(error);
  }
}
