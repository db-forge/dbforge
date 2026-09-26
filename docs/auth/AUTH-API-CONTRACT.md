# Auth & onboarding — API contract (frontend ↔ backend)

Branch: `feat/auth-onboarding` (from `main` @ `93414e3`). Status: **draft for Developer 3**. The frontend is built against
this contract (mock first, live when these endpoints exist).

Decision (2026-09-26, product owner):

| Account type | Sign-up / sign-in | Why |
|---|---|---|
| **Company** (buyer) | Email + password, plus a company profile. Links a wallet later to fund missions. | Companies need a recoverable, organisational account and do not always have a wallet on day one. |
| **Contributor** (end user) | Wallet only: connect MetaMask and sign an EIP-4361 (SIWE) message. Optional display name. | The payout address is the identity. No password to forget. |

The frontend talks **only** to `app/api/auth/*`. It never calls Supabase Auth directly and never sees a service key.

---

## 1. Session model

- One httpOnly cookie `dbf_session` set by the backend: `HttpOnly; Secure; SameSite=Lax; Path=/`, 7 days.
- The cookie holds a random session id (or a signed token). The server resolves it to:
  ```ts
  type Session =
    | { kind: "company"; userId: string; email: string; companyId: string; companyName: string;
        walletAddress: string | null; emailVerified: boolean }
    | { kind: "contributor"; userId: string; walletAddress: string; displayName: string | null };
  ```
- A browser has **one** session at a time. Signing in as the other kind replaces it.
- All state-changing auth routes check the `Origin` header against the app origin (CSRF), on top of `SameSite=Lax`.

## 2. Endpoints

All responses use the existing API envelope (`app/api/_lib/errors.ts`). Errors below are `error.code` values.

### 2.1 `GET /api/auth/session`
→ `200 { session: Session | null }`. Never 401; `null` means signed out.

### 2.2 `POST /api/auth/logout`
→ `204`. Clears the cookie and deletes the server session.

### 2.3 Company

**`POST /api/auth/company/register`**
```json
{
  "email": "ops@novarobotics.ai",
  "password": "********",
  "contactName": "Ayşe Yılmaz",
  "company": {
    "name": "Nova Robotics",
    "website": "https://novarobotics.ai",
    "industry": "robotics",
    "country": "TR",
    "size": "11-50"
  },
  "acceptTerms": true
}
```
- Validation (server is the source of truth; the frontend mirrors it):
  - `email`: valid, lower-cased, max 254.
  - `password`: 8–128 chars, at least one letter and one digit.
  - `contactName`: 2–80.
  - `company.name`: 2–120.
  - `website`: optional `https://` URL.
  - `industry` ∈ `robotics | autonomous-vehicles | computer-vision | manufacturing | retail | research | other`.
  - `country`: ISO-3166 alpha-2.
  - `size` ∈ `1-10 | 11-50 | 51-200 | 201-1000 | 1000+`.
  - `acceptTerms`: must be `true`.
- → `201 { session }` (signed in immediately; `emailVerified: false` until the link is clicked, if verification is on).
- Errors: `VALIDATION_FAILED` (with `fields: { [path]: code }`), `EMAIL_TAKEN` (409), `RATE_LIMITED` (429).

**`POST /api/auth/company/login`** `{ "email", "password" }`
→ `200 { session }`.
Errors: `INVALID_CREDENTIALS` (401, same message for unknown email and wrong password), `RATE_LIMITED`.

**`POST /api/auth/company/password-reset`** `{ "email" }` → always `202` (no account enumeration).

**Company wallet link** (needed before the company can fund missions; see §4):
- `POST /api/auth/company/wallet/nonce` → `200 { message: string, nonce: string, expiresAt: string }` (session required).
- `POST /api/auth/company/wallet/link` `{ "message": string, "signature": "0x…" }` → `200 { session }` with `walletAddress` set.
- Errors: `UNAUTHENTICATED` (401), `NONCE_INVALID` (expired or used), `SIGNATURE_INVALID`, `WALLET_IN_USE` (409, already linked to another account).

### 2.4 Contributor (Sign-In With Ethereum)

**`POST /api/auth/wallet/nonce`** `{ "address": "0x…" }`
→ `200 { message: string, nonce: string, expiresAt: string }`.
The server builds the full EIP-4361 message. The client does **not** build it:
- domain = app host
- uri = app origin
- chainId = 10143
- statement = "Sign in to DBForge"
- nonce: 16+ random chars
- issuedAt, expirationTime = +10 min

