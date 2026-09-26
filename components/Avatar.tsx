import { cn } from "@/lib/frontend/utils";

/** Initials avatar for people (companies use CompanyAvatar). */
export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <div
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-border bg-surface font-mono text-sm font-bold text-text",
        className,
      )}
    >
      {initials}
    </div>
  );
}
