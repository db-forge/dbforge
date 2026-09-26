"use client";

import { cn } from "@/lib/frontend/utils";

type Option<T> = { value: T; label: string; count?: number };

/**
 * `pill`: rounded chips, selected one filled primary.
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
              className="flex flex-1 justify-center px-2 pt-3 hover:bg-border/40"
            >
              <span
                className={cn(
                  "border-b-4 pb-2.5 text-[15px] transition-colors",
                  active ? "border-primary font-bold text-text" : "border-transparent text-muted",
                )}
              >
                {o.label}
                {o.count !== undefined && <span className="ml-1 font-mono text-xs text-muted">{o.count}</span>}
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
              active ? "border-primary bg-primary text-white" : "border-border bg-surface text-text hover:bg-border/40",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn("ml-1", active ? "opacity-75" : "text-muted")}>· {o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
