import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Gender, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, badRequest, fromError, ok } from "@/lib/api";
import { audit } from "@/lib/events";
import { ApiError } from "@/lib/errors";
import { createInviteToken, sendInvite } from "@/lib/invites";
import { studentScope, studentSelect, toStudentDTO } from "@/lib/students";
import { createStudentSchema } from "@/lib/validators/students";

export async function GET(req: Request) {
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("students", g.user.role);
  if (blocked) return blocked;

  const q = new URL(req.url).searchParams;
  const search = q.get("search")?.trim();
  const gender = Object.values(Gender).find((x) => x === q.get("gender"));

  const filters: Prisma.StudentWhereInput[] = [studentScope(g.user)];
  if (q.get("unallocated") === "true") filters.push({ roomId: null });
  if (gender) filters.push({ gender });
  if (search) {
    filters.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { rollNumber: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  try {
    const rows = await prisma.student.findMany({
      where: { deletedAt: null, AND: filters },
      orderBy: { name: "asc" },
      take: 100,
      select: studentSelect,
    });
    return ok(rows.map(toStudentDTO));
  } catch (error) {
    return fromError(error);
  }
}

// Creates the student and parent logins together. Neither gets a usable password:
// each receives an emailed link to choose their own.
export async function POST(req: Request) {
  const g = await assertRole(["Warden", "ChiefWarden"]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("students", g.user.role);
  if (blocked) return blocked;

  const parsed = createStudentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid request", parsed.error.issues);
  const d = parsed.data;

  if (d.email === d.parent.email) return badRequest("Student and parent need different email addresses");

  try {
    const [existingUsers, existingRoll] = await Promise.all([
      prisma.user.findMany({ where: { email: { in: [d.email, d.parent.email] } }, select: { email: true } }),
      prisma.student.findUnique({ where: { rollNumber: d.rollNumber }, select: { id: true } }),
    ]);
    if (existingUsers[0]) throw new ApiError(409, `${existingUsers[0].email} already has an account`);
    if (existingRoll) throw new ApiError(409, "That roll number already exists");

    const unusablePassword = await bcrypt.hash(randomBytes(24).toString("hex"), 10);

    const created = await prisma.$transaction(async (tx) => {
      const studentUser = await tx.user.create({ data: { email: d.email, role: "Student", passwordHash: unusablePassword } });
      const parentUser = await tx.user.create({ data: { email: d.parent.email, role: "Parent", passwordHash: unusablePassword } });
      const student = await tx.student.create({
        data: {
          userId: studentUser.id,
          rollNumber: d.rollNumber,
          name: d.name,
          gender: d.gender,
          course: d.course ?? null,
          year: d.year ?? null,
          phone: d.phone ?? null,
          whatsappNumber: d.whatsappNumber ?? null,
        },
      });
      await tx.parent.create({
        data: {
          userId: parentUser.id,
          studentId: student.id,
          name: d.parent.name,
          phone: d.parent.phone ?? null,
          email: d.parent.email,
        },
      });
      if (d.secondaryContact && (d.secondaryContact.name || d.secondaryContact.phone || d.secondaryContact.email)) {
        await tx.secondaryContact.create({
          data: {
            studentId: student.id,
            name: d.secondaryContact.name ?? null,
            phone: d.secondaryContact.phone ?? null,
            email: d.secondaryContact.email ?? null,
          },
        });
      }
      const studentToken = await createInviteToken(tx, studentUser.id);
      const parentToken = await createInviteToken(tx, parentUser.id);
      await audit(tx, {
        actorId: g.user.id,
        actorRole: g.user.role,
        action: "STUDENT_CREATED",
        targetEntity: "Student",
        targetId: student.id,
      });
      return { id: student.id, studentToken, parentToken };
    });

    let emailed = false;
    try {
      const results = await Promise.all([
        sendInvite(d.email, d.name, created.studentToken),
        sendInvite(d.parent.email, d.parent.name, created.parentToken),
      ]);
      emailed = results.every(Boolean);
    } catch (error) {
      console.error("Invite email failed", error);
    }
    return ok({ id: created.id, emailed }, 201);
  } catch (error) {
    return fromError(error);
  }
}
