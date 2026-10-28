import { prisma } from "@/lib/prisma";
import { LOCATION_ID } from "@/lib/constants";
import type { SessionUser } from "@/lib/types";

// Read live from the database (not the JWT) so a warden assigned to a new block
// can use it straight away, without signing out and back in.
export async function managedBlockIds(user: SessionUser): Promise<string[]> {
  if (user.role === "ChiefWarden") {
    const blocks = await prisma.block.findMany({ where: { locationId: LOCATION_ID }, select: { id: true } });
    return blocks.map((b) => b.id);
  }
  if (user.role === "Warden") {
    const rows = await prisma.blockWarden.findMany({
      where: { removedAt: null, warden: { userId: user.id } },
      select: { blockId: true },
    });
    return rows.map((r) => r.blockId);
  }
  return [];
}

export async function studentBlockId(userId: string) {
  const s = await prisma.student.findFirst({
    where: { userId, deletedAt: null },
    select: { room: { select: { blockId: true } } },
  });
  return s?.room?.blockId ?? null;
}

// Blocks a guard is currently assigned to, read live so a new assignment works without signing in again.
export async function securityBlocks(userId: string) {
  const rows = await prisma.blockSecurity.findMany({
    where: { removedAt: null, guard: { userId } },
    select: { block: { select: { id: true, name: true } } },
  });
  return rows.map((r) => r.block).sort((a, b) => a.name.localeCompare(b.name));
}
