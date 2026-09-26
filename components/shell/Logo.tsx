import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/frontend/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 place-items-center rounded-xl border-[1.5px] border-ink bg-white font-mono text-sm font-bold text-ink",
        className,
      )}
    >
      DB
    </span>
  );
}

/** Wordmark, optionally followed by a breadcrumb ("DBForge / Şirket · Yeni post"). */
export function Logo({
  compact = false,
  href = "/",
  crumb,
}: {
  compact?: boolean;
  href?: string;
  crumb?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <Link href={href} className="shrink-0">
        {compact ? <LogoMark /> : <span className="text-2xl font-bold tracking-tight">DBForge</span>}
      </Link>
      {crumb && <span className="truncate text-sm text-ink/60">/ {crumb}</span>}
    </div>
  );
}
