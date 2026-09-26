"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { errorCodeOf, loginCompany } from "@/lib/frontend/auth";
import { safeNext, validateEmail, type FieldErrors } from "@/lib/frontend/auth-validation";
import { AuthFrame, Field, FormAlert, inputClass, linkClass, useCompanyCopy } from "../_ui";

function LoginForm() {
  const c = useCompanyCopy();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const emailErr = validateEmail(email);
    const found: FieldErrors = {};
    if (emailErr) found.email = emailErr;
    if (!password) found.password = "required";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await loginCompany(email, password);
      router.replace(safeNext(next, "/buyer"));
    } catch (err) {
      const code = errorCodeOf(err);
      setFormError(
        code === "INVALID_CREDENTIALS" ? c.login.invalid : code === "RATE_LIMITED" ? c.common.rateLimited : c.common.genericError,
      );
      setBusy(false);
    }
  }

  const registerHref = next ? `/company/register?next=${encodeURIComponent(next)}` : "/company/register";

  return (
    <AuthFrame
      title={c.login.title}
      subtitle={c.login.subtitle}
      footer={
        <>
          {c.login.noAccount}{" "}
          <Link href={registerHref} className={linkClass}>
            {c.login.register}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <Field label={c.common.email} error={errors.email && c.validation[errors.email]}>
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
        <Field
          label={c.common.password}
          error={errors.password && c.validation[errors.password]}
          hint={
            <Link href="/company/forgot-password" className={linkClass}>
              {c.login.forgot}
            </Link>
          }
        >
          {(a) => (
            <input
              {...a}
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={busy} aria-busy={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {busy ? c.login.submitting : c.login.submit}
        </Button>
      </form>
    </AuthFrame>
  );
}

export default function CompanyLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
