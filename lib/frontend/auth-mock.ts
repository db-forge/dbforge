// In-browser mock of app/api/auth/* (docs/auth/AUTH-API-CONTRACT.md), used when
// NEXT_PUBLIC_DATA_SOURCE ≠ live. Same function signatures as the live calls in
// ./auth.ts, state in localStorage so demos work offline. Passwords are stored as
// PBKDF2 hashes, never as plain text. Only ./auth.ts should import this file.
import { getAddress, recoverMessageAddress } from "viem";
import { createSiweMessage, generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { DEMO_USER_ADDRESS } from "@/lib/mock/store";
import type { NonceResponse, Session } from "./auth";
import {
  hasErrors,
  normalizeEmail,
  validateCompanyRegister,
  validateDisplayName,
  validateEmail,
  type CompanyRegisterInput,
  type FieldErrors,
} from "./auth-validation";
import { ApiRequestError, errorMessage } from "./http";
import { t } from "./i18n";
import { seededHex, sleep } from "./utils";

const STORAGE_KEY = "dbforge-auth-v1";
const LATENCY = 300;
const NONCE_TTL_MS = 10 * 60_000;
const PBKDF2_ITERATIONS = 100_000;
const SIWE_CHAIN_ID = 10143;
const SIWE_STATEMENT = "Sign in to DBForge";

interface MockCompanyAccount {
  userId: string;
  email: string;
  passwordHash: string;
  contactName: string;
  companyId: string;
  company: CompanyRegisterInput["company"];
  walletAddress: string | null;
}

interface MockContributor {
  userId: string;
  walletAddress: string;
  displayName: string | null;
}

interface MockNonce {
  nonce: string;
  address: string;
  purpose: "contributor_signin" | "company_wallet_link";
  subjectId: string | null;
  expiresAt: number;
  usedAt: number | null;
}

interface AuthDb {
  companies: MockCompanyAccount[];
  contributors: MockContributor[];
  nonces: MockNonce[];
  session: { kind: Session["kind"]; subjectId: string } | null;
}

/** Demo company so the buyer panel works right away: demo@novarobotics.ai / demo1234. */
export const DEMO_COMPANY_LOGIN = { email: "demo@novarobotics.ai", password: "demo1234" };

const DEMO_COMPANY: MockCompanyAccount = {
  userId: "u-demo-company",
  email: DEMO_COMPANY_LOGIN.email,
  // PBKDF2-SHA256 of the demo password (precomputed; see hashPassword).
  passwordHash:
    "pbkdf2$100000$6462666f7267652d64656d6f2d73616c$741f2ee40c3830ac2715109fb6e315d40ace2fff955cde0ee54dafa13f953edf",
  contactName: "Ayşe Yılmaz",
  companyId: "c-demo-nova",
  company: { name: "Nova Robotics", website: "https://novarobotics.ai", industry: "robotics", country: "TR", size: "11-50" },
  walletAddress: null,
};

// ---------- storage ----------

function emptyDb(): AuthDb {
  return { companies: [DEMO_COMPANY], contributors: [], nonces: [], session: null };
}

function readDb(): AuthDb {
  if (typeof window === "undefined") return emptyDb();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthDb) : emptyDb();
  } catch {
    return emptyDb();
  }
}

function writeDb(db: AuthDb) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // storage unavailable: the session only lives until reload
  }
}

// ---------- helpers ----------

function fail(status: number, code: string, details?: unknown): never {
  throw new ApiRequestError(status, code, errorMessage(code, t().errors.requestFailed), details);
}

function failFields(fields: FieldErrors): never {
  fail(400, "VALIDATION_FAILED", { fields });
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomId(prefix: string) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}-${hex(bytes)}`;
}

async function pbkdf2(password: string, saltHex: string, iterations: number) {
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)));
  // crypto.subtle only exists in secure contexts (https, localhost). On a plain-http
  // LAN demo fall back to a non-cryptographic digest: this is mock data only.
  if (!globalThis.crypto?.subtle) return seededHex(`${saltHex}:${iterations}:${password}`, 32).slice(2);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return hex(new Uint8Array(bits));
}

async function hashPassword(password: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltHex = hex(salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${await pbkdf2(password, saltHex, PBKDF2_ITERATIONS)}`;
}

