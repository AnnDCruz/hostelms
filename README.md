# HostelMS

University hostel management. This folder contains the working foundation plus one complete vertical slice
(the gate pass approval chain). Everything else follows the same module pattern described in CLAUDE.md.

## Run it

1. `npm install`   (runs `prisma generate` automatically; if it complains about env, do step 2 first)
2. Copy `.env.example` to `.env` and `.env.local`; fill in DATABASE_URL, DIRECT_URL and AUTH_SECRET.
   SMTP_* is optional: without it, invite links are printed in the terminal running `npm run dev`.
3. `npm run db:push`    (creates or updates the tables from prisma/schema.prisma)
4. `npm run db:seed`
5. `npm run dev`  then open http://localhost:3000

## Test accounts (password for all: `ChangeMe123!`)

| Email | Role |
| --- | --- |
| student1@hms.test / student2@hms.test | Student (Block A) |
| parent1@hms.test / parent2@hms.test | Parent |
| warden.a@hms.test | Warden (Block A) |
| warden.e@hms.test | Warden (Block E) |
| chief@hms.test | Chief warden |
| guard.a@hms.test | Security |
| facilities@hms.test | Facilities |
| admin@hms.test | Admin |

## Try the gate pass chain

1. Sign in as student1, open Gate passes, send a new request.
2. Sign in as parent1, approve it.
3. Sign in as warden.a, approve it. The student gets a notification row at every step.
Seed also creates gp-1 (waiting for parent1) and gp-2 (waiting for warden.a).

## Try rooms and students

1. Sign in as warden.a, open Rooms. Block A has occupied, vacant, blocked and staff rooms.
2. Allocate Karan Verma (student3, no room yet) to a vacant room. Block E refuses him (wrong gender).
3. Try to block an occupied room: it is refused until the student is vacated.
4. Open Students, add a new student. Watch the terminal for the two invite links, open one, set a password, sign in.
5. Sign in as warden.e: you see only Block E. chief@hms.test sees every block.

## Try notices and feedback

1. warden.a@hms.test: post a notice to Block A. Chief warden (chief@hms.test) can post to any block and delete any notice.
2. student1@hms.test: read it, comment, and see the warden's reply. Wardens and the chief warden can reply to comments (one level of replies).
3. student2@hms.test or parent1@hms.test: give feedback. warden.a@hms.test acknowledges, reviews, resolves, or escalates it with an internal note.
4. chief@hms.test resolves escalated feedback. Students and parents never see the internal note.
Parents do not see notices.

## Try the notification panel

Every role has a bell in the top bar. Sign in as student1@hms.test, parent1@hms.test, warden.a@hms.test, facilities@hms.test or chief@hms.test:
unread notifications show a count, click one to mark it read and jump to the record (the page opens its popover). Filter by type, mark all as read, load more.
The count refreshes every 30 seconds while the tab is open.

## Try laundry

Seed creates a boys' laundry (Blocks A to D) and a girls' laundry (Blocks E and F), each with 3 washers and 2 dryers. In the boys' room, Rohan (student2) has Washer 1 running and Dryer 2 is out of service.

1. student1@hms.test: open Laundry, tap a free washer, pick minutes, start. Starting a second washer is refused (one washer and one dryer each). The feed records it.
2. To watch timers without waiting, set a session's `endsAt` a few minutes ahead in the database. You get a 5-minute warning, then a "collect your clothes" notice when it ends, then the feed asks others to move the clothes. Timers advance whenever anyone has the app open (the page and the bell both poll).
3. student2@hms.test: restart a finished dryer (even one that is not yours), or move clothes out of a machine once the owner's collect window has passed.
4. warden.a@hms.test: Laundry shows Block A's room. Take a free machine out of service and back, or use "Set machine count". chief@hms.test sees both rooms.
5. Optional: set `CRON_SECRET` and point a scheduler at `GET /api/laundry/tick` (Bearer token) so timers also move when nobody is signed in.

The page refreshes every 5 seconds, and each countdown ticks locally from the server's clock. Supabase Realtime is not used yet.

## Try shifts

Ravi Kumar (guard.a@hms.test) guards Block A. The seed gives him one shift finished yesterday and one he never ended, already flagged.

1. guard.a@hms.test: open Shifts. He is off shift, so tap Start shift, watch the live clock, then End shift. Signing out also ends a running shift.
2. warden.a@hms.test: the bell has "Shift not ended in Block A". Open Shifts, click the red row, and set the time it really ended. The flag stays on the record as "Missed logout, resolved", and Ravi is notified.
3. To see the automatic flag, set a running shift's `shiftIn` more than 12 hours back in the database. The next page load or bell poll flags it and notifies the warden.
4. chief@hms.test sees every block. Dashboards show the shift status for guards and the review count for wardens.

## Gate pass expiry

Once a pass's "back by" time has passed, parent and warden can no longer approve it (it shows as Expired and the server refuses). They can still reject it. A student cannot create a request whose return time is already in the past.

## Try maintenance

1. Sign in as student1: raise a request, and reopen the resolved one (Window latch).
2. Sign in as facilities@hms.test: start work, then resolve. Facilities is notified of every new or reopened request.
3. Facilities can also use the Start work / Mark resolved buttons directly in the table row.
4. warden.a@hms.test and guard.a@hms.test see Block A requests read-only. chief@hms.test sees all.

## Built

Rooms (room map per block, allocate, vacate, transfer, block and unblock, staff rooms, history, add room) and
Students (list and search, create with parent login, edit, secondary contact, resend invite, student self-profile),
with emailed set-password links. Maintenance (student requests and reopens with a reopen counter, facilities start and resolve, read-only views for wardens and security, notifications). Notices (posting by wardens and the chief warden, expiry, comments with replies) and Feedback (auto-routed to the block warden, acknowledge, review, resolve, escalate with an internal note, chief warden resolves escalated items). Notification panel (bell with unread count, filters, mark read, deep links to the record). Shifts (start and end, history, missed-logout flag and warden resolution). Laundry (machine grid, start, 5-minute warning, collect window, move instructions in a feed, dryer restart, maintenance, machine count). Auth (credentials, JWT with role and block scope, role-prefix routing in proxy.ts), standard API envelope,
feature flags (opt-out, Redis optional), audit log and notification helpers, shared UI primitives, dashboard
shell with role navigation, role dashboards, and the full gate pass workflow (API, hooks, UI for Student,
Parent, Warden, Chief warden).

## Not built yet

Deleting or deactivating a student or room, student photo upload, bulk import, shifts,
biometric gate log, fees, admin feature-flag UI, reports, forgot-password (only invite links exist), refresh tokens and the Redis
token blacklist (sessions are a single 8 hour JWT for now), email and Cloudinary integrations.
