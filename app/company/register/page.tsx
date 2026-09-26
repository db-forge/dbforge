"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useLocale } from "@/components/I18nProvider";
import { Button } from "@/components/ui/button";
import { errorCodeOf, fieldErrorsOf, registerCompany } from "@/lib/frontend/auth";
import {
  COMPANY_SIZES,
  COUNTRIES,
  INDUSTRIES,
  safeNext,
  validateCompanyAccount,
  validateCompanyProfile,
  validateCompanyRegister,
  type CompanyRegisterInput,
  type CompanySize,
  type Industry,
  type ValidationCode,
} from "@/lib/frontend/auth-validation";
import { cn } from "@/lib/frontend/utils";
import { AuthFrame, Field, FormAlert, inputClass, linkClass, useCompanyCopy } from "../_ui";

type Step = 0 | 1 | 2;
type Errors = Partial<Record<string, ValidationCode | "passwordMismatch">>;

const STEP1_KEYS = ["email", "password", "passwordRepeat", "contactName"];

/** 0–3: length, letters+digits, mixed case, symbol. Only a hint; the server rules are in validatePassword. */
function passwordScore(pw: string) {
  if (pw.length < 8) return 0;
  let s = 0;
  if (/\p{L}/u.test(pw) && /\d/.test(pw)) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[^\p{L}\d]/u.test(pw) || pw.length >= 14) s++;
  return s;
}

function stepOfErrors(errors: Errors): Step {
  const keys = Object.keys(errors);
  if (keys.some((k) => STEP1_KEYS.includes(k))) return 0;
  if (keys.some((k) => k.startsWith("company."))) return 1;
  return 2;
}

