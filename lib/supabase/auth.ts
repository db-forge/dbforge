// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Cookie-bound Supabase Auth client for Route Handlers — the official
// @supabase/ssr pattern for Next.js App Router. Uses the ANON key (acts as
// the requesting session, not the service role) so auth.signUp /
// signInWithPassword / getUser / signOut manage the httpOnly session
// cookies automatically; callers never see or return raw tokens.
//
// Only usable from a Route Handler or Server Action (the only contexts
// that may set cookies) — do not call this from a Server Component.

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { AuthError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AuthProviderError,
  AuthValidationError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from "./errors";

export class SupabaseAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseAuthConfigError";
  }
}

export async function createSupabaseAuthClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new SupabaseAuthConfigError(
      "Missing Supabase auth configuration: set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

/**
 * Maps a raw @supabase/auth-js error (never returned to the client as-is —
 * "do not leak raw Supabase errors") to one of this project's typed domain
 * errors. `error.code` is auth-js's stable machine-readable field (see
 * node_modules/@supabase/auth-js's ErrorCode union) — matched on directly
 * rather than guessed from `.message` text.
 */
export function mapSupabaseAuthError(error: AuthError, context: "signup" | "login"): Error {
  if (context === "signup" && error.code === "email_exists") {
    return new EmailAlreadyRegisteredError("An account with this email already exists.");
  }
  if (error.code === "email_address_invalid" || error.code === "validation_failed") {
    return new AuthValidationError(error.message || "Invalid email address.");
  }
  if (error.code === "weak_password") {
    return new AuthValidationError(error.message || "Password does not meet the provider's strength requirements.");
  }
  if (context === "login" && (error.code === "invalid_credentials" || error.code === "email_not_confirmed")) {
    return new InvalidCredentialsError("Invalid email or password.");
  }
  return new AuthProviderError("The authentication provider reported an error.", error);
}
