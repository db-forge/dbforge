// Auth client for company (email + password) and contributor (wallet + SIWE) accounts.
// Contract: docs/auth/AUTH-API-CONTRACT.md. Same functions for both data sources:
// - mock (default): ./auth-mock.ts, localStorage, works offline.
// - live: app/api/auth/* with the httpOnly `dbf_session` cookie (credentials: "include").
// The frontend never talks to Supabase Auth directly.
import * as mock from "./auth-mock";
import type { CompanyRegisterInput, FieldErrors } from "./auth-validation";
import { IS_LIVE } from "./config";
import { ApiRequestError, apiFetch } from "./http";

export type Session =
  | {
      kind: "company";
      userId: string;
      email: string;
      companyId: string;
      companyName: string;
      walletAddress: string | null;
      emailVerified: boolean;
    }
  | { kind: "contributor"; userId: string; walletAddress: string; displayName: string | null };

export type CompanySession = Extract<Session, { kind: "company" }>;
export type ContributorSession = Extract<Session, { kind: "contributor" }>;

export interface NonceResponse {
  message: string;
  nonce: string;
  expiresAt: string;
}

export { DEMO_COMPANY_LOGIN, demoSignature } from "./auth-mock";

// ---------- live transport ----------

function call<T>(path: string, body?: unknown, method = "POST") {
  return apiFetch<T>(path, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---------- session store (shared by every useSession) ----------

export type SessionState = { status: "loading" | "ready"; session: Session | null };

let state: SessionState = { status: "loading", session: null };
let inflight: Promise<Session | null> | null = null;
const listeners = new Set<() => void>();

function setSession(session: Session | null) {
  state = { status: "ready", session };
  listeners.forEach((l) => l());
  return session;
}

export function getSessionState() {
  return state;
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  if (state.status === "loading") void refreshSession();
  return () => {
    listeners.delete(listener);
  };
}

/** Reads the session from the backend (or mock) and updates every subscriber. */
export function refreshSession(): Promise<Session | null> {
  inflight ??= (IS_LIVE ? call<{ session: Session | null }>("/api/auth/session", undefined, "GET").then((r) => r.session) : mock.getSession())
    .catch(() => null)
    .then(setSession)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Last known session without a request (null while loading or signed out). */
export function currentSession() {
  return state.session;
}

// ---------- session ----------

export async function logout() {
  if (IS_LIVE) await call<null>("/api/auth/logout");
  else await mock.logout();
  setSession(null);
}

// ---------- company ----------

export async function registerCompany(input: CompanyRegisterInput): Promise<Session> {
  const session = IS_LIVE
    ? (await call<{ session: Session }>("/api/auth/company/register", input)).session
    : await mock.registerCompany(input);
  return setSession(session)!;
}

export async function loginCompany(email: string, password: string): Promise<Session> {
  const session = IS_LIVE
    ? (await call<{ session: Session }>("/api/auth/company/login", { email, password })).session
    : await mock.loginCompany(email, password);
  return setSession(session)!;
}

/** Always resolves for a valid email (no account enumeration). */
export async function requestPasswordReset(email: string): Promise<void> {
  if (IS_LIVE) await call<null>("/api/auth/company/password-reset", { email });
  else await mock.requestPasswordReset(email);
}

export async function requestCompanyWalletNonce(address: string): Promise<NonceResponse> {
  // The contract lists no body for this call; the address is sent so the server can
  // put it into the SIWE message (see open question in the A1 report).
  return IS_LIVE
    ? call<NonceResponse>("/api/auth/company/wallet/nonce", { address })
    : mock.requestCompanyWalletNonce(address);
}

export async function linkCompanyWallet(message: string, signature: string): Promise<Session> {
  const session = IS_LIVE
    ? (await call<{ session: Session }>("/api/auth/company/wallet/link", { message, signature })).session
    : await mock.linkCompanyWallet(message, signature);
  return setSession(session)!;
}

// ---------- contributor (SIWE) ----------

export async function requestWalletNonce(address: string): Promise<NonceResponse> {
  return IS_LIVE ? call<NonceResponse>("/api/auth/wallet/nonce", { address }) : mock.requestWalletNonce(address);
}

export async function verifyWallet(
  message: string,
  signature: string,
  displayName?: string,
): Promise<{ session: Session; created: boolean }> {
  const result = IS_LIVE
    ? await call<{ session: Session; created: boolean }>("/api/auth/wallet/verify", { message, signature, displayName })
    : await mock.verifyWallet(message, signature, displayName);
  setSession(result.session);
  return result;
}

export async function updateContributorProfile(displayName: string): Promise<Session> {
  const session = IS_LIVE
    ? (await call<{ session: Session }>("/api/auth/contributor/profile", { displayName }, "PATCH")).session
    : await mock.updateContributorProfile(displayName);
  return setSession(session)!;
}

// ---------- errors ----------

/** Field errors of a VALIDATION_FAILED response, if any. */
export function fieldErrorsOf(e: unknown): FieldErrors | null {
  if (!(e instanceof ApiRequestError) || e.code !== "VALIDATION_FAILED") return null;
  const fields = (e.details as { fields?: FieldErrors } | undefined)?.fields;
  return fields && typeof fields === "object" ? fields : null;
}

export function errorCodeOf(e: unknown) {
  return e instanceof ApiRequestError ? e.code : null;
}
