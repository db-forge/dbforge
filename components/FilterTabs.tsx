"use client";

import { cn } from "@/lib/frontend/utils";

type Option<T> = { value: T; label: string; count?: number };

/**
 * `pill`: rounded chips, selected one filled with ink.
 * `underline`: X-style equal-width tabs with a primary indicator.
 * `responsive`: pills on mobile, underline tabs from md up.
 */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
  variant = "pill",
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  variant?: "pill" | "underline" | "responsive";
  className?: string;
}) {
  if (variant === "responsive") {
    return (
      <>
        <FilterTabs options={options} value={value} onChange={onChange} className={cn("md:hidden", className)} />
        <FilterTabs
          options={options}
          value={value}
          onChange={onChange}
          variant="underline"
          className={cn("hidden md:flex", className)}
        />
      </>
    );
  }

  if (variant === "underline") {
    return (
      <div role="tablist" className={cn("flex", className)}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className="flex flex-1 justify-center px-2 pt-3 hover:bg-ice/60"
            >
              <span
                className={cn(
                  "border-b-4 pb-2.5 text-[15px] transition-colors",
                  active ? "border-primary font-bold text-ink" : "border-transparent text-ink/60",
                )}
              >
                {o.label}
                {o.count !== undefined && <span className="ml-1 font-mono text-xs text-ink/50">{o.count}</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="tablist" className={cn("flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 shrink-0 rounded-full border-[1.5px] px-4 text-sm font-medium transition-colors",
              active ? "border-ink bg-ink text-white" : "border-ink bg-white text-ink hover:bg-ice",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("ml-1", active ? "text-white/80" : "text-ink/60")}>· {o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
