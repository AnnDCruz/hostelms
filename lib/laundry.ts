import type { LaundryFeedEntryType, MachineState, MachineType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { acquireTickSlot } from "@/lib/tick-gate";
import { LOCATION_ID } from "@/lib/constants";
import { notify } from "@/lib/events";
import { managedBlockIds } from "@/lib/scope";
import type { SessionUser } from "@/lib/types";

type Db = Prisma.TransactionClient | PrismaClient;

// ─────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────

export const WARN_MINUTES = 5; // owner is warned this long before the timer ends
export const GRACE_MINUTES = 10; // time the owner gets to collect clothes after the timer ends
export const EXTRA_WAIT_MINUTES = 10; // additional wait when every dryer is busy

export const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

// Machine labels end in a number ("Washer 3"). Used to pick the next label and to sort naturally.
export const labelNumber = (label: string) => Number(/(\d+)\s*$/.exec(label)?.[1] ?? 0);
export const byLabel = (a: { label: string }, b: { label: string }) => labelNumber(a.label) - labelNumber(b.label) || a.label.localeCompare(b.label);

type ActiveSession = { studentId: string; graceStage: number } | null;

// These predicates are shared by the GET route (to tell the UI what to show) and by every action route
// (to enforce it), so the two can never disagree.
export function canStart(machine: { state: MachineState }, hasActiveOfSameType: boolean) {
  return machine.state === "Free" && !hasActiveOfSameType;
}

// A dryer in its grace period can be restarted by its owner or by any other student in the room.
export function canRestart(machine: { type: MachineType; state: MachineState }, session: ActiveSession, viewerStudentId: string | null) {
  return !!viewerStudentId && !!session && machine.type === "Dryer" && machine.state === "GracePeriod";
}

// The owner can empty their machine once it is running or finished. Anyone else can only do it after
// the first collect window has passed (graceStage >= 1), because by then the clothes are unattended.
export function canEmpty(machine: { state: MachineState }, session: ActiveSession, viewerStudentId: string | null) {
  if (!viewerStudentId || !session) return false;
  if (session.studentId === viewerStudentId) return machine.state === "InUse" || machine.state === "GracePeriod";
  return machine.state === "GracePeriod" && session.graceStage >= 1;
}

// ─────────────────────────────────────────────
// Access
// ─────────────────────────────────────────────

export type StudentLaundryContext = { studentId: string; name: string; laundryRoomId: string | null };

// Read live (not from the JWT) so a student who is moved to a new block uses the right laundry straight away.
export async function studentLaundryContext(userId: string): Promise<StudentLaundryContext | null> {
  const s = await prisma.student.findFirst({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      room: { select: { block: { select: { laundryRoomLinks: { select: { laundryRoomId: true }, take: 1 } } } } },
    },
  });
  if (!s) return null;
  return { studentId: s.id, name: s.name, laundryRoomId: s.room?.block.laundryRoomLinks[0]?.laundryRoomId ?? null };
}

// Students: the laundry room serving their block. Wardens: rooms serving the blocks they manage.
// Chief warden: every laundry room at the location.
export async function laundryAccess(user: SessionUser): Promise<{ roomIds: string[]; student: StudentLaundryContext | null }> {
  if (user.role === "Student") {
    const student = await studentLaundryContext(user.id);
    return { roomIds: student?.laundryRoomId ? [student.laundryRoomId] : [], student };
  }
  if (user.role === "ChiefWarden") {
    const rooms = await prisma.laundryRoom.findMany({ where: { locationId: LOCATION_ID }, select: { id: true } });
    return { roomIds: rooms.map((r) => r.id), student: null };
  }
  if (user.role === "Warden") {
    const blockIds = await managedBlockIds(user);
    const links = await prisma.laundryRoomBlock.findMany({ where: { blockId: { in: blockIds } }, select: { laundryRoomId: true } });
    return { roomIds: [...new Set(links.map((l) => l.laundryRoomId))], student: null };
  }
  return { roomIds: [], student: null };
}

// ─────────────────────────────────────────────
// Feed
// ─────────────────────────────────────────────

