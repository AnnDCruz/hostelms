import type { MaintenanceStatus } from "@prisma/client";
import { Badge, type Tone } from "@/components/ui/badge";

const CONFIG: Record<MaintenanceStatus, { label: string; tone: Tone }> = {
  Pending: { label: "Pending", tone: "warn" },
  InProgress: { label: "In progress", tone: "accent" },
  Resolved: { label: "Resolved", tone: "success" },
};

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const { label, tone } = CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
