# HostelMS conventions

## Stack
Next.js 16 App Router, TypeScript, Tailwind v4, Prisma 7 with @prisma/adapter-pg (PostgreSQL / Supabase),
Auth.js v5 (split edge/node config), Upstash Redis (optional), Zod v4, React Query, Radix Dialog.

## Hard rules
- Every API route: `assertRole` then `assertFeature` before any business logic (lib/api.ts).
- Responses use the envelope helpers: ok, badRequest, unauthorized, forbidden, notFound, serverError.
- Route handler `params` is a Promise: always `await params`.
- Zod v4: read `error.issues`, never `error.errors`.
- All detail views are Radix popovers (components/ui/popover.tsx). No inline modals.
- Light theme only. Use the semantic tokens in app/globals.css (accent, success, warn, danger, staff).
- locationId comes from lib/constants.ts (LOCATION_ID).
- Migrations and seed use DIRECT_URL, never the pooler URL.
- Seeds are upserts with fixed IDs.
- ChiefWarden has no profile table: use User.id wherever a profile FK would be needed.
- Data scoping: filter by session `blockIds` (see lib/gatepass.ts for the pattern).
- Write an AuditLog row (lib/events.ts) for every state change, and notify affected users.
- Role URL prefixes (lib/constants.ts ROLE_HOME) are enforced in proxy.ts.

## Workflow
- Before writing code, list assumptions and open questions, then wait for approval.
- Never assume a file exists: check the real tree first.
- Before calling a task done, run `npm run typecheck` and `npm run lint`.
- Never read or print .env files.

## Adding a module (the pattern gatepass follows)
validator in lib/validators -> API route(s) in app/api -> hook in hooks -> board component in components/<module>
-> page per role in app/(dashboard)/<role>/<module> -> nav entry in lib/constants.ts -> seed rows.

## Rooms and students rules
- Room state changes go through lib/rooms.ts only (one transaction each, with room history, audit row, notification).
- A room can be blocked only when empty. Occupied rooms must be vacated first, staff rooms must be cleared first.
- Allocation refuses: non-vacant room, student who already has a room, gender not matching the block.
- Wardens act on their own blocks (session blockIds). Chief wardens act on all blocks.
- New student and parent logins never get a usable password: they get an emailed set-password link
  (hash stored in PasswordResetToken, 72 hour expiry). See lib/invites.ts and lib/email.ts.
- Student self-service is limited to phone and whatsappNumber.
- React Query keys: students start with ["students"], rooms with ["rooms"], blocks with ["blocks"].
  Invalidate by prefix after every mutation.

## Maintenance rules
- Status flow: Pending -> InProgress -> Resolved (Facilities only), Resolved -> Pending by reopen (the student who raised it).
- Transitions use updateMany with the expected current status, so two simultaneous clicks cannot both win.
- Reopen resets pendingAt, clears inProgressAt and resolvedAt, and increments reopenCount.
- Wardens and Security see their blocks read-only. Facilities and Chief Warden see all requests. Query keys start with ["maintenance"].

## Gate pass expiry rule
- Approving is refused once `expectedReturnTime` has passed (server check in app/api/gatepass/[id]/route.ts). Rejecting is still allowed.
- The UI shows such requests as Expired and hides Approve. The server is the authority, never rely on the UI check alone.

## Notices and feedback rules
- Notices: wardens post to blocks they manage, the chief warden to any block. Students see notices for their current room's block (live query, not the JWT) and never see expired ones. Parents see no notices.
- Notice delete is permanent: the chief warden deletes any, a warden only their own. Comments are threaded one level deep; students, wardens and the chief warden can comment and reply.
- Wardens and the chief warden get block access from lib/scope.ts managedBlockIds (live DB read).
- Feedback flow: Submitted -> Acknowledged -> InReview -> Resolved (warden). A warden can escalate before it is resolved. Escalated items are resolved by the chief warden only. Transitions use updateMany with the expected status.
- escalationNote is internal: toFeedbackDTO strips it for students and parents. Never return it to them.

