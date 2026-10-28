import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole, fromError, notFound, ok } from "@/lib/api";

// Mark one of your own notifications as read.
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(Object.values(Role));
  if ("error" in g) return g.error;
  try {
    const result = await prisma.notification.updateMany({ where: { id, recipientId: g.user.id }, data: { isRead: true } });
    if (result.count === 0) return notFound("Notification not found");
    return ok({ done: true });
  } catch (error) {
    return fromError(error);
  }
}
