import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, fromError, notFound, ok } from "@/lib/api";
import type { MyProfileDTO } from "@/lib/types";

export async function GET() {
  const g = await assertRole(["Student"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("profile", g.user.role);
  if (blocked) return blocked;

  try {
    const s = await prisma.student.findFirst({
      where: { userId: g.user.id, deletedAt: null },
      select: {
        id: true,
        rollNumber: true,
        name: true,
        gender: true,
        course: true,
        year: true,
        phone: true,
        whatsappNumber: true,
        user: { select: { email: true } },
        room: { select: { roomNumber: true, floor: true, block: { select: { name: true } } } },
      },
    });
    if (!s) return notFound("Student profile not found");
    const { user, ...rest } = s;
    const data: MyProfileDTO = { ...rest, email: user.email };
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
