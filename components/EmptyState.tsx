import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/frontend/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border-[1.5px] border-dashed border-sky bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-12 place-items-center rounded-full border-[1.5px] border-line bg-ice">
        <Icon className="size-5 text-accent" />
      </div>
      <p className="font-bold">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-ink/70">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
