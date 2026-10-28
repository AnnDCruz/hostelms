import { NotificationCategory, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole, fromError, ok } from "@/lib/api";
import type { NotificationPage } from "@/lib/types";
import { notificationVisibility } from "@/lib/notices";

// Your own notifications, newest first, with cursor pagination.
export async function GET(req: Request) {
  const g = await assertRole(Object.values(Role));
  if ("error" in g) return g.error;

  const q = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 20, 1), 50);
  const cursor = q.get("cursor");
  const category = Object.values(NotificationCategory).find((c) => c === q.get("category"));

  try {
    const rows = await prisma.notification.findMany({
      where: { recipientId: g.user.id, ...(category ? { category } : {}), ...(await notificationVisibility(g.user)) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, category: true, title: true, body: true, linkEntity: true, linkId: true, isRead: true, createdAt: true },
    });
    const page = rows.slice(0, limit);
    const data: NotificationPage = {
      items: page.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
