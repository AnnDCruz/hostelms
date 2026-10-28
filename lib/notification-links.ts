import type { Role } from "@prisma/client";
import { NAV, ROLE_HOME } from "@/lib/constants";

// Notification source record -> the page that shows it.
const PAGE: Record<string, string> = {
  Gatepass: "gatepass",
  MaintenanceRequest: "maintenance",
  Feedback: "feedback",
  Notice: "notices",
  Laundry: "laundry",
  Shift: "shifts",
  Room: "profile",
};

// Boards for these entities open the record's popover when given ?open=<id>.
const OPENS_RECORD = new Set(["Gatepass", "MaintenanceRequest", "Feedback", "Notice"]);

// Returns null when the role has no page for that entity (the notification is then just marked read).
export function notificationHref(role: Role, entity: string | null, id: string | null): string | null {
  if (!entity || !PAGE[entity]) return null;
  const href = `${ROLE_HOME[role]}/${PAGE[entity]}`;
  if (!NAV[role].some((n) => n.href === href)) return null;
  return id && OPENS_RECORD.has(entity) ? `${href}?open=${encodeURIComponent(id)}` : href;
}
