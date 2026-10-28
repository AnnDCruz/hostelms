import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, fromError, notFound, ok } from "@/lib/api";
import { audit } from "@/lib/events";
import { assertBlockAccess } from "@/lib/rooms";
import { ApiError } from "@/lib/errors";
import { createRoomSchema } from "@/lib/validators/rooms";

export async function GET(req: Request) {
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("rooms", g.user.role);
  if (blocked) return blocked;

  const blockId = new URL(req.url).searchParams.get("blockId");
  if (!blockId) return badRequest("blockId is required");

  try {
    assertBlockAccess(g.user, blockId);
    const rooms = await prisma.room.findMany({
      where: { blockId, deletedAt: null },
      select: {
        id: true,
        blockId: true,
        roomNumber: true,
        floor: true,
        state: true,
        blockedReason: true,
        blockedAt: true,
        student: { select: { id: true, name: true, rollNumber: true } },
        staffOccupant: { select: { name: true, designation: true, phone: true } },
      },
    });
    rooms.sort((a, b) => a.floor - b.floor || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));
    return ok(rooms);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(req: Request) {
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("rooms", g.user.role);
  if (blocked) return blocked;

  const parsed = createRoomSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);
  const { blockId, roomNumber, floor } = parsed.data;

  try {
    assertBlockAccess(g.user, blockId);
    const block = await prisma.block.findUnique({ where: { id: blockId }, select: { name: true } });
    if (!block) return notFound("Block not found");

    const existing = await prisma.room.findFirst({ where: { blockId, roomNumber } });
    if (existing) throw new ApiError(409, `Room ${block.name}-${roomNumber} already exists`);

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.room.create({ data: { blockId, roomNumber, floor } });
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "ROOM_CREATED",
        targetEntity: "Room",
        targetId: created.id,
        snapshot: { block: block.name, roomNumber, floor },
      });
      return created;
    });
    return ok(room, 201);
  } catch (error) {
    return fromError(error);
  }
}
