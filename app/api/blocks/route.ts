import type { RoomState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole, fromError, ok } from "@/lib/api";
import { LOCATION_ID } from "@/lib/constants";
import type { BlockDTO } from "@/lib/types";

export async function GET() {
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  // Deliberately not feature-gated: it is a lookup shared by rooms, notices and other modules.

  try {
    const blocks = await prisma.block.findMany({
      where: g.user.role === "ChiefWarden" ? { locationId: LOCATION_ID } : { id: { in: g.user.blockIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, gender: true },
    });

    const grouped = await prisma.room.groupBy({
      by: ["blockId", "state"],
      where: { blockId: { in: blocks.map((b) => b.id) }, deletedAt: null },
      _count: { _all: true },
    });

    const data: BlockDTO[] = blocks.map((b) => {
      const counts: Record<RoomState, number> = { Vacant: 0, Occupied: 0, Blocked: 0, Staff: 0 };
      for (const row of grouped) if (row.blockId === b.id) counts[row.state] = row._count._all;
      return { ...b, counts };
    });
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
