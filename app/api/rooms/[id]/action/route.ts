import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, fromError, ok } from "@/lib/api";
import {
  allocateStudent,
  assignStaff,
  blockRoom,
  removeStaff,
  transferStudent,
  unblockRoom,
  vacateRoom,
} from "@/lib/rooms";
import { roomActionSchema } from "@/lib/validators/rooms";

// One endpoint for every room state change. Each runs in a single transaction and writes
// room history, an audit row and (where relevant) a notification.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("rooms", g.user.role);
  if (blocked) return blocked;

  const parsed = roomActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);
  const a = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      switch (a.type) {
        case "allocate":
          return allocateStudent(tx, g.user, id, a.studentId);
        case "vacate":
          return vacateRoom(tx, g.user, id);
        case "transfer":
          return transferStudent(tx, g.user, id, a.targetRoomId);
        case "block":
          return blockRoom(tx, g.user, id, a.reason);
        case "unblock":
          return unblockRoom(tx, g.user, id, a.note);
        case "assignStaff":
          return assignStaff(tx, g.user, id, a);
        case "removeStaff":
          return removeStaff(tx, g.user, id);
      }
    });
    return ok({ done: true });
  } catch (error) {
    return fromError(error);
  }
}