## Notification panel rules
- Notifications are your own only: every query filters by recipientId = session user id. Marking read uses updateMany with recipientId so nobody can touch another user's.
- Deep links come from lib/notification-links.ts: entity -> page, only if that page is in the role's NAV. Boards open a record with ?open=<id> via hooks/use-selection.ts.
- New modules that notify must set linkEntity and linkId, and (if the board should open the record) add the entity to notification-links.ts and use useSelection in the board.
- Unread count polls every 30s. The laundry page polls every 5s (see Laundry rules); Supabase Realtime is not wired up yet.
- Students never see notifications about expired notices: lib/notices.ts notificationVisibility is applied to the list and the unread count. Notification has no relation to Notice (linkId is a plain string), so the filter looks up expired notice ids first.

## Laundry rules
- One laundry room serves a set of blocks (LaundryRoomBlock). Students use the room serving their current room's block (live query, lib/laundry.ts studentLaundryContext). Wardens see rooms for blocks they manage, the chief warden sees all. Everything else is refused.
- A student may have one washer and one dryer at a time. A machine left in its grace period still counts until it is emptied.
- Cycle length is 1 to 60 minutes (lib/validators/laundry.ts). Machine states: Free -> InUse -> GracePeriod -> Free (when emptied). Maintenance is a warden-only side state, and only a Free machine can enter it.
- Timers are derived from timestamps in the database, never from background jobs or Redis TTLs (they expire silently and serverless has no worker). runLaundryTick() in lib/laundry.ts applies every due step and is safe to run concurrently: each step is claimed with updateMany naming the state it expects. It runs from GET /api/laundry, GET /api/notifications/count (so owners get warnings while off the page) and the optional cron route GET /api/laundry/tick (Bearer CRON_SECRET).
- Steps: 5 minutes left warning (skipped for cycles of 5 minutes or less) -> timer end, machine GracePeriod, owner has 10 minutes (measured from endsAt, not from when the tick ran) -> collect window over:
  - washer, a dryer is free: feed asks someone nearby to move the clothes to it;
  - washer, no dryer free: owner gets 10 more minutes (graceStage 1), then the feed asks for the basket or bag (table only if there is no basket);
  - dryer: feed asks for a basket or bag and says never the table.
- Others may move unattended clothes (empty a machine) only once graceStage >= 1. The owner can empty any time the cycle is running or done. Any student in the room can restart a dryer that is in GracePeriod; the clothes keep their owner and isRestartedByOther / restartedByStudentId record who restarted it.
- canStart, canRestart and canEmpty in lib/laundry.ts are used by both GET /api/laundry (to tell the UI what to offer) and the action routes (to enforce it). Change them in one place.
- Lowering the machine count retires idle machines (Machine.deletedAt) instead of deleting them, because sessions reference them. Labels are never reused. Always filter machines with deletedAt: null.
- The page ticks countdowns locally each second from server timestamps (corrected by serverTime) and refetches every 5s. React Query key: ["laundry"].

## Shift rules
- A shift is a Shift row: shiftIn, shiftOut, optional flag. Active = shiftOut null AND flag null (lib/shifts.ts activeShiftWhere). Use that constant, never hand-write the condition.
- Status is derived (shiftStatus): Active, Completed, NeedsReview (flag set, no shiftOut), Resolved (flag set, shiftOut set). The MissedLogout flag is never removed; it is the record of what happened.
- A guard starts a shift on one of their currently assigned blocks (BlockSecurity with removedAt null, read live, not from the JWT) and can have only one active shift. Start takes a lock on the guard's row so double taps create one shift.
- Ending: the End button, or signing out (logoutAction calls endOpenShiftsForUser, which never throws).
- Missed logout: a shift open for more than MAX_SHIFT_HOURS (12) is flagged by runShiftTick. The system never invents an end time. The block's active wardens are notified (category Shift), or the chief warden if the block has none. The guard can start a new shift straight away.
- runShiftTick follows the same pattern as the laundry tick: no background worker, idempotent (the flag is claimed with an updateMany expecting the shift to be unflagged), throttled by lib/tick-gate.ts, and called from GET /api/shifts, POST /api/shifts/start and GET /api/notifications/count.
- Only a warden of that block or the chief warden can resolve a flagged shift (PATCH /api/shifts/[id]) by giving the real end time: after shiftIn, not in the future. The guard is notified and the action is audited.
- Guards see only their own history. Wardens see shifts for blocks they manage, the chief warden sees all.

