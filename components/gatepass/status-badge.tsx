import type { GatepassStatus } from "@prisma/client";
import { Badge, type Tone } from "@/components/ui/badge";

const CONFIG: Record<GatepassStatus, { label: string; tone: Tone }> = {
  Request: { label: "Waiting for parent", tone: "warn" },
  ParentApproval: { label: "Waiting for warden", tone: "accent" },
  WardenApproval: { label: "Approved", tone: "success" },
  Exit: { label: "Out of hostel", tone: "staff" },
  Returned: { label: "Returned", tone: "neutral" },
  ReturnedLate: { label: "Returned late", tone: "danger" },
  Rejected: { label: "Rejected", tone: "danger" },
};

// A request that nobody approved in time is shown as Expired (display only, nothing is written).
export function StatusBadge({ status, expired = false }: { status: GatepassStatus; expired?: boolean }) {
  if (expired && (status === "Request" || status === "ParentApproval")) {
    return <Badge tone="danger">Expired</Badge>;
  }
  const { label, tone } = CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
