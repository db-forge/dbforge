import Link from "next/link";
import { cn } from "@/lib/frontend/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 place-items-center rounded-xl border-[1.5px] border-ink bg-primary font-mono text-sm font-bold text-white",
        className,
      )}
    >
      DB
    </span>
  );
}

export function Logo({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <LogoMark />
      {!compact && (
        <span className="text-xl font-bold tracking-tight">
          DB<span className="text-primary">Forge</span>
        </span>
      )}
    </Link>
  );
}
