"use client";

import { cn } from "@/lib/frontend/utils";

export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 shrink-0 rounded-full border-[1.5px] px-4 text-sm font-medium transition-colors",
              active ? "border-primary bg-primary text-white" : "border-ink bg-white text-ink hover:bg-ice",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("ml-1.5 font-mono text-xs", active ? "text-white/80" : "text-ink/50")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
