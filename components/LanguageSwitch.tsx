"use client";

import { Languages } from "lucide-react";
import { LOCALES, setLocaleCookie, type Locale } from "@/lib/frontend/i18n";
import { cn } from "@/lib/frontend/utils";
import { useLocale, useT } from "./I18nProvider";

function switchTo(locale: Locale) {
  setLocaleCookie(locale);
  // Full reload so server-rendered text and cached mock data both pick it up.
  window.location.reload();
}

/**
 * `segmented`: "TR | EN" pill. `toggle`: single round button showing the
 * current code (fits the compact side nav).
 */
export function LanguageSwitch({ variant = "segmented", className }: { variant?: "segmented" | "toggle"; className?: string }) {
  const locale = useLocale();
  const t = useT();

  if (variant === "toggle") {
    const next = locale === "tr" ? "en" : "tr";
    return (
      <button
        onClick={() => switchTo(next)}
        title={t.lang.switch}
        aria-label={`${t.lang.switch}: ${t.lang.names[next]}`}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-border bg-surface px-3 font-mono text-xs font-bold text-text uppercase hover:bg-border/40",
          className,
        )}
      >
        <Languages className="size-4 text-muted" />
        {locale}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={t.lang.switch}
      className={cn("inline-flex h-9 shrink-0 items-center rounded-full border-[1.5px] border-border bg-surface p-0.5", className)}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => l !== locale && switchTo(l)}
          aria-pressed={l === locale}
          title={t.lang.names[l]}
          className={cn(
            "h-full rounded-full px-2.5 font-mono text-xs font-bold uppercase transition-colors",
            l === locale ? "bg-primary text-white" : "text-muted hover:text-text",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
