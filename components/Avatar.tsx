import { cn } from "@/lib/frontend/utils";

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <div
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-sky font-mono text-sm font-bold text-ink",
        className,
      )}
    >
      {initials}
    </div>
  );
}