async function checkPassword(password: string, stored: string) {
  const [, iterations, saltHex, expected] = stored.split("$");
  return (await pbkdf2(password, saltHex, Number(iterations))) === expected;
}

function resolveSession(db: AuthDb): Session | null {
  const s = db.session;
  if (!s) return null;
  if (s.kind === "company") {
    const c = db.companies.find((x) => x.userId === s.subjectId);
    return c
      ? {
          kind: "company",
          userId: c.userId,
          email: c.email,
          companyId: c.companyId,
          companyName: c.company.name,
          walletAddress: c.walletAddress,
          emailVerified: false,
        }
      : null;
  }
  const u = db.contributors.find((x) => x.userId === s.subjectId);
  return u ? { kind: "contributor", userId: u.userId, walletAddress: u.walletAddress, displayName: u.displayName } : null;
}

function signIn(db: AuthDb, kind: Session["kind"], subjectId: string): Session {
  // One session per browser: signing in as the other kind replaces it.
  db.session = { kind, subjectId };
  writeDb(db);
  return resolveSession(db)!;
}

/** One wallet may only identify one account inside the same role. */
function companyWalletTaken(db: AuthDb, address: string, exceptUserId?: string) {
  const a = address.toLowerCase();
  return db.companies.some((x) => x.walletAddress === a && x.userId !== exceptUserId);
}

function displayNameTaken(db: AuthDb, name: string, exceptUserId?: string) {
  const n = name.trim().toLowerCase();
  return db.contributors.some((x) => x.displayName?.toLowerCase() === n && x.userId !== exceptUserId);
}

// ---------- session ----------

export async function getSession(): Promise<Session | null> {
  return resolveSession(readDb());
}

export async function logout() {
  const db = readDb();
  db.session = null;
  writeDb(db);
}

// ---------- company ----------

export async function registerCompany(input: CompanyRegisterInput): Promise<Session> {
  await sleep(LATENCY);
  const errors = validateCompanyRegister(input);
  if (hasErrors(errors)) failFields(errors);
  const db = readDb();
  const email = normalizeEmail(input.email);
  if (db.companies.some((c) => c.email === email)) fail(409, "EMAIL_TAKEN");
  const account: MockCompanyAccount = {
    userId: randomId("u"),
    email,
    passwordHash: await hashPassword(input.password),
    contactName: input.contactName.trim(),
    companyId: randomId("c"),
    company: {
      ...input.company,
      name: input.company.name.trim(),
      website: input.company.website?.trim() || undefined,
    },
    walletAddress: null,
  };
  db.companies.push(account);
  return signIn(db, "company", account.userId);
}

export async function loginCompany(email: string, password: string): Promise<Session> {
  await sleep(LATENCY);
  const db = readDb();
  const account = db.companies.find((c) => c.email === normalizeEmail(email));
  // Same error for unknown email and wrong password (no account enumeration).
  if (!account || !(await checkPassword(password, account.passwordHash))) fail(401, "INVALID_CREDENTIALS");
  return signIn(db, "company", account.userId);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await sleep(LATENCY);
  const code = validateEmail(email);
  if (code) failFields({ email: code });
  // Always "accepted", whether or not the account exists.
}

// ---------- SIWE (contributor sign-in and company wallet link) ----------

function issueNonce(address: string, purpose: MockNonce["purpose"], subjectId: string | null): NonceResponse {
  const db = readDb();
  const now = Date.now();
  const nonce = generateSiweNonce();
  const expiresAt = now + NONCE_TTL_MS;
  const message = createSiweMessage({
    domain: window.location.host,
    uri: window.location.origin,
    address: getAddress(address),
    chainId: SIWE_CHAIN_ID,
    statement: SIWE_STATEMENT,
    nonce,
    version: "1",
    issuedAt: new Date(now),
    expirationTime: new Date(expiresAt),
  });
  db.nonces = [
    ...db.nonces.filter((n) => n.expiresAt > now && n.usedAt === null),
    { nonce, address: address.toLowerCase(), purpose, subjectId, expiresAt, usedAt: null },
  ];
  writeDb(db);
  return { message, nonce, expiresAt: new Date(expiresAt).toISOString() };
}

