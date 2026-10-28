import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, fromError, forbidden, notFound, ok } from "@/lib/api";
import { audit } from "@/lib/events";
import { noticeSelect, noticeWhere, toNoticeDTO } from "@/lib/notices";
import type { NoticeCommentDTO, NoticeDetailDTO } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Student", "Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("notices", g.user.role);
  if (blocked) return blocked;

  try {
    const scope = await noticeWhere(g.user);
    if (!scope) return forbidden();
    const notice = await prisma.notice.findFirst({ where: { AND: [{ id }, scope] }, select: noticeSelect });
    if (!notice) return notFound("Notice not found");

    const comments = await prisma.noticeComment.findMany({
      where: { noticeId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, body: true, createdAt: true, authorName: true, authorRole: true, parentId: true },
    });
    const data: NoticeDetailDTO = {
      notice: toNoticeDTO(notice, g.user),
      comments: comments.map<NoticeCommentDTO>((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    };
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}

// The chief warden can delete any notice, a warden only their own. Deleting is permanent (comments go too).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("notices", g.user.role);
  if (blocked) return blocked;

  try {
    const notice = await prisma.notice.findUnique({ where: { id }, select: { title: true, postedByUserId: true } });
    if (!notice) return notFound("Notice not found");
    if (g.user.role === "Warden" && notice.postedByUserId !== g.user.id) return forbidden("You can only delete notices you posted");

    await prisma.$transaction(async (tx) => {
      await tx.notice.delete({ where: { id } });
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "NOTICE_DELETED",
        targetEntity: "Notice",
        targetId: id,
        snapshot: { title: notice.title },
      });
    });
    return ok({ done: true });
  } catch (error) {
    return fromError(error);
  }
}
