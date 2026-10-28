import { Role, type MachineType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/events";
import { byLabel, laundryAccess, labelNumber } from "@/lib/laundry";
import { configSchema } from "@/lib/validators/laundry";

// A warden sets how many washers and dryers a laundry room has.
// Adding creates machines with the next free number. Removing retires the highest-numbered machines that are
// not in use (rows are kept, because past sessions point at them); it refuses if too many are busy.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole([Role.Warden, Role.ChiefWarden]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("laundry", g.user.role);
  if (blocked) return blocked;

  const parsed = configSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid machine counts");
  const targets: Record<MachineType, number> = { Washer: parsed.data.washers, Dryer: parsed.data.dryers };

  try {
    const room = await prisma.laundryRoom.findUnique({ where: { id }, select: { id: true } });
    if (!room) return notFound("Laundry room not found");
    const { roomIds } = await laundryAccess(g.user);
    if (!roomIds.includes(room.id)) return forbidden("You do not manage this laundry room");

    const result = await prisma.$transaction(async (tx) => {
      const all = await tx.machine.findMany({ where: { laundryRoomId: room.id }, select: { id: true, type: true, label: true, state: true, deletedAt: true } });
      const changes: Record<string, { from: number; to: number }> = {};

      for (const type of ["Washer", "Dryer"] as const) {
        const ofType = all.filter((m) => m.type === type);
        const active = ofType.filter((m) => !m.deletedAt);
        const target = targets[type];
        changes[type] = { from: active.length, to: target };

        if (target > active.length) {
          // Numbering continues past retired machines too, so a label is never reused.
          let next = Math.max(0, ...ofType.map((m) => labelNumber(m.label))) + 1;
          await tx.machine.createMany({
            data: Array.from({ length: target - active.length }, () => ({ laundryRoomId: room.id, type, label: `${type} ${next++}` })),
          });
        } else if (target < active.length) {
          const removable = active
            .filter((m) => m.state === "Free" || m.state === "Maintenance")
            // Broken machines go first, then the highest-numbered ones.
            .sort((a, b) => Number(b.state === "Maintenance") - Number(a.state === "Maintenance") || byLabel(b, a));
          const needed = active.length - target;
          if (removable.length < needed) {
            throw new ApiError(409, `Cannot reduce ${type.toLowerCase()}s to ${target}: only ${removable.length} of them are idle right now. Try again when machines are free.`);
          }
          const ids = removable.slice(0, needed).map((m) => m.id);
          const retired = await tx.machine.updateMany({
            where: { id: { in: ids }, deletedAt: null, state: { in: ["Free", "Maintenance"] } },
            data: { deletedAt: new Date() },
          });
          if (retired.count !== needed) throw new ApiError(409, "A machine was started just now. Refresh and try again.");
        }
      }

      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "LAUNDRY_CONFIG_CHANGED",
        targetEntity: "LaundryRoom",
        targetId: room.id,
        snapshot: changes,
      });
      return changes;
    });
    return ok(result);
  } catch (error) {
    return fromError(error);
  }
}