function RegisterForm() {
  const c = useCompanyCopy();
  const r = c.register;
  const locale = useLocale();
  const router = useRouter();
  const next = useSearchParams().get("next");

  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<CompanyRegisterInput>({
    email: "",
    password: "",
    contactName: "",
    company: { name: "", website: "", industry: "", country: "", size: "" },
    acceptTerms: false,
  });
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof CompanyRegisterInput>(key: K, value: CompanyRegisterInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setCompany = <K extends keyof CompanyRegisterInput["company"]>(key: K, value: CompanyRegisterInput["company"][K]) =>
    setForm((f) => ({ ...f, company: { ...f.company, [key]: value } }));
  const msg = (key: string) => {
    const code = errors[key];
    return code ? c.validation[code] : null;
  };

  function validateStep(s: Step): Errors {
    if (s === 0) {
      const e: Errors = validateCompanyAccount(form);
      if (!e.password && passwordRepeat !== form.password) e.passwordRepeat = "passwordMismatch";
      return e;
    }
    if (s === 1) return validateCompanyProfile(form.company);
    return validateCompanyRegister(form);
  }

  function goNext(e: FormEvent) {
    e.preventDefault();
    const found = validateStep(step);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    if (step < 2) {
      setStep((step + 1) as Step);
      return;
    }
    void submit();
  }

  async function submit() {
    setBusy(true);
    try {
      const website = form.company.website?.trim();
      await registerCompany({ ...form, company: { ...form.company, website: website || undefined } });
      router.replace(safeNext(next, "/buyer"));
    } catch (err) {
      const fields = fieldErrorsOf(err);
      const code = errorCodeOf(err);
      if (fields && Object.keys(fields).length) {
        setErrors(fields);
        setStep(stepOfErrors(fields));
      } else if (code === "EMAIL_TAKEN") {
        setErrors({});
        setFormError(r.emailTaken);
        setStep(0);
      } else {
        setFormError(code === "RATE_LIMITED" ? c.common.rateLimited : c.common.genericError);
      }
      setBusy(false);
    }
  }

  const score = passwordScore(form.password);
  const loginHref = next ? `/company/login?next=${encodeURIComponent(next)}` : "/company/login";

  return (
    <AuthFrame
      title={r.title}
      subtitle={r.subtitle}
      footer={
        <>
          {r.haveAccount}{" "}
          <Link href={loginHref} className={linkClass}>
            {r.login}
          </Link>
        </>
      }
    >
      <ol className="mb-5 flex gap-2" aria-label={r.stepOf(step + 1, 3)}>
        {r.steps.map((label, i) => (
          <li key={label} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <span className={cn("block h-1 rounded-full", i <= step ? "bg-primary" : "bg-border")} />
            <span className={cn("mt-1.5 block text-xs", i === step ? "font-bold" : "text-muted")}>{label}</span>
          </li>
        ))}
      </ol>

      <form onSubmit={goNext} noValidate className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}

        {step === 0 && (
          <>
            <Field label={c.common.email} error={msg("email")}>
              {(a) => (
                <input
                  {...a}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label={c.common.password} error={msg("password")}>
              {(a) => (
                <input
                  {...a}
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            {form.password && (
              <div aria-live="polite">
                <div className="flex gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full",
                        i <= score ? (score < 2 ? "bg-danger" : "bg-primary") : "bg-border",
                      )}
                    />
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {r.strengthLabel}: {r.strengthLevels[score]}
                </p>
              </div>
            )}
            <Field label={r.passwordRepeat} error={msg("passwordRepeat")}>
              {(a) => (
                <input
                  {...a}
                  type="password"
                  autoComplete="new-password"
                  value={passwordRepeat}
                  onChange={(e) => setPasswordRepeat(e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label={r.contactName} error={msg("contactName")}>
              {(a) => (
                <input
                  {...a}
                  autoComplete="name"
                  value={form.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={r.companyName} error={msg("company.name")}>
              {(a) => (
                <input
                  {...a}
                  autoComplete="organization"
                  value={form.company.name}
                  onChange={(e) => setCompany("name", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label={r.website} hint={r.optional} error={msg("company.website")}>
              {(a) => (
                <input
                  {...a}
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  autoComplete="url"
                  value={form.company.website ?? ""}
                  onChange={(e) => setCompany("website", e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label={r.industry} error={msg("company.industry")}>
              {(a) => (
                <select
                  {...a}
                  value={form.company.industry}
                  onChange={(e) => setCompany("industry", e.target.value as Industry)}
                  className={inputClass}
                >
                  <option value="">{r.choose}</option>
                  {INDUSTRIES.map((v) => (
                    <option key={v} value={v}>
                      {c.industries[v]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={r.country} error={msg("company.country")}>
                {(a) => (
                  <select
                    {...a}
                    autoComplete="country"
                    value={form.company.country}
                    onChange={(e) => setCompany("country", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{r.choose}</option>
                    {COUNTRIES.map((v) => (
                      <option key={v} value={v}>
                        {countryName(v, locale)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={r.size} error={msg("company.size")}>
                {(a) => (
                  <select
                    {...a}
                    value={form.company.size}
                    onChange={(e) => setCompany("size", e.target.value as CompanySize)}
                    className={inputClass}
                  >
                    <option value="">{r.choose}</option>
                    {COMPANY_SIZES.map((v) => (
                      <option key={v} value={v}>
                        {c.sizes[v]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border-[1.5px] border-border p-4 text-sm">
              <dt className="text-muted">{c.common.email}</dt>
              <dd className="truncate">{form.email}</dd>
              <dt className="text-muted">{r.contactName}</dt>
              <dd className="truncate">{form.contactName}</dd>
              <dt className="text-muted">{r.companyName}</dt>
              <dd className="truncate">{form.company.name}</dd>
              {form.company.industry && (
                <>
                  <dt className="text-muted">{r.industry}</dt>
                  <dd>{c.industries[form.company.industry]}</dd>
                </>
              )}
              <dt className="text-muted">{r.country}</dt>
              <dd>{form.company.country && countryName(form.company.country, locale)}</dd>
            </dl>
            <div>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  disabled={busy}
                  aria-invalid={!!errors.acceptTerms}
                  aria-describedby={errors.acceptTerms ? "terms-err" : undefined}
                  onChange={(e) => set("acceptTerms", e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-primary"
                />
                <span>{r.terms}</span>
              </label>
              {errors.acceptTerms && (
                <p id="terms-err" className="mt-1.5 text-xs text-danger">
                  {c.validation[errors.acceptTerms]}
                </p>
              )}
            </div>
          </>
        )}

        <div className="flex gap-3 pt-1">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={() => {
                setErrors({});
                setStep((step - 1) as Step);
              }}
            >
              {c.common.back}
            </Button>
          )}
          <Button type="submit" size="lg" className="flex-1" disabled={busy} aria-busy={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {step < 2 ? c.common.next : busy ? r.submitting : r.submit}
            {step === 2 && !busy && <Check className="size-4" aria-hidden />}
          </Button>
        </div>
      </form>
    </AuthFrame>
  );
}

function countryName(code: string, locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export default function CompanyRegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
