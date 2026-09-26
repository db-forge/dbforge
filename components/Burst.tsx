import { cn } from "@/lib/frontend/utils";

/** 8-point starburst used as a decorative accent. */
export function Burst({ className }: { className?: string }) {
  const pts = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : 20;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn("size-10 fill-primary", className)}>
      <polygon points={pts} />
    </svg>
  );
}
