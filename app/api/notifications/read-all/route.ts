import { NotificationCategory, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole, fromError, ok } from "@/lib/api";

// Mark all your unread notifications as read, optionally only one category.
export async function POST(req: Request) {
  const g = await assertRole(Object.values(Role));
  if ("error" in g) return g.error;
  const body = (await req.json().catch(() => null)) as { category?: string } | null;
  const category = Object.values(NotificationCategory).find((c) => c === body?.category);
  try {
    const result = await prisma.notification.updateMany({
      where: { recipientId: g.user.id, isRead: false, ...(category ? { category } : {}) },
      data: { isRead: true },
    });
    return ok({ updated: result.count });
  } catch (error) {
    return fromError(error);
  }
}
