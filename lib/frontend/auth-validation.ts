// Client-side mirror of the auth validation rules in docs/auth/AUTH-API-CONTRACT.md §2.
// The server is the source of truth; these only give early feedback.
// Validators return { [fieldPath]: code }; the UI maps codes to text (t.auth.validation).

export const INDUSTRIES = [
  "robotics",
  "autonomous-vehicles",
  "computer-vision",
  "manufacturing",
  "retail",
  "research",
  "other",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number];

/** Countries offered in the form (ISO-3166 alpha-2). The server accepts any valid code. */
export const COUNTRIES = [
  "TR", "US", "GB", "DE", "FR", "NL", "ES", "IT", "SE", "CH", "PL", "AT", "BE", "DK", "FI", "NO", "IE", "PT",
  "CA", "BR", "MX", "JP", "KR", "CN", "TW", "SG", "IN", "AE", "SA", "IL", "AU", "NZ", "ZA", "UA", "AZ",
] as const;

export type ValidationCode =
  | "required"
  | "email"
  | "tooLong"
  | "passwordLength"
  | "passwordMix"
  | "nameLength"
  | "companyNameLength"
  | "website"
  | "choice"
  | "terms"
  | "displayNameLength"
  | "displayNameChars";

export type FieldErrors = Partial<Record<string, ValidationCode>>;

export interface CompanyRegisterInput {
  email: string;
  password: string;
  contactName: string;
  company: {
    name: string;
    website?: string;
    industry: Industry | "";
    country: string;
    size: CompanySize | "";
  };
  acceptTerms: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_RE = /^[\p{L}\p{N} ._-]+$/u;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): ValidationCode | null {
  const e = normalizeEmail(email);
  if (!e) return "required";
  if (e.length > 254) return "tooLong";
  return EMAIL_RE.test(e) ? null : "email";
}

export function validatePassword(password: string): ValidationCode | null {
  if (!password) return "required";
  if (password.length < 8 || password.length > 128) return "passwordLength";
  return /\p{L}/u.test(password) && /\d/.test(password) ? null : "passwordMix";
}

function between(value: string, min: number, max: number) {
  const n = value.trim().length;
  return n >= min && n <= max;
}

function isHttpsUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}

/** Step 1 of the company form: the account itself. */
export function validateCompanyAccount(input: Pick<CompanyRegisterInput, "email" | "password" | "contactName">) {
  const errors: FieldErrors = {};
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  const password = validatePassword(input.password);
  if (password) errors.password = password;
  if (!input.contactName.trim()) errors.contactName = "required";
  else if (!between(input.contactName, 2, 80)) errors.contactName = "nameLength";
  return errors;
}

/** Step 2 of the company form: the company profile. */
export function validateCompanyProfile(company: CompanyRegisterInput["company"]) {
  const errors: FieldErrors = {};
  if (!company.name.trim()) errors["company.name"] = "required";
  else if (!between(company.name, 2, 120)) errors["company.name"] = "companyNameLength";
  if (company.website?.trim() && !isHttpsUrl(company.website.trim())) errors["company.website"] = "website";
  if (!(INDUSTRIES as readonly string[]).includes(company.industry)) errors["company.industry"] = "choice";
  if (!/^[A-Z]{2}$/.test(company.country)) errors["company.country"] = "choice";
  if (!(COMPANY_SIZES as readonly string[]).includes(company.size)) errors["company.size"] = "choice";
  return errors;
}

export function validateCompanyRegister(input: CompanyRegisterInput): FieldErrors {
  const errors: FieldErrors = { ...validateCompanyAccount(input), ...validateCompanyProfile(input.company) };
  if (input.acceptTerms !== true) errors.acceptTerms = "terms";
  return errors;
}

/** Contributor display name: 2–30 chars of letters, digits, space, dot, underscore, hyphen. */
export function validateDisplayName(name: string): ValidationCode | null {
  const n = name.trim();
  if (n.length < 2 || n.length > 30) return "displayNameLength";
  return DISPLAY_NAME_RE.test(n) ? null : "displayNameChars";
}

export function hasErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0;
}

/**
 * Only same-origin paths may be used as a post-login redirect: "/buyer?x=1" is fine,
 * "//evil.com", "/\\evil.com", "https://evil.com" and "javascript:…" are not.
 */
export function safeNext(next: string | null | undefined, fallback: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const base = "http://dbforge.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
