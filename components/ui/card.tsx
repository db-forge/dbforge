import type { ComponentProps } from "react";
import { cn } from "@/lib/frontend/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-2xl border-[1.5px] border-line bg-surface", className)}
      {...props}
    />
  );
}

export function SectionTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("text-lg font-bold tracking-tight text-ink", className)} {...props} />;
}

export function MonoLabel({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("font-mono text-[11px] uppercase tracking-wider text-ink/60", className)}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-xl bg-sky/40", className)} {...props} />;
}
