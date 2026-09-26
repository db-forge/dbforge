import { cn } from "@/lib/frontend/utils";

export function ProgressBar({
  value,
  max,
  className,
  size = "md",
  tone = "primary",
}: {
  value: number;
  max: number;
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "primary" | "success";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        "w-full overflow-hidden rounded-full bg-sky/60",
        size === "sm" && "h-1.5",
        size === "md" && "h-2.5",
        size === "lg" && "h-4 border-[1.5px] border-line bg-ice",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          tone === "success" ? "bg-success" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
