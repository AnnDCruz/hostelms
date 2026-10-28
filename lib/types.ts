import type { ShiftFlag, FeedbackStatus, Gender, GatepassStatus, LaundryFeedEntryType, MachineState, MachineType, MaintenanceStatus, NotificationCategory, Role, RoomHistoryEvent, RoomState } from "@prisma/client";

export type SessionUser = {
  id: string;
  role: Role;
  blockIds: string[];
  email?: string | null;
};

export type GatepassDTO = {
  id: string;
  status: GatepassStatus;
  departureTime: string;
  expectedReturnTime: string;
  reason: string;
  createdAt: string;
  parentApprovedAt: string | null;
  wardenApprovedAt: string | null;
  student: { name: string; rollNumber: string; room: { roomNumber: string } | null };
  block: { name: string };
};

export type BlockDTO = {
  id: string;
  name: string;
  gender: Gender;
  counts: Record<RoomState, number>;
};

export type RoomDTO = {
  id: string;
  blockId: string;
  roomNumber: string;
  floor: number;
  state: RoomState;
  blockedReason: string | null;
  blockedAt: string | null;
  student: { id: string; name: string; rollNumber: string } | null;
  staffOccupant: { name: string; designation: string | null; phone: string | null } | null;
};

export type RoomHistoryDTO = {
  id: string;
  event: RoomHistoryEvent;
  reason: string | null;
  note: string | null;
  staffName: string | null;
  studentName: string | null;
  actor: string | null;
  createdAt: string;
};

export type RoomActionInput =
  | { type: "allocate"; studentId: string }
  | { type: "vacate" }
  | { type: "transfer"; targetRoomId: string }
  | { type: "block"; reason: string }
  | { type: "unblock"; note?: string }
  | { type: "assignStaff"; name: string; designation?: string; phone?: string }
  | { type: "removeStaff" };

export type StudentDTO = {
  id: string;
  rollNumber: string;
  name: string;
  gender: Gender;
  course: string | null;
  year: number | null;
  phone: string | null;
  whatsappNumber: string | null;
  email: string;
  room: { id: string; roomNumber: string; block: { id: string; name: string } } | null;
  parent: { name: string; phone: string | null; email: string | null } | null;
  secondaryContact: { name: string | null; phone: string | null; email: string | null } | null;
};

export type MyProfileDTO = {
  id: string;
  rollNumber: string;
  name: string;
  email: string;
  gender: Gender;
  course: string | null;
  year: number | null;
  phone: string | null;
  whatsappNumber: string | null;
  room: { roomNumber: string; floor: number; block: { name: string } } | null;
};

export type MaintenanceDTO = {
  id: string;
  status: MaintenanceStatus;
  description: string;
  pendingAt: string;
  inProgressAt: string | null;
  resolvedAt: string | null;
  reopenCount: number;
  lastReopenAt: string | null;
  createdAt: string;
  student: { name: string; rollNumber: string };
  room: { roomNumber: string };
  block: { name: string };
};

export type NoticeDTO = {
  id: string;
  title: string;
  body: string;
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
  postedBy: string;
  postedByRole: "Warden" | "ChiefWarden";
  blocks: { id: string; name: string }[];
  commentCount: number;
  canDelete: boolean;
};

export type NoticeCommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorRole: Role;
  parentId: string | null;
};

export type NoticeDetailDTO = { notice: NoticeDTO; comments: NoticeCommentDTO[] };

export type FeedbackDTO = {
  id: string;
  body: string;
  status: FeedbackStatus;
  createdAt: string;
  acknowledgedAt: string | null;
  inReviewAt: string | null;
  escalatedAt: string | null;
  resolvedAt: string | null;
  chiefWardenResolvedAt: string | null;
  blockName: string;
  submittedBy: string;
  submitterKind: "Student" | "Parent";
  wardenName: string | null;
  escalationNote: string | null; // always null for students and parents
};

export type NotificationDTO = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  linkEntity: string | null;
  linkId: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationPage = { items: NotificationDTO[]; nextCursor: string | null };

export type MachineSessionDTO = {
  id: string;
  ownerName: string;
  isMine: boolean;
  durationMinutes: number;
  startedAt: string;
  endsAt: string;
  gracePeriodEndsAt: string | null;
  graceStage: number; // 0 = first collect window, 1 = waiting for a dryer, 2 = move instruction posted
  isRestartedByOther: boolean;
  restartedByName: string | null;
};

// What the viewer may do to a machine right now. Computed on the server with the same
// predicates the action routes enforce, so the UI never offers something the API will refuse.
export type MachineActionsDTO = {
  start: boolean;
  restart: boolean;
  empty: boolean;
  maintenance: "on" | "off" | null; // managers only: take out of service / return to service
};

export type MachineDTO = {
  id: string;
  type: MachineType;
  label: string;
  state: MachineState;
  session: MachineSessionDTO | null;
  actions: MachineActionsDTO;
};

export type LaundryFeedDTO = {
  id: string;
  messageType: LaundryFeedEntryType;
  message: string;
  createdAt: string;
};

export type LaundryRoomDTO = {
  id: string;
  name: string;
  machines: MachineDTO[];
  feed: LaundryFeedDTO[];
};

export type LaundryDTO = {
  serverTime: string; // lets the browser correct for a wrong device clock when showing countdowns
  rooms: LaundryRoomDTO[];
};

// Active: running now. Completed: ended normally. NeedsReview: the guard never ended it and the system flagged it.
// Resolved: it was flagged and a warden has since set the end time.
export type ShiftStatus = "Active" | "Completed" | "NeedsReview" | "Resolved";

export type ShiftDTO = {
  id: string;
  guardId: string;
  guardName: string;
  blockId: string;
  blockName: string;
  shiftIn: string;
  shiftOut: string | null;
  flag: ShiftFlag | null;
  status: ShiftStatus;
  durationMinutes: number | null; // null while the shift is still running or waiting for review
};

export type ShiftBlockDTO = { id: string; name: string };

export type GuardShiftsDTO = {
  view: "guard";
  serverTime: string;
  maxShiftHours: number;
  blocks: ShiftBlockDTO[]; // blocks this guard is assigned to
  current: ShiftDTO | null;
  history: ShiftDTO[];
};

export type ManagerShiftsDTO = {
  view: "manager";
  serverTime: string;
  maxShiftHours: number;
  blocks: ShiftBlockDTO[];
  onShift: ShiftDTO[]; // running right now across the blocks this person manages
  needsReview: number; // how many flagged shifts still need an end time (across all their blocks)
  shifts: ShiftDTO[]; // newest first, filtered by the query string
};

export type ShiftsDTO = GuardShiftsDTO | ManagerShiftsDTO;
