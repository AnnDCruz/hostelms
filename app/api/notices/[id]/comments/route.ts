import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { notifyMany } from "@/lib/events";
import { noticeWhere } from "@/lib/notices";
import { commentSchema } from "@/lib/validators/notices";

// Students, wardens and the chief warden can comment on a notice they can see, and reply to a comment.
// Threads are one level deep: a reply to a reply is attached to the original comment.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Student", "Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("notices", g.user.role);
  if (blocked) return blocked;

  const parsed = commentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);

  try {
    const scope = await noticeWhere(g.user);
    if (!scope) return forbidden();
    const notice = await prisma.notice.findFirst({
      where: { AND: [{ id }, scope] },
      select: { id: true, title: true, postedByUserId: true },
    });
    if (!notice) return notFound("Notice not found");

    let topLevel: { id: string; authorUserId: string } | null = null;
    if (parsed.data.parentId) {
      const target = await prisma.noticeComment.findFirst({
        where: { id: parsed.data.parentId, noticeId: id },
        select: { id: true, parentId: true, authorUserId: true },
      });
      if (!target) return notFound("The comment you are replying to no longer exists");
      topLevel = target.parentId
        ? await prisma.noticeComment.findUnique({ where: { id: target.parentId }, select: { id: true, authorUserId: true } })
        : { id: target.id, authorUserId: target.authorUserId };
    }

    let authorName = "Chief warden";
    let studentId: string | null = null;
    if (g.user.role === "Student") {
      const s = await prisma.student.findFirst({ where: { userId: g.user.id, deletedAt: null }, select: { id: true, name: true } });
      if (!s) return notFound("Student profile not found");
      authorName = s.name;
      studentId = s.id;
    } else if (g.user.role === "Warden") {
      const w = await prisma.warden.findFirst({ where: { userId: g.user.id, deletedAt: null }, select: { name: true } });
      if (!w) return forbidden("Warden profile not found");
      authorName = w.name;
    }

    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.noticeComment.create({
        data: {
          noticeId: id,
          studentId,
          authorUserId: g.user.id,
          authorRole: g.user.role,
          authorName,
          parentId: topLevel?.id ?? null,
          body: parsed.data.body,
        },
        select: { id: true, body: true, createdAt: true, authorName: true, authorRole: true, parentId: true },
      });
      // Tell the person being replied to and whoever posted the notice (never yourself).
      const recipients = [notice.postedByUserId, topLevel?.authorUserId].filter((x): x is string => !!x && x !== g.user.id);
      await notifyMany(tx, recipients, {
        category: "System",
        title: topLevel ? "New reply on a notice" : "New comment on your notice",
        body: `${authorName} on "${notice.title}": ${parsed.data.body.slice(0, 80)}`,
        linkEntity: "Notice",
        linkId: id,
      });
      return created;
    });
    return ok({ ...comment, createdAt: comment.createdAt.toISOString() }, 201);
  } catch (error) {
    return fromError(error);
  }
}
