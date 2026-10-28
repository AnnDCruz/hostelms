import "dotenv/config";
import { PrismaClient, Gender, MachineState, MachineType, Role, RoomState, GatepassStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

// Idempotent: every row is an upsert with a fixed ID, so re-running never duplicates or corrupts data.
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD = "ChangeMe123!";
const hour = 60 * 60 * 1000;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const user = (id: string, email: string, role: Role) =>
    prisma.user.upsert({ where: { id }, update: {}, create: { id, email, role, passwordHash } });

  await prisma.location.upsert({
    where: { id: "location-1" },
    update: {},
    create: { id: "location-1", name: "Main Campus Hostel" },
  });

  // Blocks A-D boys, E-F girls
  for (const [name, gender] of [
    ["A", Gender.Male], ["B", Gender.Male], ["C", Gender.Male], ["D", Gender.Male],
    ["E", Gender.Female], ["F", Gender.Female],
  ] as const) {
    await prisma.block.upsert({
      where: { id: `block-${name.toLowerCase()}` },
      update: {},
      create: { id: `block-${name.toLowerCase()}`, locationId: "location-1", name, gender },
    });
  }

  for (const [n, state] of [["101", RoomState.Occupied], ["102", RoomState.Occupied], ["103", RoomState.Vacant]] as const) {
    await prisma.room.upsert({
      where: { id: `room-a-${n}` },
      update: {},
      create: { id: `room-a-${n}`, blockId: "block-a", roomNumber: n, floor: 1, state },
    });
  }

  // Accounts (all use the same password)
  await user("user-admin", "admin@hms.test", Role.Admin);
  await user("user-chief", "chief@hms.test", Role.ChiefWarden);
  await user("user-warden-a", "warden.a@hms.test", Role.Warden);
  await user("user-guard-a", "guard.a@hms.test", Role.Security);
  await user("user-facilities", "facilities@hms.test", Role.Facilities);
  await user("user-student-1", "student1@hms.test", Role.Student);
  await user("user-student-2", "student2@hms.test", Role.Student);
  await user("user-parent-1", "parent1@hms.test", Role.Parent);
  await user("user-parent-2", "parent2@hms.test", Role.Parent);

  await prisma.admin.upsert({ where: { id: "admin-1" }, update: {}, create: { id: "admin-1", userId: "user-admin", name: "System Admin" } });
  await prisma.warden.upsert({ where: { id: "warden-a" }, update: {}, create: { id: "warden-a", userId: "user-warden-a", name: "Meera Iyer" } });
  await prisma.blockWarden.upsert({ where: { id: "bw-a" }, update: {}, create: { id: "bw-a", blockId: "block-a", wardenId: "warden-a" } });
  await prisma.securityGuard.upsert({ where: { id: "guard-a" }, update: {}, create: { id: "guard-a", userId: "user-guard-a", name: "Ravi Kumar" } });
  await prisma.blockSecurity.upsert({ where: { id: "bs-a" }, update: {}, create: { id: "bs-a", blockId: "block-a", guardId: "guard-a" } });
  await prisma.facilitiesStaff.upsert({
    where: { id: "facilities-1" },
    update: {},
    create: { id: "facilities-1", userId: "user-facilities", locationId: "location-1", name: "Suresh Nair", department: "Maintenance" },
  });

  await prisma.student.upsert({
    where: { id: "student-1" },
    update: {},
    create: { id: "student-1", userId: "user-student-1", rollNumber: "2023A7PS0001H", name: "Aarav Sharma", gender: Gender.Male, course: "B.E. Computer Science", year: 2, roomId: "room-a-101" },
  });
  await prisma.student.upsert({
    where: { id: "student-2" },
    update: {},
    create: { id: "student-2", userId: "user-student-2", rollNumber: "2023A7PS0002H", name: "Rohan Mehta", gender: Gender.Male, course: "B.E. Electronics", year: 2, roomId: "room-a-102" },
  });
  await prisma.parent.upsert({ where: { id: "parent-1" }, update: {}, create: { id: "parent-1", userId: "user-parent-1", studentId: "student-1", name: "Anil Sharma" } });
  await prisma.parent.upsert({ where: { id: "parent-2" }, update: {}, create: { id: "parent-2", userId: "user-parent-2", studentId: "student-2", name: "Kavita Mehta" } });

  // Test chain: gp-1 waits on parent1, gp-2 already parent-approved and waits on warden.a
  const base = Date.now() + 24 * hour;
  await prisma.gatepass.upsert({
    where: { id: "gp-1" },
    update: {},
    create: {
      id: "gp-1", studentId: "student-1", blockId: "block-a", status: GatepassStatus.Request,
      date: new Date(base), departureTime: new Date(base), expectedReturnTime: new Date(base + 6 * hour), reason: "Family function in the city",
    },
  });
  await prisma.gatepass.upsert({
    where: { id: "gp-2" },
    update: {},
    create: {
      id: "gp-2", studentId: "student-2", blockId: "block-a", status: GatepassStatus.ParentApproval,
      date: new Date(base), departureTime: new Date(base + hour), expectedReturnTime: new Date(base + 8 * hour),
      reason: "Medical check-up", parentApprovedAt: new Date(),
    },
  });


  // --- Rooms and students module sample data ---
  for (const [n, floor, state] of [
    ["104", 1, RoomState.Vacant], ["105", 1, RoomState.Vacant], ["106", 1, RoomState.Vacant],
    ["107", 1, RoomState.Blocked], ["108", 1, RoomState.Staff], ["201", 2, RoomState.Vacant],
  ] as const) {
    await prisma.room.upsert({
      where: { id: `room-a-${n}` },
      update: {},
      create: {
        id: `room-a-${n}`, blockId: "block-a", roomNumber: n, floor, state,
        ...(state === RoomState.Blocked ? { blockedReason: "Water leakage repair", blockedAt: new Date(), blockedById: "user-warden-a" } : {}),
      },
    });
  }
  await prisma.staffRoom.upsert({
    where: { id: "staff-room-108" },
    update: {},
    create: { id: "staff-room-108", roomId: "room-a-108", name: "Ramesh Pillai", designation: "Night caretaker", phone: "9000000108" },
  });
  for (const [n, floor] of [["101", 1], ["102", 1], ["201", 2]] as const) {
    await prisma.room.upsert({
      where: { id: `room-e-${n}` },
      update: {},
      create: { id: `room-e-${n}`, blockId: "block-e", roomNumber: n, floor },
    });
  }

  await user("user-warden-e", "warden.e@hms.test", Role.Warden);
  await prisma.warden.upsert({ where: { id: "warden-e" }, update: {}, create: { id: "warden-e", userId: "user-warden-e", name: "Lakshmi Rao" } });
  await prisma.blockWarden.upsert({ where: { id: "bw-e" }, update: {}, create: { id: "bw-e", blockId: "block-e", wardenId: "warden-e" } });

  // Two students without a room, ready to allocate
  await user("user-student-3", "student3@hms.test", Role.Student);
  await user("user-student-4", "student4@hms.test", Role.Student);
  await user("user-parent-3", "parent3@hms.test", Role.Parent);
  await user("user-parent-4", "parent4@hms.test", Role.Parent);
  await prisma.student.upsert({
    where: { id: "student-3" }, update: {},
    create: { id: "student-3", userId: "user-student-3", rollNumber: "2023A7PS0003H", name: "Karan Verma", gender: Gender.Male, course: "B.E. Mechanical", year: 2 },
  });
  await prisma.student.upsert({
    where: { id: "student-4" }, update: {},
    create: { id: "student-4", userId: "user-student-4", rollNumber: "2023A7PS0004H", name: "Ananya Rao", gender: Gender.Female, course: "B.E. Chemical", year: 2 },
  });
  await prisma.parent.upsert({ where: { id: "parent-3" }, update: {}, create: { id: "parent-3", userId: "user-parent-3", studentId: "student-3", name: "Sunil Verma", email: "parent3@hms.test" } });
  await prisma.parent.upsert({ where: { id: "parent-4" }, update: {}, create: { id: "parent-4", userId: "user-parent-4", studentId: "student-4", name: "Geeta Rao", email: "parent4@hms.test" } });


  // --- Maintenance sample data: one pending, one in progress, one resolved (so reopen can be tried) ---
  const ago = (h: number) => new Date(Date.now() - h * hour);
  await prisma.maintenanceRequest.upsert({
    where: { id: "mr-1" }, update: {},
    create: { id: "mr-1", studentId: "student-1", roomId: "room-a-101", blockId: "block-a", description: "Ceiling fan makes a loud noise", status: "Pending", pendingAt: ago(3) },
  });
  await prisma.maintenanceRequest.upsert({
    where: { id: "mr-2" }, update: {},
    create: { id: "mr-2", studentId: "student-2", roomId: "room-a-102", blockId: "block-a", description: "Bathroom tap is leaking", status: "InProgress", pendingAt: ago(30), inProgressAt: ago(5) },
  });
  await prisma.maintenanceRequest.upsert({
    where: { id: "mr-3" }, update: {},
    create: { id: "mr-3", studentId: "student-1", roomId: "room-a-101", blockId: "block-a", description: "Window latch is broken", status: "Resolved", pendingAt: ago(72), inProgressAt: ago(48), resolvedAt: ago(24) },
  });


  // --- Notices and feedback sample data ---
  await prisma.notice.upsert({
    where: { id: "notice-1" }, update: {},
    create: {
      id: "notice-1", title: "Water supply maintenance on Saturday", body: "Water will be unavailable in Block A from 9 am to 1 pm this Saturday while the main tank is cleaned. Please store water in advance.",
      wardenId: "warden-a", postedByUserId: "user-warden-a",
      blocks: { create: [{ blockId: "block-a" }] },
    },
  });
  await prisma.notice.upsert({
    where: { id: "notice-2" }, update: {},
    create: {
      id: "notice-2", title: "Hostel day curfew reminder", body: "Gates close at 10 pm sharp. Late entry needs a gate pass approved in advance.",
      wardenId: null, postedByUserId: "user-chief", expiresAt: new Date(Date.now() + 14 * 24 * hour),
      blocks: { create: [{ blockId: "block-a" }, { blockId: "block-e" }] },
    },
  });
  await prisma.noticeComment.upsert({
    where: { id: "nc-1" }, update: {},
    create: { id: "nc-1", noticeId: "notice-1", studentId: "student-1", authorUserId: "user-student-1", authorRole: Role.Student, authorName: "Aarav Sharma", body: "Will drinking water also be cut?" },
  });
  await prisma.noticeComment.upsert({
    where: { id: "nc-2" }, update: {},
    create: { id: "nc-2", noticeId: "notice-1", parentId: "nc-1", authorUserId: "user-warden-a", authorRole: Role.Warden, authorName: "Meera Iyer", body: "No, the drinking water dispensers stay on a separate line." },
  });

  await prisma.feedback.upsert({
    where: { id: "fb-1" }, update: {},
    create: { id: "fb-1", blockId: "block-a", studentId: "student-1", wardenId: "warden-a", body: "The study room lights flicker in the evenings." },
  });
  await prisma.feedback.upsert({
    where: { id: "fb-2" }, update: {},
    create: {
      id: "fb-2", blockId: "block-a", studentId: "student-2", wardenId: "warden-a", status: "InReview",
      body: "Wi-Fi in the corridor is very slow after 9 pm.", acknowledgedAt: new Date(Date.now() - 20 * hour), inReviewAt: new Date(Date.now() - 6 * hour),
    },
  });
  await prisma.feedback.upsert({
    where: { id: "fb-3" }, update: {},
    create: {
      id: "fb-3", blockId: "block-a", parentId: "parent-1", wardenId: "warden-a", status: "Escalated",
      body: "My son reports that the mess food quality has dropped this month.", acknowledgedAt: new Date(Date.now() - 48 * hour),
      escalatedAt: new Date(Date.now() - 10 * hour), escalationNote: "Mess is outside block control. Needs chief warden to take up with the contractor.",
    },
  });


  // --- Notification panel sample data ---
  const notifs = [
    { id: "notif-1", recipientId: "user-parent-1", category: "Gatepass", title: "Gate pass needs your approval", body: "Aarav Sharma has requested a gate pass.", linkEntity: "Gatepass", linkId: "gp-1", isRead: false },
    { id: "notif-2", recipientId: "user-warden-a", category: "Gatepass", title: "Gate pass needs your approval", body: "Rohan Mehta has a gate pass approved by their parent.", linkEntity: "Gatepass", linkId: "gp-2", isRead: false },
    { id: "notif-3", recipientId: "user-facilities", category: "Maintenance", title: "New maintenance request", body: "Aarav Sharma (A-101): Ceiling fan makes a loud noise", linkEntity: "MaintenanceRequest", linkId: "mr-1", isRead: false },
    { id: "notif-4", recipientId: "user-student-1", category: "System", title: "Room allocated", body: "You have been allocated room A-101.", linkEntity: "Room", linkId: "room-a-101", isRead: true },
    { id: "notif-5", recipientId: "user-chief", category: "Feedback", title: "Feedback escalated to you", body: "My son reports that the mess food quality has dropped this month.", linkEntity: "Feedback", linkId: "fb-3", isRead: false },
    { id: "notif-6", recipientId: "user-student-1", category: "System", title: "New notice", body: "Hostel day curfew reminder", linkEntity: "Notice", linkId: "notice-2", isRead: false },
  ] as const;
  for (const [i, n] of notifs.entries()) {
    await prisma.notification.upsert({ where: { id: n.id }, update: {}, create: { ...n, createdAt: new Date(Date.now() - (i + 1) * hour) } });
  }

  // --- Shifts for Ravi (guard.a): one finished yesterday, and one he never ended, already flagged so the
  // warden has something to resolve. He has no running shift, so he can start a new one straight away.
  await prisma.shift.upsert({
    where: { id: "shift-1" },
    update: {},
    create: { id: "shift-1", guardId: "guard-a", blockId: "block-a", shiftIn: new Date(Date.now() - 30 * hour), shiftOut: new Date(Date.now() - 22 * hour) },
  });
  await prisma.shift.upsert({
    where: { id: "shift-2" },
    update: {},
    create: { id: "shift-2", guardId: "guard-a", blockId: "block-a", shiftIn: new Date(Date.now() - 20 * hour), flag: "MissedLogout" },
  });
  await prisma.notification.upsert({
    where: { id: "notif-7" },
    update: {},
    create: {
      id: "notif-7",
      recipientId: "user-warden-a",
      category: "Shift",
      title: "Shift not ended in Block A",
      body: "Ravi Kumar has been on shift for more than 12 hours without ending it. Please set the end time.",
      linkEntity: "Shift",
      linkId: "shift-2",
      isRead: false,
      createdAt: new Date(Date.now() - 8 * hour),
    },
  });

  // --- Laundry: boys' room serves blocks A-D, girls' room serves E-F ---
  // Starting state for a couple of machines so the page has something to show on day one.
  const sampleState: Record<string, MachineState> = {
    "machine-boys-w1": MachineState.InUse,
    "machine-boys-d2": MachineState.Maintenance,
  };
  const laundryRooms = [
    { id: "laundry-boys", name: "Boys Laundry", blocks: ["a", "b", "c", "d"], prefix: "boys" },
    { id: "laundry-girls", name: "Girls Laundry", blocks: ["e", "f"], prefix: "girls" },
  ];
  for (const lr of laundryRooms) {
    await prisma.laundryRoom.upsert({ where: { id: lr.id }, update: {}, create: { id: lr.id, locationId: "location-1", name: lr.name } });
    for (const b of lr.blocks) {
      await prisma.laundryRoomBlock.upsert({
        where: { id: `lrb-${lr.prefix}-${b}` },
        update: {},
        create: { id: `lrb-${lr.prefix}-${b}`, laundryRoomId: lr.id, blockId: `block-${b}` },
      });
    }
    for (const [type, count] of [[MachineType.Washer, 3], [MachineType.Dryer, 2]] as const) {
      for (let n = 1; n <= count; n++) {
        const t = type === MachineType.Washer ? "w" : "d";
        await prisma.machine.upsert({
          where: { id: `machine-${lr.prefix}-${t}${n}` },
          update: {},
          create: { id: `machine-${lr.prefix}-${t}${n}`, laundryRoomId: lr.id, type, label: `${type} ${n}`, state: sampleState[`machine-${lr.prefix}-${t}${n}`] ?? MachineState.Free },
        });
      }
    }
  }

  // Sample session for the boys' room: Rohan has Washer 1 running (25 min left, so the 5-minute warning can be
  // watched). Created on the first run only; later runs leave live state alone.
  const startedAt = new Date(Date.now() - 20 * 60_000);
  await prisma.laundrySession.upsert({
    where: { id: "ls-1" },
    update: {},
    create: { id: "ls-1", machineId: "machine-boys-w1", studentId: "student-2", laundryRoomId: "laundry-boys", durationMinutes: 45, startedAt, endsAt: new Date(startedAt.getTime() + 45 * 60_000) },
  });
  await prisma.laundryFeedEntry.upsert({
    where: { id: "lf-1" },
    update: {},
    create: { id: "lf-1", laundryRoomId: "laundry-boys", messageType: "SessionStart", message: "Rohan Mehta started Washer 1 for 45 min.", sessionId: "ls-1", createdAt: startedAt },
  });

  console.log("Seed complete. All accounts use password:", PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
