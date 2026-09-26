import { cn } from "@/lib/frontend/utils";

export function ProgressBar({
  value,
  max,
  className,
  size = "md",
}: {
  value: number;
  max: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        "w-full overflow-hidden rounded-full bg-border",
        size === "sm" && "h-1.5",
        size === "md" && "h-2.5",
        size === "lg" && "h-4",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
