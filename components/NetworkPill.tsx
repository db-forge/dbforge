import { cn } from "@/lib/frontend/utils";

export function NetworkPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full border-[1.5px] border-dashed border-ink bg-white px-2.5 font-mono text-[11px] text-ink",
        className,
      )}
    >
      Monad Testnet
    </span>
  );
}
