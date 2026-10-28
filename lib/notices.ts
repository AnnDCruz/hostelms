import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { managedBlockIds } from "@/lib/scope";
import type { NoticeDTO, SessionUser } from "@/lib/types";

// Which notices a role may see. Students never see expired ones; staff still do (marked Expired).
export async function noticeWhere(user: SessionUser): Promise<Prisma.NoticeWhereInput | null> {
  switch (user.role) {
    case "Student":
      return {
        blocks: { some: { block: { rooms: { some: { student: { userId: user.id } } } } } },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      };
    case "Warden":
      return { blocks: { some: { blockId: { in: await managedBlockIds(user) } } } };
    case "ChiefWarden":
      return {};
    default:
      return null;
  }
}

export const noticeSelect = {
  id: true,
  title: true,
  body: true,
  expiresAt: true,
  createdAt: true,
  wardenId: true,
  postedByUserId: true,
  warden: { select: { name: true } },
  blocks: { select: { block: { select: { id: true, name: true } } } },
  _count: { select: { comments: true } },
} satisfies Prisma.NoticeSelect;

type Row = Prisma.NoticeGetPayload<{ select: typeof noticeSelect }>;

export function toNoticeDTO(n: Row, user: SessionUser): NoticeDTO {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    expiresAt: n.expiresAt?.toISOString() ?? null,
    expired: !!n.expiresAt && n.expiresAt < new Date(),
    createdAt: n.createdAt.toISOString(),
    postedBy: n.warden?.name ?? "Chief warden",
    postedByRole: n.wardenId ? "Warden" : "ChiefWarden",
    blocks: n.blocks.map((b) => b.block).sort((a, b) => a.name.localeCompare(b.name)),
    commentCount: n._count.comments,
    // The chief warden can delete any notice. A warden can delete only their own.
    canDelete: user.role === "ChiefWarden" || n.postedByUserId === user.id,
  };
}

// Notification filter: students must not see notifications about notices that have expired.
// Notification.linkId is a plain string (no relation), so we look up the expired notice IDs first.
// Other roles are unaffected.
export async function notificationVisibility(user: SessionUser): Promise<Prisma.NotificationWhereInput> {
  if (user.role !== "Student") return {};
  const expired = await prisma.notice.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true },
  });
  if (expired.length === 0) return {};
  return { NOT: { linkEntity: "Notice", linkId: { in: expired.map((n) => n.id) } } };
}
