import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, ok } from "@/lib/api";
import { audit, notifyMany } from "@/lib/events";
import { noticeSelect, noticeWhere, toNoticeDTO } from "@/lib/notices";
import { managedBlockIds } from "@/lib/scope";
import { createNoticeSchema } from "@/lib/validators/notices";

export async function GET() {
  const g = await assertRole(["Student", "Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("notices", g.user.role);
  if (blocked) return blocked;

  try {
    const where = await noticeWhere(g.user);
    if (!where) return forbidden();
    const rows = await prisma.notice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: noticeSelect,
    });
    return ok(rows.map((n) => toNoticeDTO(n, g.user)));
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(req: Request) {
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("notices", g.user.role);
  if (blocked) return blocked;

  const parsed = createNoticeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);
  const d = parsed.data;

  try {
    // Wardens may post to their own blocks, the chief warden to any block.
    const allowed = await managedBlockIds(g.user);
    if (d.blockIds.some((id) => !allowed.includes(id))) return forbidden("You can only post to blocks you manage");

    const warden =
      g.user.role === "Warden" ? await prisma.warden.findFirst({ where: { userId: g.user.id, deletedAt: null }, select: { id: true } }) : null;
    if (g.user.role === "Warden" && !warden) return forbidden("Warden profile not found");

    const created = await prisma.$transaction(async (tx) => {
      const notice = await tx.notice.create({
        data: {
          title: d.title,
          body: d.body,
          expiresAt: d.expiresAt,
          postedByUserId: g.user.id,
          wardenId: warden?.id ?? null,
          blocks: { create: d.blockIds.map((blockId) => ({ blockId })) },
        },
      });
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "NOTICE_POSTED",
        targetEntity: "Notice",
        targetId: notice.id,
        snapshot: { title: d.title, blockIds: d.blockIds },
      });
      const students = await tx.student.findMany({
        where: { deletedAt: null, room: { blockId: { in: d.blockIds } } },
        select: { userId: true },
      });
      await notifyMany(tx, students.map((s) => s.userId), {
        category: "System",
        title: "New notice",
        body: d.title,
        linkEntity: "Notice",
        linkId: notice.id,
      });
      return notice;
    });
    return ok(created, 201);
  } catch (error) {
    return fromError(error);
  }
}
