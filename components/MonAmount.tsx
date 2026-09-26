import { cn, formatMon } from "@/lib/frontend/utils";

const SIZES = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-5xl",
};

/** MON figures are always big, bold and primary. */
export function MonAmount({
  value,
  size = "md",
  sign,
  digits = 2,
  className,
}: {
  value: number;
  size?: keyof typeof SIZES;
  sign?: boolean;
  digits?: number;
  className?: string;
}) {
  return (
    <span className={cn("font-bold tracking-tight text-primary tabular-nums", SIZES[size], className)}>
      {sign && "+"}
      {formatMon(value, digits)}
      <span className="ml-1 text-[0.6em] font-bold">MON</span>
    </span>
  );
}
