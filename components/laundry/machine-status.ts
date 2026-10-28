import type { LaundryFeedEntryType } from "@prisma/client";
import type { Tone } from "@/components/ui/badge";
import type { MachineDTO } from "@/lib/types";

// 754000 ms -> "12:34". Never negative.
export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// What a machine card says, worked out from server timestamps and the (server-corrected) current time.
export function describeMachine(m: MachineDTO, nowMs: number): { tone: Tone; label: string; detail: string; timer: string | null } {
  const s = m.session;
  const owner = s ? (s.isMine ? "You" : s.ownerName) : "";

  if (m.state === "Maintenance") return { tone: "staff", label: "Out of service", detail: "Under maintenance", timer: null };
  if (m.state === "Free" || !s) return { tone: "success", label: "Free", detail: "Available", timer: null };

  if (m.state === "InUse") {
    const left = new Date(s.endsAt).getTime() - nowMs;
    return left > 0
      ? { tone: "accent", label: "In use", detail: `${formatClock(left)} left · ${owner}`, timer: `${formatClock(left)} left` }
      : { tone: "accent", label: "Finishing", detail: `Almost done · ${owner}`, timer: "Almost done" };
  }

  // GracePeriod
  const graceLeft = s.gracePeriodEndsAt ? new Date(s.gracePeriodEndsAt).getTime() - nowMs : 0;
  if (s.graceStage === 0) {
    return graceLeft > 0
      ? { tone: "warn", label: "Collect now", detail: `${owner}: ${formatClock(graceLeft)} to collect`, timer: `${formatClock(graceLeft)} to collect` }
      : { tone: "danger", label: "Clothes waiting", detail: `${owner}'s clothes are still inside`, timer: "Collect now" };
  }
  if (s.graceStage === 1) {
    return graceLeft > 0
      ? { tone: "warn", label: "Waiting for a dryer", detail: `${owner}: last ${formatClock(graceLeft)} to collect`, timer: `${formatClock(graceLeft)} to collect` }
      : { tone: "danger", label: "Clothes waiting", detail: `${owner}'s clothes are still inside`, timer: "Collect now" };
  }
  return { tone: "danger", label: "Unattended", detail: `${owner}'s clothes can be moved`, timer: "Collect now" };
}

export const FEED_LABELS: Record<LaundryFeedEntryType, { label: string; tone: Tone }> = {
  SessionStart: { label: "Started", tone: "accent" },
  FiveMinWarning: { label: "5 min left", tone: "warn" },
  TimerEnd: { label: "Finished", tone: "warn" },
  GracePeriodStart: { label: "Waiting", tone: "warn" },
  MoveToAvailableDryer: { label: "Move to dryer", tone: "danger" },
  MoveToBasket: { label: "Move to basket", tone: "danger" },
  MoveToTable: { label: "Move to table", tone: "danger" },
  DryerRestartBySelf: { label: "Restarted", tone: "accent" },
  DryerRestartByOther: { label: "Restarted", tone: "accent" },
  MachineEmptied: { label: "Collected", tone: "success" },
};
