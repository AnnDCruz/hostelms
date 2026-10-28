import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, fromError, notFound, ok } from "@/lib/api";
import { assertBlockAccess } from "@/lib/rooms";
import type { RoomHistoryDTO } from "@/lib/types";

const ids = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => !!v))];

// Room history, newest first, with names resolved for display.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("rooms", g.user.role);
  if (blocked) return blocked;

  try {
    const room = await prisma.room.findFirst({ where: { id, deletedAt: null }, select: { blockId: true } });
    if (!room) return notFound("Room not found");
    assertBlockAccess(g.user, room.blockId);

    const rows = await prisma.roomHistory.findMany({ where: { roomId: id }, orderBy: { createdAt: "desc" }, take: 30 });
    const [students, actors] = await Promise.all([
      prisma.student.findMany({ where: { id: { in: ids(rows.map((r) => r.studentId)) } }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { id: { in: ids(rows.map((r) => r.actorId)) } }, select: { id: true, email: true } }),
    ]);

    const data: RoomHistoryDTO[] = rows.map((r) => ({
      id: r.id,
      event: r.event,
      reason: r.reason,
      note: r.note,
      staffName: r.staffName,
      studentName: students.find((s) => s.id === r.studentId)?.name ?? null,
      actor: actors.find((a) => a.id === r.actorId)?.email ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
