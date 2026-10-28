import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, forbidden, fromError, notFound, ok } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { audit } from "@/lib/events";
import { laundryAccess, loadMachine } from "@/lib/laundry";
import { maintenanceSchema } from "@/lib/validators/laundry";

// A warden takes a free machine out of service, or puts it back. A machine in use is never pulled mid-cycle.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole([Role.Warden, Role.ChiefWarden]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("laundry", g.user.role);
  if (blocked) return blocked;

  const parsed = maintenanceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("maintenance must be true or false");
  const { maintenance } = parsed.data;

  try {
    const machine = await loadMachine(id);
    if (!machine) return notFound("Machine not found");
    const { roomIds } = await laundryAccess(g.user);
    if (!roomIds.includes(machine.laundryRoomId)) return forbidden("This machine is not in a laundry room you manage");

    await prisma.$transaction(async (tx) => {
      const updated = await tx.machine.updateMany({
        where: { id: machine.id, deletedAt: null, state: maintenance ? "Free" : "Maintenance" },
        data: { state: maintenance ? "Maintenance" : "Free" },
      });
      if (updated.count === 0) {
        throw new ApiError(409, maintenance ? "Only a free machine can be taken out of service. Wait until it is empty." : "This machine is not under maintenance.");
      }
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: maintenance ? "LAUNDRY_MACHINE_MAINTENANCE_ON" : "LAUNDRY_MACHINE_MAINTENANCE_OFF",
        targetEntity: "Machine",
        targetId: machine.id,
        snapshot: { label: machine.label },
      });
    });
    return ok({ state: maintenance ? "Maintenance" : "Free" });
  } catch (error) {
    return fromError(error);
  }
}
