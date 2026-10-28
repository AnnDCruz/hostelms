import type { FeedbackStatus } from "@prisma/client";
import { Badge, type Tone } from "@/components/ui/badge";

const CONFIG: Record<FeedbackStatus, { label: string; tone: Tone }> = {
  Submitted: { label: "Submitted", tone: "warn" },
  Acknowledged: { label: "Acknowledged", tone: "accent" },
  InReview: { label: "In review", tone: "accent" },
  Escalated: { label: "Escalated", tone: "staff" },
  Resolved: { label: "Resolved", tone: "success" },
};

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const { label, tone } = CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
