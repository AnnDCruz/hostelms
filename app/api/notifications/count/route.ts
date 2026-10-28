import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole, fromError, ok } from "@/lib/api";
import { notificationVisibility } from "@/lib/notices";
import { runLaundryTick } from "@/lib/laundry";
import { runShiftTick } from "@/lib/shifts";

export async function GET() {
  const g = await assertRole(Object.values(Role));
  if ("error" in g) return g.error;
  try {
    // Every signed-in browser polls this, so it doubles as the heartbeat that advances laundry timers
    // (5-minute warnings, "collect your clothes") even when the owner is not on the laundry page.
    // The tick is throttled and never throws.
    await runLaundryTick();
    // Same for guards who forgot to end a shift: the block's warden is told even if nobody opens the shifts page.
    await runShiftTick();
    const unread = await prisma.notification.count({ where: { recipientId: g.user.id, isRead: false, ...(await notificationVisibility(g.user)) } });
    return ok({ unread });
  } catch (error) {
    return fromError(error);
  }
}
