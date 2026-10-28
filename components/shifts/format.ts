import type { Tone } from "@/components/ui/badge";
import type { ShiftStatus } from "@/lib/types";

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

// 125 -> "2h 5m", 45 -> "45m", 0 -> "0m"
export function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// 3 725 000 ms -> "1:02:05" for the live clock on a running shift.
export function fmtRunning(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const STATUS_META: Record<ShiftStatus, { label: string; tone: Tone }> = {
  Active: { label: "On shift", tone: "accent" },
  Completed: { label: "Completed", tone: "success" },
  NeedsReview: { label: "Missed logout", tone: "danger" },
  Resolved: { label: "Missed logout, resolved", tone: "warn" },
};

// The value a <input type="datetime-local"> wants: local time as "YYYY-MM-DDTHH:mm".
export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
