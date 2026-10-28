import type { Prisma, PrismaClient } from "@prisma/client";
import { LOCATION_ID } from "@/lib/constants";
import { notify } from "@/lib/events";
import type { SessionUser } from "@/lib/types";

// Which maintenance requests a role may see. null = no access.
export function maintenanceWhere(user: SessionUser): Prisma.MaintenanceRequestWhereInput | null {
  switch (user.role) {
    case "Student":
      return { student: { userId: user.id } };
    case "Warden":
    case "Security":
      return { blockId: { in: user.blockIds } };
    case "Facilities":
    case "ChiefWarden":
    case "Admin":
      return {};
    default:
      return null;
  }
}

// Tells every facilities staff member at the location about a new or reopened request.
export async function notifyFacilities(
  db: Prisma.TransactionClient | PrismaClient,
  input: { title: string; body: string; requestId: string },
) {
  const staff = await db.facilitiesStaff.findMany({
    where: { locationId: LOCATION_ID, deletedAt: null },
    select: { userId: true },
  });
  for (const s of staff) {
    await notify(db, {
      recipientId: s.userId,
      category: "Maintenance",
      title: input.title,
      body: input.body,
      linkEntity: "MaintenanceRequest",
      linkId: input.requestId,
    });
  }
}
