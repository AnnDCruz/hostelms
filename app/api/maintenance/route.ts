import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { audit } from "@/lib/events";
import { maintenanceWhere, notifyFacilities } from "@/lib/maintenance";
import { createMaintenanceSchema } from "@/lib/validators/maintenance";

export async function GET() {
  const g = await assertRole(["Student", "Warden", "ChiefWarden", "Security", "Facilities", "Admin"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("maintenance", g.user.role);
  if (blocked) return blocked;

  const where = maintenanceWhere(g.user);
  if (!where) return forbidden();

  try {
    const rows = await prisma.maintenanceRequest.findMany({
      where: { ...where, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        description: true,
        pendingAt: true,
        inProgressAt: true,
        resolvedAt: true,
        reopenCount: true,
        lastReopenAt: true,
        createdAt: true,
        student: { select: { name: true, rollNumber: true } },
        room: { select: { roomNumber: true } },
        block: { select: { name: true } },
      },
    });
    return ok(rows);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(req: Request) {
  const g = await assertRole(["Student"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("maintenance", g.user.role);
  if (blocked) return blocked;

  const parsed = createMaintenanceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);

  try {
    const student = await prisma.student.findFirst({
      where: { userId: g.user.id, deletedAt: null },
      select: { id: true, name: true, roomId: true, room: { select: { blockId: true, roomNumber: true, block: { select: { name: true } } } } },
    });
    if (!student) return notFound("Student profile not found");
    if (!student.roomId || !student.room) return badRequest("You have no room allocated yet");

    const { roomId } = student;
    const { blockId, roomNumber, block } = student.room;

    const created = await prisma.$transaction(async (tx) => {
      const mr = await tx.maintenanceRequest.create({
        data: { studentId: student.id, roomId, blockId, description: parsed.data.description },
      });
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "MAINTENANCE_REQUESTED",
        targetEntity: "MaintenanceRequest",
        targetId: mr.id,
      });
      await notifyFacilities(tx, {
        title: "New maintenance request",
        body: `${student.name} (${block.name}-${roomNumber}): ${parsed.data.description.slice(0, 80)}`,
        requestId: mr.id,
      });
      return mr;
    });
    return ok(created, 201);
  } catch (error) {
    return fromError(error);
  }
}
