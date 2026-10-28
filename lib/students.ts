import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/errors";
import type { SessionUser, StudentDTO } from "@/lib/types";

export const studentSelect = {
  id: true,
  rollNumber: true,
  name: true,
  gender: true,
  course: true,
  year: true,
  phone: true,
  whatsappNumber: true,
  user: { select: { email: true } },
  room: { select: { id: true, roomNumber: true, block: { select: { id: true, name: true } } } },
  parent: { select: { name: true, phone: true, email: true } },
  secondaryContact: { select: { name: true, phone: true, email: true } },
} satisfies Prisma.StudentSelect;

type Row = Prisma.StudentGetPayload<{ select: typeof studentSelect }>;

export function toStudentDTO(s: Row): StudentDTO {
  const { user, ...rest } = s;
  return { ...rest, email: user.email };
}

// Chief wardens see everyone. Wardens see students in their blocks plus unallocated students
// (needed so they can create a student first and allocate them afterwards).
export function studentScope(user: SessionUser): Prisma.StudentWhereInput {
  if (user.role === "ChiefWarden") return {};
  return { OR: [{ roomId: null }, { room: { blockId: { in: user.blockIds } } }] };
}

export function assertStudentAccess(user: SessionUser, student: { room: { blockId: string } | null }) {
  if (user.role === "ChiefWarden") return;
  if (!student.room || user.blockIds.includes(student.room.blockId)) return;
  throw new ApiError(403, "This student is not in one of your blocks");
}

export function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
