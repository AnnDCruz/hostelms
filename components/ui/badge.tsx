import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "success" | "warn" | "danger" | "staff";

const tones: Record<Tone, string> = {
  neutral: "bg-surface text-muted border-border",
  accent: "bg-accent/10 text-accent border-accent/20",
  success: "bg-success/10 text-success border-success/20",
  warn: "bg-warn/10 text-warn border-warn/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  staff: "bg-staff/10 text-staff border-staff/20",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}
      {...props}
    />
  );
}
