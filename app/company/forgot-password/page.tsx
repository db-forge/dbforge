"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { errorCodeOf, requestPasswordReset } from "@/lib/frontend/auth";
import { validateEmail, type ValidationCode } from "@/lib/frontend/auth-validation";
import { AuthFrame, Field, FormAlert, inputClass, linkClass, useCompanyCopy } from "../_ui";

export default function ForgotPasswordPage() {
  const c = useCompanyCopy();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<ValidationCode | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    setError(err);
    setRateLimited(false);
    if (err) return;
    setBusy(true);
    try {
      await requestPasswordReset(email);
    } catch (e) {
      // Never reveal whether the account exists; only a throttle is worth telling apart.
      if (errorCodeOf(e) === "RATE_LIMITED") {
        setRateLimited(true);
        setBusy(false);
        return;
      }
    }
    setSent(true);
    setBusy(false);
  }

  return (
    <AuthFrame
      title={c.forgot.title}
      subtitle={c.forgot.subtitle}
      footer={
        <Link href="/company/login" className={linkClass}>
          {c.forgot.backToLogin}
        </Link>
      }
    >
      {sent ? (
        <FormAlert tone="info">{c.forgot.sent}</FormAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {rateLimited && <FormAlert>{c.common.rateLimited}</FormAlert>}
          <Field label={c.common.email} error={error && c.validation[error]}>
            {(a) => (
              <input
                {...a}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
          <Button type="submit" size="lg" className="w-full" disabled={busy} aria-busy={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {busy ? c.forgot.submitting : c.forgot.submit}
          </Button>
        </form>
      )}
    </AuthFrame>
  );
}