**`POST /api/auth/wallet/verify`** `{ "message": string, "signature": "0x…", "displayName"?: string }`
- The server verifies the signature with `viem/siwe` (`parseSiweMessage` + `verifySiweMessage`). No new dependency: viem is already installed.
- It checks domain, uri, chainId and expiry. The nonce must exist, be unexpired and unused, and belong to that address. The server marks it used **atomically**.
- First sign-in creates the contributor. `displayName` is only accepted on creation: 2–30 chars, `[\p{L}\p{N} ._-]`, unique (case-insensitive).
- → `200 { session, created: boolean }`.
- Errors: `NONCE_INVALID`, `SIGNATURE_INVALID`, `DISPLAY_NAME_TAKEN` (409), `VALIDATION_FAILED`, `RATE_LIMITED`.

**`PATCH /api/auth/contributor/profile`** `{ "displayName": string }` → `200 { session }` (contributor session required).

## 3. Proposed tables (Developer 3 owns `supabase/`)

```sql
-- Company accounts use Supabase Auth (auth.users) for email/password.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  industry text not null,
  country char(2) not null,
  size text not null,
  wallet_address text unique,             -- lower-case 0x…; set by /company/wallet/link
  created_at timestamptz not null default now()
);
create table public.company_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_name text not null,
  role text not null default 'owner'
);
create table public.contributors (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,     -- lower-case
  display_name text unique,
  created_at timestamptz not null default now()
);
create unique index contributors_display_name_ci on public.contributors (lower(display_name));
create table public.auth_nonces (
  nonce text primary key,
  address text not null,                   -- lower-case
  purpose text not null check (purpose in ('contributor_signin', 'company_wallet_link')),
  subject_id uuid,                          -- company user id for wallet links
  expires_at timestamptz not null,
  used_at timestamptz
);
create table public.sessions (
  id text primary key,                      -- random 32 bytes, base64url; this is the cookie value (store a hash if preferred)
  kind text not null check (kind in ('company', 'contributor')),
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
```
RLS on, no policies; access only through the service-role client, as the existing tables do.
A wallet address may be **either** a contributor **or** a company wallet, not both: this keeps a buyer from paying itself.

## 4. How auth plugs into the existing endpoints

| Existing endpoint | Rule once auth exists |
|---|---|
| `POST /api/missions` (mirror on-chain mission) | Company session required. The on-chain `buyer` from `readMissionCreated` **must equal** `company.wallet_address`; otherwise `403 BUYER_MISMATCH`. Store `company_id` on the mission row. |
| Buyer dashboard reads (`/api/missions?buyer=…`) | Derive the buyer from the session. Never trust a query parameter. |
| `POST /api/submissions/upload` | Contributor session required. `contributorAddress` = `session.walletAddress`, **not** from the form body. |
| `GET /api/submissions/:id/media` | Contributor: own submissions. Company: only submissions of its own missions, and only after settlement (G4 F4 rule). |
| `POST /api/contributors/:address/withdraw` | Contributor session with the same address, or internal. Rate limit per address. |
| `POST /api/settlement/:id`, `/dataset/anchor` | Stay internal/server-only. Company or contributor sessions do not unlock them. |

## 5. Security checklist (backend)

- Passwords are handled by Supabase Auth only. Never store or log them.
- Rate limits:
  - login, register and nonce: 10/min per IP
  - wallet verify: 10/min per address
  - password reset: 3/hour per email
- Nonces: single use, 10 min expiry, consumed atomically (`update … set used_at = now() where nonce = $1 and used_at is null returning *`).
- SIWE: domain, uri and chainId must match the server's config. Reject messages built for another origin.
- Error messages do not reveal whether an email exists.
- Cookie flags as in §1. Rotate the session id on sign-in (session fixation).
- Log sign-ins with the user id and IP, never the signature or password.

## 6. Frontend behaviour (for reference)

- Routes:
  - `/auth` (choose: company or contributor)
  - `/company/register`, `/company/login`, `/company/forgot-password`
  - `/contributor/join` (connect → sign → optional display name)
- Guards: `/buyer/*` needs a company session (else → `/company/login?next=…`). Registering for a mission, capture and upload need a
  contributor session (else → `/contributor/join?next=…`).
- A company without `walletAddress` sees a "Link your funding wallet" step before "Create mission".
- Mock mode (`NEXT_PUBLIC_DATA_SOURCE` ≠ `live`) keeps everything in `localStorage` with the same function signatures, so demos work offline.
- Live mode calls exactly the endpoints above.

## 7. Contracts

**No contract change is needed.** The on-chain buyer is still `msg.sender` of `createMission`. The company ↔ wallet link is
off-chain (signed message) and enforced in `POST /api/missions` (§4).
