import { cn } from "@/lib/frontend/utils";

export type BadgeStatus =
  | "accepted"
  | "rejected"
  | "review"
  | "verifying"
  | "active"
  | "completed"
  | "network";

const STYLES: Record<BadgeStatus, { label: string; className: string }> = {
  accepted: { label: "Kabul", className: "border-success/40 bg-success/15 text-success" },
  rejected: { label: "Red", className: "border-danger/40 bg-danger/15 text-danger" },
  review: { label: "İnceleniyor", className: "border-warning/40 bg-warning/15 text-warning" },
  verifying: { label: "Doğrulanıyor", className: "border-sky bg-ice text-accent" },
  active: { label: "Aktif", className: "border-sky bg-ice text-accent" },
  completed: { label: "Tamamlandı", className: "border-success/40 bg-success/15 text-success" },
  network: { label: "Monad Testnet", className: "border-sky bg-ice text-ink" },
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
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        s.className,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label ?? s.label}
    </span>
  );
}
