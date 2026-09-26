"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { useLocale } from "@/components/I18nProvider";
import { Logo } from "@/components/shell/Logo";
import { Card } from "@/components/ui/card";
import { companyCopy } from "@/lib/frontend/i18n/auth/company";
import { cn } from "@/lib/frontend/utils";

export function useCompanyCopy() {
  return companyCopy[useLocale()] ?? companyCopy.tr;
}

export const inputClass =
  "w-full rounded-xl border-[1.5px] border-border bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-muted focus:border-primary aria-[invalid=true]:border-danger disabled:opacity-60";

/** Centered, mobile-first auth card. */
export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 py-8 sm:justify-center">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-flex" aria-label="DBForge">
          <Logo />
        </Link>
        <Card className="p-5 sm:p-7">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
      </div>
    </main>
  );
}

type A11y = { id: string; "aria-invalid": boolean; "aria-describedby"?: string };

/** Label + control + inline error, wired for screen readers. */
export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  children: (a11y: A11y) => ReactNode;
}) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-bold">
        <span>{label}</span>
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": error ? errId : undefined })}
      {error && (
        <p id={errId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormAlert({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "info" }) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-xl border-[1.5px] px-4 py-3 text-sm",
        tone === "danger" ? "border-danger/60 bg-danger/10 text-danger" : "border-primary/40 bg-primary/10",
      )}
    >
      {children}
    </p>
  );
}

export const linkClass = "font-bold text-link hover:underline";
