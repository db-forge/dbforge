"use client";

import { cn } from "@/lib/frontend/utils";
import { useT } from "./I18nProvider";

export type BadgeStatus =
  | "accepted"
  | "rejected"
  | "review"
  | "verifying"
  | "active"
  | "completed"
  | "network";

const STYLES: Record<BadgeStatus, string> = {
  accepted: "border-money/40 bg-money/15 text-money",
  rejected: "border-danger/40 bg-danger/15 text-danger",
  review: "border-warn/40 bg-warn/15 text-warn",
  verifying: "border-border bg-surface text-link",
  active: "border-border bg-surface text-link",
  completed: "border-money/40 bg-money/15 text-money",
  network: "border-dashed border-border bg-transparent text-muted",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: BadgeStatus;
  label?: string;
  className?: string;
}) {
  const t = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        STYLES[status],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label ?? t.status[status]}
    </span>
  );
}
