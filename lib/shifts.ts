import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/events";
import { acquireTickSlot } from "@/lib/tick-gate";
import { managedBlockIds, securityBlocks } from "@/lib/scope";
import type { SessionUser, ShiftDTO, ShiftStatus } from "@/lib/types";

// A shift still open after this long is treated as a forgotten logout. Shifts are normally 8 to 12 hours.
export const MAX_SHIFT_HOURS = 12;

// "Active" means running: never ended and never flagged. A flagged shift is no longer active, so the guard
// can start a fresh one while the warden sorts out the old one.
export const activeShiftWhere = { shiftOut: null, flag: null } satisfies Prisma.ShiftWhereInput;

export const shiftSelect = {
  id: true,
  guardId: true,
  blockId: true,
  shiftIn: true,
  shiftOut: true,
  flag: true,
  guard: { select: { name: true } },
  block: { select: { name: true } },
} satisfies Prisma.ShiftSelect;

type ShiftRow = Prisma.ShiftGetPayload<{ select: typeof shiftSelect }>;

export function shiftStatus(s: { shiftOut: Date | null; flag: string | null }): ShiftStatus {
  if (!s.flag) return s.shiftOut ? "Completed" : "Active";
  return s.shiftOut ? "Resolved" : "NeedsReview";
}

export function toShiftDTO(s: ShiftRow): ShiftDTO {
  return {
    id: s.id,
    guardId: s.guardId,
    guardName: s.guard.name,
    blockId: s.blockId,
    blockName: s.block.name,
    shiftIn: s.shiftIn.toISOString(),
    shiftOut: s.shiftOut?.toISOString() ?? null,
    flag: s.flag,
    status: shiftStatus(s),
    durationMinutes: s.shiftOut ? Math.max(0, Math.round((s.shiftOut.getTime() - s.shiftIn.getTime()) / 60_000)) : null,
  };
}

// Logging out ends the guard's running shift. Never throws: signing out must always work.
export async function endOpenShiftsForUser(userId: string) {
  try {
    await prisma.shift.updateMany({ where: { guard: { userId }, ...activeShiftWhere }, data: { shiftOut: new Date() } });
  } catch (error) {
    console.error("could not end shift on logout", error);
  }
}

// Flags shifts that have been open too long and tells the block's warden. Runs from the shifts page and the
// notification bell's poll (like the laundry timers), so there is no background worker to keep alive.
// Idempotent: the flag is claimed with an updateMany that expects the shift to still be unflagged.
export async function runShiftTick(force = false): Promise<void> {
  try {
    if (!force && !(await acquireTickSlot("shifts", 30_000))) return;
    const cutoff = new Date(Date.now() - MAX_SHIFT_HOURS * 60 * 60_000);
    const stale = await prisma.shift.findMany({
      where: { ...activeShiftWhere, shiftIn: { lte: cutoff } },
      select: { id: true, blockId: true, guard: { select: { name: true } }, block: { select: { name: true } } },
    });

    for (const s of stale) {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.shift.updateMany({ where: { id: s.id, ...activeShiftWhere }, data: { flag: "MissedLogout" } });
        if (claimed.count === 0) return;

        // The block's wardens. If the block has none (for example the warden was just removed), the chief warden
        // hears about it instead, so the flag never goes unseen.
        const wardens = await tx.blockWarden.findMany({ where: { blockId: s.blockId, removedAt: null }, select: { warden: { select: { userId: true } } } });
        let recipients = wardens.map((w) => w.warden.userId);
        if (recipients.length === 0) {
          recipients = (await tx.user.findMany({ where: { role: "ChiefWarden", isActive: true, deletedAt: null }, select: { id: true } })).map((u) => u.id);
        }
        for (const recipientId of recipients) {
          await notify(tx, {
            recipientId,
            category: "Shift",
            title: `Shift not ended in Block ${s.block.name}`,
            body: `${s.guard.name} has been on shift for more than ${MAX_SHIFT_HOURS} hours without ending it. Please set the end time.`,
            linkEntity: "Shift",
            linkId: s.id,
          });
        }
      });
    }
  } catch (error) {
    console.error("shift tick failed", error);
  }
}

// What the dashboards show about shifts. null = this role has no shift card.
export type ShiftSummary =
  | { kind: "guard"; onShift: { blockName: string; shiftIn: string } | null; blockCount: number }
  | { kind: "manager"; onShift: number; needsReview: number };

export async function shiftSummary(user: SessionUser): Promise<ShiftSummary | null> {
  if (user.role === "Security") {
    const guard = await prisma.securityGuard.findFirst({ where: { userId: user.id, deletedAt: null }, select: { id: true } });
    const [shift, blocks] = await Promise.all([
      guard ? prisma.shift.findFirst({ where: { guardId: guard.id, ...activeShiftWhere }, select: { shiftIn: true, block: { select: { name: true } } } }) : null,
      securityBlocks(user.id),
    ]);
    return { kind: "guard", onShift: shift ? { blockName: shift.block.name, shiftIn: shift.shiftIn.toISOString() } : null, blockCount: blocks.length };
  }
  if (user.role === "Warden" || user.role === "ChiefWarden") {
    const blockIds = await managedBlockIds(user);
    const [onShift, needsReview] = await Promise.all([
      prisma.shift.count({ where: { blockId: { in: blockIds }, ...activeShiftWhere } }),
      prisma.shift.count({ where: { blockId: { in: blockIds }, flag: "MissedLogout", shiftOut: null } }),
    ]);
    return { kind: "manager", onShift, needsReview };
  }
  return null;
}