export function postFeed(db: Db, laundryRoomId: string, messageType: LaundryFeedEntryType, message: string, sessionId?: string) {
  return db.laundryFeedEntry.create({ data: { laundryRoomId, messageType, message, sessionId } });
}

// ─────────────────────────────────────────────
// Timer engine
// ─────────────────────────────────────────────
//
// Nothing runs in the background on a serverless host, and a Redis TTL expires silently without telling us.
// So the database is the single source of truth and every timed transition is derived from timestamps:
//
//   InUse  --(endsAt passes)-->  GracePeriod  --(gracePeriodEndsAt passes)-->  move instruction posted
//
// runLaundryTick() looks for sessions whose timestamp has passed and applies the transition. It is idempotent:
// each step is claimed with an updateMany that names the state it expects, so two overlapping ticks (or a tick
// racing a user's click) can never both apply the same step or post the same feed entry twice.
//
// It is called from: GET /api/laundry (every viewer polls), GET /api/notifications/count (every signed-in user
// polls, so a warning still reaches an owner who is not on the laundry page) and the optional cron route.

export async function runLaundryTick(force = false): Promise<void> {
  try {
    if (!force && !(await acquireTickSlot("laundry"))) return;
    const now = new Date();
    await sendWarnings(now);
    await finishTimers(now);
    // Twice, so a server that was idle for a long time catches up through both grace stages in one tick.
    await advanceGrace(now);
    await advanceGrace(now);
  } catch (error) {
    // A failed tick must never break the request that triggered it. The next tick retries.
    console.error("laundry tick failed", error);
  }
}

// Step 1: five minutes left. Skipped for cycles of 5 minutes or less, which would warn immediately.
async function sendWarnings(now: Date) {
  const due = await prisma.laundrySession.findMany({
    where: {
      endedAt: null,
      warnedAt: null,
      durationMinutes: { gt: WARN_MINUTES },
      endsAt: { gt: now, lte: addMinutes(now, WARN_MINUTES) },
      machine: { state: "InUse" },
    },
    select: { id: true, endsAt: true, laundryRoomId: true, student: { select: { userId: true, name: true } }, machine: { select: { id: true, label: true } } },
  });

  for (const s of due) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.laundrySession.updateMany({ where: { id: s.id, warnedAt: null, endedAt: null }, data: { warnedAt: now } });
      if (claimed.count === 0) return;
      const mins = Math.max(1, Math.ceil((s.endsAt.getTime() - now.getTime()) / 60_000));
      await postFeed(tx, s.laundryRoomId, "FiveMinWarning", `${s.machine.label} (${s.student.name}) has about ${mins} min left.`, s.id);
      await notify(tx, {
        recipientId: s.student.userId,
        category: "Laundry",
        title: `${s.machine.label}: about ${mins} min left`,
        body: "Get ready to collect your clothes.",
        linkEntity: "Laundry",
        linkId: s.machine.id,
      });
    });
  }
}

// Step 2: the timer ended. The machine moves to GracePeriod and the owner gets a window to collect.
// The window is measured from when the cycle really ended, so a late tick never stretches it.
async function finishTimers(now: Date) {
  const due = await prisma.laundrySession.findMany({
    where: { endedAt: null, endsAt: { lte: now }, machine: { state: "InUse" } },
    select: { id: true, endsAt: true, laundryRoomId: true, student: { select: { userId: true, name: true } }, machine: { select: { id: true, label: true } } },
  });

  for (const s of due) {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.machine.updateMany({ where: { id: s.machine.id, state: "InUse" }, data: { state: "GracePeriod" } });
      if (moved.count === 0) return;
      const updated = await tx.laundrySession.updateMany({
        where: { id: s.id, endedAt: null },
        data: { gracePeriodEndsAt: addMinutes(s.endsAt, GRACE_MINUTES), graceStage: 0 },
      });
      if (updated.count === 0) return;
      await postFeed(tx, s.laundryRoomId, "TimerEnd", `${s.machine.label} has finished. ${s.student.name} has ${GRACE_MINUTES} minutes to collect their clothes.`, s.id);
      await notify(tx, {
        recipientId: s.student.userId,
        category: "Laundry",
        title: `${s.machine.label} has finished`,
        body: `Please collect your clothes within ${GRACE_MINUTES} minutes.`,
        linkEntity: "Laundry",
        linkId: s.machine.id,
      });
    });
  }
}