/**
 * The wagmi demo connector (machines without MetaMask) cannot sign. In mock mode
 * the UI signs with this marker instead; it is accepted for the demo address only.
 */
export function demoSignature(message: string) {
  return seededHex(`dbforge-demo-signature:${message}`, 65) as `0x${string}`;
}

/** Checks a signed SIWE message and consumes its nonce. Returns the signer (lower-case). */
async function consumeSignedMessage(db: AuthDb, message: string, signature: string, purpose: MockNonce["purpose"]) {
  const parsed = parseSiweMessage(message);
  const nonce = db.nonces.find((n) => n.nonce === parsed.nonce && n.purpose === purpose);
  const address = parsed.address?.toLowerCase();
  if (
    !nonce ||
    nonce.usedAt !== null ||
    nonce.expiresAt < Date.now() ||
    nonce.address !== address ||
    parsed.domain !== window.location.host ||
    parsed.chainId !== SIWE_CHAIN_ID
  ) {
    fail(400, "NONCE_INVALID");
  }
  const isDemo = address === DEMO_USER_ADDRESS.toLowerCase() && signature === demoSignature(message);
  if (!isDemo) {
    let signer: string | null = null;
    try {
      signer = (await recoverMessageAddress({ message, signature: signature as `0x${string}` })).toLowerCase();
    } catch {
      signer = null;
    }
    if (signer !== address) fail(401, "SIGNATURE_INVALID");
  }
  nonce.usedAt = Date.now();
  return { address: address!, nonce };
}

export async function requestWalletNonce(address: string): Promise<NonceResponse> {
  await sleep(LATENCY);
  return issueNonce(address, "contributor_signin", null);
}

export async function verifyWallet(
  message: string,
  signature: string,
  displayName?: string,
): Promise<{ session: Session; created: boolean }> {
  await sleep(LATENCY);
  const db = readDb();
  const { address } = await consumeSignedMessage(db, message, signature, "contributor_signin");
  let user = db.contributors.find((x) => x.walletAddress === address);
  const created = !user;
  if (!user) {
    const name = displayName?.trim() || null;
    if (name) {
      const code = validateDisplayName(name);
      if (code) failFields({ displayName: code });
      if (displayNameTaken(db, name)) fail(409, "DISPLAY_NAME_TAKEN");
    }
    user = { userId: randomId("u"), walletAddress: address, displayName: name };
    db.contributors.push(user);
  }
  return { session: signIn(db, "contributor", user.userId), created };
}

export async function updateContributorProfile(displayName: string): Promise<Session> {
  await sleep(LATENCY);
  const db = readDb();
  const session = resolveSession(db);
  if (session?.kind !== "contributor") fail(401, "UNAUTHENTICATED");
  const code = validateDisplayName(displayName);
  if (code) failFields({ displayName: code });
  if (displayNameTaken(db, displayName, session.userId)) fail(409, "DISPLAY_NAME_TAKEN");
  db.contributors = db.contributors.map((x) =>
    x.userId === session.userId ? { ...x, displayName: displayName.trim() } : x,
  );
  writeDb(db);
  return resolveSession(db)!;
}

export async function requestCompanyWalletNonce(address: string): Promise<NonceResponse> {
  await sleep(LATENCY);
  const session = resolveSession(readDb());
  if (session?.kind !== "company") fail(401, "UNAUTHENTICATED");
  return issueNonce(address, "company_wallet_link", session.userId);
}

export async function linkCompanyWallet(message: string, signature: string): Promise<Session> {
  await sleep(LATENCY);
  const db = readDb();
  const session = resolveSession(db);
  if (session?.kind !== "company") fail(401, "UNAUTHENTICATED");
  const { address, nonce } = await consumeSignedMessage(db, message, signature, "company_wallet_link");
  if (nonce.subjectId !== session.userId) fail(400, "NONCE_INVALID");
  if (companyWalletTaken(db, address, session.userId)) {
    writeDb(db);
    fail(409, "WALLET_IN_USE");
  }
  db.companies = db.companies.map((c) => (c.userId === session.userId ? { ...c, walletAddress: address } : c));
  writeDb(db);
  return resolveSession(db)!;
}
