import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/types";

// Which gatepasses a role may see. null = no access.
export function gatepassWhere(user: SessionUser): Prisma.GatepassWhereInput | null {
  switch (user.role) {
    case "Student":
      return { student: { userId: user.id } };
    case "Parent":
      return { student: { parent: { userId: user.id } } };
    case "Warden":
    case "Security":
      return { blockId: { in: user.blockIds } };
    case "ChiefWarden":
    case "Admin":
      return {};
    default:
      return null;
  }
}
