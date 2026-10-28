import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, fromError, ok } from "@/lib/api";
import { MAX_SHIFT_HOURS, activeShiftWhere, runShiftTick, shiftSelect, toShiftDTO } from "@/lib/shifts";
import { managedBlockIds, securityBlocks } from "@/lib/scope";
import type { ShiftsDTO } from "@/lib/types";

const GUARD_HISTORY = 60;
const MANAGER_LIMIT = 100;

// Guards get their own current shift and history. Wardens and the chief warden get the shifts for the blocks
// they manage. ?blockId= narrows to one block and ?review=1 shows only shifts still waiting for an end time.
export async function GET(req: Request) {
  const g = await assertRole([Role.Security, Role.Warden, Role.ChiefWarden]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("shifts", g.user.role);
  if (blocked) return blocked;

  try {
    await runShiftTick();
    const serverTime = new Date().toISOString();

    if (g.user.role === Role.Security) {
      const guard = await prisma.securityGuard.findFirst({ where: { userId: g.user.id, deletedAt: null }, select: { id: true } });
      const blocks = await securityBlocks(g.user.id);
      const rows = guard
        ? await prisma.shift.findMany({ where: { guardId: guard.id }, orderBy: { shiftIn: "desc" }, take: GUARD_HISTORY, select: shiftSelect })
        : [];
      const history = rows.map(toShiftDTO);
      const data: ShiftsDTO = {
        view: "guard",
        serverTime,
        maxShiftHours: MAX_SHIFT_HOURS,
        blocks,
        current: history.find((s) => s.status === "Active") ?? null,
        history,
      };
      return ok(data);
    }

    const blockIds = await managedBlockIds(g.user);
    const blocks = await prisma.block.findMany({ where: { id: { in: blockIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const params = new URL(req.url).searchParams;
    const blockFilter = params.get("blockId");
    const where: Prisma.ShiftWhereInput = {
      blockId: blockFilter && blockIds.includes(blockFilter) ? blockFilter : { in: blockIds },
      ...(params.get("review") === "1" ? { flag: "MissedLogout", shiftOut: null } : {}),
    };

    const [shifts, onShift, needsReview] = await Promise.all([
      prisma.shift.findMany({ where, orderBy: { shiftIn: "desc" }, take: MANAGER_LIMIT, select: shiftSelect }),
      prisma.shift.findMany({ where: { blockId: { in: blockIds }, ...activeShiftWhere }, orderBy: { shiftIn: "asc" }, select: shiftSelect }),
      prisma.shift.count({ where: { blockId: { in: blockIds }, flag: "MissedLogout", shiftOut: null } }),
    ]);

    const data: ShiftsDTO = {
      view: "manager",
      serverTime,
      maxShiftHours: MAX_SHIFT_HOURS,
      blocks,
      onShift: onShift.map(toShiftDTO),
      needsReview,
      shifts: shifts.map(toShiftDTO),
    };
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
