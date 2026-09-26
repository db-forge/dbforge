import { avatarFill } from "@/lib/frontend/tones";
import { cn } from "@/lib/frontend/utils";

/** Initials avatar. `colorKey` (e.g. company handle) picks a stable purple/pink/lemon fill. */
export function Avatar({
  initials,
  colorKey,
  className,
}: {
  initials: string;
  colorKey?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-sky font-mono text-sm font-bold text-ink",
        colorKey && avatarFill(colorKey),
        className,
      )}
    >
      {initials}
    </div>
  );
}