// Step 3: the collect window ran out and the clothes are still there.
//   Washer: a free dryer -> ask someone nearby to move them there.
//           no free dryer -> wait EXTRA_WAIT_MINUTES, then ask for the basket (table only if there is no basket).
//   Dryer:  ask someone nearby to move them to a basket or bag, never the table.
async function advanceGrace(now: Date) {
  const due = await prisma.laundrySession.findMany({
    where: { endedAt: null, graceStage: { lt: 2 }, gracePeriodEndsAt: { lte: now }, machine: { state: "GracePeriod" } },
    select: {
      id: true,
      graceStage: true,
      gracePeriodEndsAt: true,
      laundryRoomId: true,
      student: { select: { userId: true, name: true } },
      machine: { select: { id: true, label: true, type: true } },
    },
  });

  for (const s of due) {
    const owner = s.student.name;
    const label = s.machine.label;

    let next: { stage: number; extendTo: Date | null; type: LaundryFeedEntryType; message: string };
    if (s.machine.type === "Washer") {
      const freeDryer = await prisma.machine.findFirst({
        where: { laundryRoomId: s.laundryRoomId, type: "Dryer", state: "Free", deletedAt: null },
        orderBy: { label: "asc" },
        select: { label: true },
      });
      if (freeDryer) {
        next = {
          stage: 2,
          extendTo: null,
          type: "MoveToAvailableDryer",
          message: `${label} is done and ${owner}'s wet clothes are still inside. If you are nearby, please move them to ${freeDryer.label}, which is free.`,
        };
      } else if (s.graceStage === 0) {
        next = {
          stage: 1,
          extendTo: addMinutes(s.gracePeriodEndsAt ?? now, EXTRA_WAIT_MINUTES),
          type: "GracePeriodStart",
          message: `All dryers are busy. ${owner} has another ${EXTRA_WAIT_MINUTES} minutes to collect their clothes from ${label}.`,
        };
      } else {
        next = {
          stage: 2,
          extendTo: null,
          type: "MoveToBasket",
          message: `${label} still has ${owner}'s wet clothes and no dryer is free. If you are nearby, please move them to the basket or bag above a dryer. Use the table only if there is no basket.`,
        };
      }
    } else {
      next = {
        stage: 2,
        extendTo: null,
        type: "MoveToBasket",
        message: `${label} is done and ${owner}'s clothes are still inside. If you are nearby, please move them to a basket or bag. Do not leave damp clothes on the table.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // Expecting the stage we read means a second tick cannot apply the same step again.
      const claimed = await tx.laundrySession.updateMany({
        where: { id: s.id, endedAt: null, graceStage: s.graceStage },
        data: { graceStage: next.stage, ...(next.extendTo ? { gracePeriodEndsAt: next.extendTo } : {}) },
      });
      if (claimed.count === 0) return;
      await postFeed(tx, s.laundryRoomId, next.type, next.message, s.id);
      await notify(tx, {
        recipientId: s.student.userId,
        category: "Laundry",
        title: next.stage === 1 ? `${label}: collect your clothes` : `Your clothes in ${label} are unattended`,
        body: next.stage === 1 ? `You have ${EXTRA_WAIT_MINUTES} more minutes before they are moved.` : "Please collect them now. Other students may move them.",
        linkEntity: "Laundry",
        linkId: s.machine.id,
      });
    });
  }
}

// ─────────────────────────────────────────────
// Shared by the action routes
// ─────────────────────────────────────────────

// A machine with its single active session (if any). Retired machines are treated as missing.
export function loadMachine(id: string) {
  return prisma.machine.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      type: true,
      label: true,
      state: true,
      laundryRoomId: true,
      sessions: {
        where: { endedAt: null },
        take: 1,
        select: { id: true, studentId: true, graceStage: true, student: { select: { userId: true, name: true } } },
      },
    },
  });
}
