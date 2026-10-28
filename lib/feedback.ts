import type { Prisma } from "@prisma/client";
import { managedBlockIds } from "@/lib/scope";
import type { FeedbackDTO, SessionUser } from "@/lib/types";

export async function feedbackWhere(user: SessionUser): Promise<Prisma.FeedbackWhereInput | null> {
  switch (user.role) {
    case "Student":
      return { student: { userId: user.id } };
    case "Parent":
      return { parent: { userId: user.id } };
    case "Warden":
      return { blockId: { in: await managedBlockIds(user) } };
    case "ChiefWarden":
      return {};
    default:
      return null;
  }
}

export const feedbackSelect = {
  id: true,
  body: true,
  status: true,
  createdAt: true,
  acknowledgedAt: true,
  inReviewAt: true,
  escalatedAt: true,
  resolvedAt: true,
  chiefWardenResolvedAt: true,
  escalationNote: true,
  block: { select: { name: true } },
  student: { select: { name: true, rollNumber: true } },
  parent: { select: { name: true, student: { select: { name: true } } } },
  warden: { select: { name: true } },
} satisfies Prisma.FeedbackSelect;

type Row = Prisma.FeedbackGetPayload<{ select: typeof feedbackSelect }>;

const iso = (d: Date | null) => d?.toISOString() ?? null;

// `staff` is true for wardens and the chief warden. Students and parents never receive the internal note.
export function toFeedbackDTO(f: Row, staff: boolean): FeedbackDTO {
  const byStudent = !!f.student;
  return {
    id: f.id,
    body: f.body,
    status: f.status,
    createdAt: f.createdAt.toISOString(),
    acknowledgedAt: iso(f.acknowledgedAt),
    inReviewAt: iso(f.inReviewAt),
    escalatedAt: iso(f.escalatedAt),
    resolvedAt: iso(f.resolvedAt),
    chiefWardenResolvedAt: iso(f.chiefWardenResolvedAt),
    blockName: f.block.name,
    submittedBy: f.student
      ? `${f.student.name} (${f.student.rollNumber})`
      : f.parent
        ? `${f.parent.name}, parent of ${f.parent.student.name}`
        : "Unknown",
    submitterKind: byStudent ? "Student" : "Parent",
    wardenName: f.warden?.name ?? null,
    escalationNote: staff ? f.escalationNote : null,
  };
}
