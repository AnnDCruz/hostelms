import type { Gender, Prisma, RoomHistoryEvent } from "@prisma/client";
import { ApiError } from "@/lib/errors";
import { audit, notify } from "@/lib/events";
import type { SessionUser } from "@/lib/types";

type Tx = Prisma.TransactionClient;

// Wardens act only on their own blocks. Chief wardens act on any block.
export function assertBlockAccess(user: SessionUser, blockId: string) {
  if (user.role === "ChiefWarden") return;
  if (user.role === "Warden" && user.blockIds.includes(blockId)) return;
  throw new ApiError(403, "This room is not in one of your blocks");
}

async function loadRoom(tx: Tx, id: string) {
  const room = await tx.room.findFirst({
    where: { id, deletedAt: null },
    include: {
      block: true,
      student: { select: { id: true, name: true, userId: true, gender: true } },
      staffOccupant: true,
    },
  });
  if (!room) throw new ApiError(404, "Room not found");
  return room;
}

type LoadedRoom = Awaited<ReturnType<typeof loadRoom>>;

const label = (r: LoadedRoom) => `${r.block.name}-${r.roomNumber}`;

function assertGender(gender: Gender, block: { name: string; gender: Gender }) {
  if (gender !== block.gender) {
    throw new ApiError(409, `Block ${block.name} is for ${block.gender === "Male" ? "male" : "female"} students`);
  }
}

function log(
  tx: Tx,
  data: { roomId: string; event: RoomHistoryEvent; actorId: string; studentId?: string; staffName?: string; reason?: string; note?: string },
) {
  return tx.roomHistory.create({ data });
}

export async function allocateStudent(tx: Tx, user: SessionUser, roomId: string, studentId: string) {
  const room = await loadRoom(tx, roomId);
  assertBlockAccess(user, room.blockId);
  if (room.state !== "Vacant") {
    throw new ApiError(409, `Room ${label(room)} is ${room.state.toLowerCase()}, not vacant`);
  }

  const student = await tx.student.findFirst({ where: { id: studentId, deletedAt: null } });
  if (!student) throw new ApiError(404, "Student not found");
  if (student.roomId) throw new ApiError(409, `${student.name} already has a room. Use transfer instead`);
  assertGender(student.gender, room.block);

  await tx.student.update({ where: { id: student.id }, data: { roomId: room.id } });
  await tx.room.update({ where: { id: room.id }, data: { state: "Occupied" } });
  await log(tx, { roomId: room.id, event: "Allocated", actorId: user.id, studentId: student.id });
  await audit(tx, {
    actorId: user.id,
    actorRole: user.role,
    action: "ROOM_ALLOCATED",
    targetEntity: "Room",
    targetId: room.id,
    snapshot: { studentId: student.id, room: label(room) },
  });
  await notify(tx, {
    recipientId: student.userId,
    category: "System",
    title: "Room allocated",
    body: `You have been allocated room ${label(room)}.`,
    linkEntity: "Room",
    linkId: room.id,
  });
}

export async function vacateRoom(tx: Tx, user: SessionUser, roomId: string) {
  const room = await loadRoom(tx, roomId);
  assertBlockAccess(user, room.blockId);
  if (room.state !== "Occupied" || !room.student) throw new ApiError(409, "There is no student in this room");

  await tx.student.update({ where: { id: room.student.id }, data: { roomId: null } });
  await tx.room.update({ where: { id: room.id }, data: { state: "Vacant" } });
  await log(tx, { roomId: room.id, event: "Vacated", actorId: user.id, studentId: room.student.id });
  await audit(tx, {
    actorId: user.id,
    actorRole: user.role,
    action: "ROOM_VACATED",
    targetEntity: "Room",
    targetId: room.id,
    snapshot: { studentId: room.student.id, room: label(room) },
  });
  await notify(tx, {
    recipientId: room.student.userId,
    category: "System",
    title: "Room vacated",
    body: `You have been moved out of room ${label(room)}.`,
    linkEntity: "Room",
    linkId: room.id,
  });
}

