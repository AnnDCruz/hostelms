import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, fromError, notFound, ok } from "@/lib/api";
import { audit } from "@/lib/events";
import { ApiError } from "@/lib/errors";
import { assertStudentAccess, defined } from "@/lib/students";
import { updateOwnProfileSchema, updateStudentSchema } from "@/lib/validators/students";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await assertRole(["Student", "Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature(g.user.role === "Student" ? "profile" : "students", g.user.role);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);

  try {
    // Students: own phone numbers only.
    if (g.user.role === "Student") {
      const parsed = updateOwnProfileSchema.safeParse(body);
      if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);
      const own = await prisma.student.findFirst({ where: { id, userId: g.user.id, deletedAt: null }, select: { id: true } });
      if (!own) throw new ApiError(403, "You can only edit your own profile");
      await prisma.$transaction(async (tx) => {
        await tx.student.update({ where: { id }, data: defined(parsed.data) });
        await audit(tx, { actorId: g.user.id, actorRole: g.user.role, action: "STUDENT_SELF_UPDATED", targetEntity: "Student", targetId: id });
      });
      return ok({ done: true });
    }

    const parsed = updateStudentSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);
    const d = parsed.data;

    const student = await prisma.student.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, roomId: true, room: { select: { blockId: true } } },
    });
    if (!student) return notFound("Student not found");
    assertStudentAccess(g.user, student);
    if (d.gender && student.roomId) throw new ApiError(409, "Vacate the student before changing gender");

    const data: Prisma.StudentUpdateInput = defined({
      name: d.name,
      gender: d.gender,
      course: d.course,
      year: d.year,
      phone: d.phone,
      whatsappNumber: d.whatsappNumber,
    });

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) await tx.student.update({ where: { id }, data });
      if (d.parent) {
        const parentData = defined({ name: d.parent.name, phone: d.parent.phone });
        if (Object.keys(parentData).length) await tx.parent.updateMany({ where: { studentId: id }, data: parentData });
      }
      if (d.secondaryContact) {
        const sc = defined(d.secondaryContact);
        await tx.secondaryContact.upsert({
          where: { studentId: id },
          update: sc,
          create: { studentId: id, ...sc },
        });
      }
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "STUDENT_UPDATED",
        targetEntity: "Student",
        targetId: id,
        snapshot: { fields: Object.keys(d) },
      });
    });
    return ok({ done: true });
  } catch (error) {
    return fromError(error);
  }
}
