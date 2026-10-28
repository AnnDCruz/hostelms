import { GatepassStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, notFound, ok, serverError } from "@/lib/api";
import { audit, notify } from "@/lib/events";
import { gatepassWhere } from "@/lib/gatepass";
import { createGatepassSchema } from "@/lib/validators/gatepass";

export async function GET(req: Request) {
  const g = await assertRole(["Student", "Parent", "Warden", "ChiefWarden", "Security", "Admin"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("gatepass", g.user.role);
  if (blocked) return blocked;

  const where = gatepassWhere(g.user);
  if (!where) return forbidden();

  const statusParam = new URL(req.url).searchParams.get("status");
  const status = Object.values(GatepassStatus).find((s) => s === statusParam);

  try {
    const rows = await prisma.gatepass.findMany({
      where: { ...where, deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        departureTime: true,
        expectedReturnTime: true,
        reason: true,
        createdAt: true,
        parentApprovedAt: true,
        wardenApprovedAt: true,
        student: { select: { name: true, rollNumber: true, room: { select: { roomNumber: true } } } },
        block: { select: { name: true } },
      },
    });
    return ok(rows);
  } catch (error) {
    console.error(error);
    return serverError();
  }
}

export async function POST(req: Request) {
  const g = await assertRole(["Student"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("gatepass", g.user.role);
  if (blocked) return blocked;

  const parsed = createGatepassSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);
  }

  const student = await prisma.student.findFirst({
    where: { userId: g.user.id, deletedAt: null },
    include: { room: true, parent: true },
  });
  if (!student) return notFound("Student profile not found");
  if (!student.room) return badRequest("You have no room allocated yet");

  const blockId = student.room.blockId;
  const parentUserId = student.parent?.userId;
  const { departureTime, expectedReturnTime, reason } = parsed.data;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const gp = await tx.gatepass.create({
        data: { studentId: student.id, blockId, date: departureTime, departureTime, expectedReturnTime, reason },
      });
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "GATEPASS_REQUESTED",
        targetEntity: "Gatepass",
        targetId: gp.id,
      });
      if (parentUserId) {
        await notify(tx, {
          recipientId: parentUserId,
          category: "Gatepass",
          title: "Gate pass needs your approval",
          body: `${student.name} has requested a gate pass.`,
          linkEntity: "Gatepass",
          linkId: gp.id,
        });
      }
      return gp;
    });
    return ok(created, 201);
  } catch (error) {
    console.error(error);
    return serverError();
  }
}