export async function transferStudent(tx: Tx, user: SessionUser, fromRoomId: string, toRoomId: string) {
  if (fromRoomId === toRoomId) throw new ApiError(400, "Choose a different room");

  const from = await loadRoom(tx, fromRoomId);
  assertBlockAccess(user, from.blockId);
  if (from.state !== "Occupied" || !from.student) throw new ApiError(409, "There is no student in this room");

  const to = await loadRoom(tx, toRoomId);
  assertBlockAccess(user, to.blockId);
  if (to.state !== "Vacant") throw new ApiError(409, `Room ${label(to)} is ${to.state.toLowerCase()}, not vacant`);
  assertGender(from.student.gender, to.block);

  await tx.student.update({ where: { id: from.student.id }, data: { roomId: to.id } });
  await tx.room.update({ where: { id: from.id }, data: { state: "Vacant" } });
  await tx.room.update({ where: { id: to.id }, data: { state: "Occupied" } });
  await log(tx, { roomId: from.id, event: "TransferOut", actorId: user.id, studentId: from.student.id, note: `To ${label(to)}` });
  await log(tx, { roomId: to.id, event: "TransferIn", actorId: user.id, studentId: from.student.id, note: `From ${label(from)}` });
  await audit(tx, {
    actorId: user.id,
    actorRole: user.role,
    action: "ROOM_TRANSFERRED",
    targetEntity: "Room",
    targetId: from.id,
    snapshot: { studentId: from.student.id, from: label(from), to: label(to) },
  });
  await notify(tx, {
    recipientId: from.student.userId,
    category: "System",
    title: "Room changed",
    body: `You have been moved from ${label(from)} to ${label(to)}.`,
    linkEntity: "Room",
    linkId: to.id,
  });
}

// A room can only be blocked once it is empty: no student, no staff occupant.
export async function blockRoom(tx: Tx, user: SessionUser, roomId: string, reason: string) {
  const room = await loadRoom(tx, roomId);
  assertBlockAccess(user, room.blockId);
  if (room.state === "Occupied") throw new ApiError(409, "Vacate the student before blocking this room");
  if (room.state === "Staff") throw new ApiError(409, "Remove the staff occupant before blocking this room");
  if (room.state === "Blocked") throw new ApiError(409, "This room is already blocked");

  await tx.room.update({
    where: { id: room.id },
    data: { state: "Blocked", blockedReason: reason, blockedAt: new Date(), blockedById: user.id },
  });
  await log(tx, { roomId: room.id, event: "Blocked", actorId: user.id, reason });
  await audit(tx, {
    actorId: user.id,
    actorRole: user.role,
    action: "ROOM_BLOCKED",
    targetEntity: "Room",
    targetId: room.id,
    snapshot: { reason },
  });
}

export async function unblockRoom(tx: Tx, user: SessionUser, roomId: string, note?: string) {
  const room = await loadRoom(tx, roomId);
  assertBlockAccess(user, room.blockId);
  if (room.state !== "Blocked") throw new ApiError(409, "This room is not blocked");

  await tx.room.update({
    where: { id: room.id },
    data: { state: "Vacant", blockedReason: null, blockedAt: null, blockedById: null },
  });
  await log(tx, { roomId: room.id, event: "Unblocked", actorId: user.id, note });
  await audit(tx, {
    actorId: user.id,
    actorRole: user.role,
    action: "ROOM_UNBLOCKED",
    targetEntity: "Room",
    targetId: room.id,
  });
}

export async function assignStaff(
  tx: Tx,
  user: SessionUser,
  roomId: string,
  input: { name: string; designation?: string; phone?: string },
) {
  const room = await loadRoom(tx, roomId);
  assertBlockAccess(user, room.blockId);
  if (room.state !== "Vacant") throw new ApiError(409, `Room ${label(room)} is ${room.state.toLowerCase()}, not vacant`);

  await tx.staffRoom.create({
    data: { roomId: room.id, name: input.name, designation: input.designation || null, phone: input.phone || null },
  });
  await tx.room.update({ where: { id: room.id }, data: { state: "Staff" } });
  await log(tx, { roomId: room.id, event: "Allocated", actorId: user.id, staffName: input.name });
  await audit(tx, {
    actorId: user.id,
    actorRole: user.role,
    action: "ROOM_STAFF_ASSIGNED",
    targetEntity: "Room",
    targetId: room.id,
    snapshot: { staffName: input.name },
  });
}

export async function removeStaff(tx: Tx, user: SessionUser, roomId: string) {
  const room = await loadRoom(tx, roomId);
  assertBlockAccess(user, room.blockId);
  if (room.state !== "Staff" || !room.staffOccupant) throw new ApiError(409, "There is no staff occupant in this room");

  await tx.staffRoom.delete({ where: { roomId: room.id } });
  await tx.room.update({ where: { id: room.id }, data: { state: "Vacant" } });
  await log(tx, { roomId: room.id, event: "Vacated", actorId: user.id, staffName: room.staffOccupant.name });
  await audit(tx, {
    actorId: user.id,
    actorRole: user.role,
    action: "ROOM_STAFF_REMOVED",
    targetEntity: "Room",
    targetId: room.id,
    snapshot: { staffName: room.staffOccupant.name },
  });
}
