import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertFeature, assertRole, fromError, ok } from "@/lib/api";
import { byLabel, canEmpty, canRestart, canStart, laundryAccess, runLaundryTick } from "@/lib/laundry";
import type { LaundryDTO } from "@/lib/types";

const FEED_LIMIT = 40;

// Everything the laundry page needs in one call: the rooms this person can see, each with its machines
// (and the one active session on each) and the recent feed. Polled every few seconds by the page.
export async function GET() {
  const g = await assertRole([Role.Student, Role.Warden, Role.ChiefWarden]);
  if ("error" in g) return g.error;
  const blocked = await assertFeature("laundry", g.user.role);
  if (blocked) return blocked;

  try {
    // Move any due timers forward first, so what we return is current.
    await runLaundryTick();

    const { roomIds, student } = await laundryAccess(g.user);
    const isManager = g.user.role !== Role.Student;
    const viewerStudentId = student?.studentId ?? null;

    const rooms = await prisma.laundryRoom.findMany({
      where: { id: { in: roomIds } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        machines: {
          where: { deletedAt: null },
          select: {
            id: true,
            type: true,
            label: true,
            state: true,
            sessions: {
              where: { endedAt: null },
              take: 1,
              select: {
                id: true,
                studentId: true,
                durationMinutes: true,
                startedAt: true,
                endsAt: true,
                gracePeriodEndsAt: true,
                graceStage: true,
                isRestartedByOther: true,
                student: { select: { name: true } },
                restartedBy: { select: { name: true } },
              },
            },
          },
        },
        feedEntries: {
          orderBy: { createdAt: "desc" },
          take: FEED_LIMIT,
          select: { id: true, messageType: true, message: true, createdAt: true },
        },
      },
    });

    const data: LaundryDTO = {
      serverTime: new Date().toISOString(),
      rooms: rooms.map((room) => {
        // Which machine types this student already has clothes in (one washer and one dryer at a time).
        const busyTypes = new Set(
          viewerStudentId ? room.machines.filter((m) => m.sessions[0]?.studentId === viewerStudentId).map((m) => m.type) : [],
        );

        return {
          id: room.id,
          name: room.name,
          feed: room.feedEntries.map((f) => ({ id: f.id, messageType: f.messageType, message: f.message, createdAt: f.createdAt.toISOString() })),
          machines: [...room.machines].sort((a, b) => a.type.localeCompare(b.type) || byLabel(a, b)).map((m) => {
            const s = m.sessions[0] ?? null;
            return {
              id: m.id,
              type: m.type,
              label: m.label,
              state: m.state,
              session: s
                ? {
                    id: s.id,
                    ownerName: s.student.name,
                    isMine: s.studentId === viewerStudentId,
                    durationMinutes: s.durationMinutes,
                    startedAt: s.startedAt.toISOString(),
                    endsAt: s.endsAt.toISOString(),
                    gracePeriodEndsAt: s.gracePeriodEndsAt?.toISOString() ?? null,
                    graceStage: s.graceStage,
                    isRestartedByOther: s.isRestartedByOther,
                    restartedByName: s.restartedBy?.name ?? null,
                  }
                : null,
              actions: {
                start: !!viewerStudentId && canStart(m, busyTypes.has(m.type)),
                restart: canRestart(m, s, viewerStudentId),
                empty: canEmpty(m, s, viewerStudentId),
                maintenance: isManager ? (m.state === "Free" ? ("on" as const) : m.state === "Maintenance" ? ("off" as const) : null) : null,
              },
            };
          }),
        };
      }),
    };
    return ok(data);
  } catch (error) {
    return fromError(error);
  }
}
