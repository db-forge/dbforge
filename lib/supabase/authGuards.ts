// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Reusable server-side auth guards for Route Handlers. Never trust a
// client-supplied user id or role — these always resolve identity from the
// session cookie (via Supabase Auth) and look up the role from OUR OWN
// profiles table, never from anything the request body claims.

import { createSupabaseAuthClient } from "./auth";
import { getProfileById, type ProfileRole, type ProfileRow } from "./profiles";
import { AuthRequiredError, ProfileNotFoundError, RoleForbiddenError } from "./errors";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  profile: ProfileRow;
}

/**
 * Resolves the current session's user + profile. Throws AuthRequiredError
 * if there is no valid session, ProfileNotFoundError if the auth user
 * exists but has no profiles row (shouldn't happen outside a signup bug —
 * see app/api/auth/signup/*).
 */
export async function requireUser(): Promise<AuthContext> {
  const supabase = await createSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new AuthRequiredError("Authentication required.");
  }

  const profile = await getProfileById(data.user.id);
  if (!profile) {
    throw new ProfileNotFoundError(`No profile found for user ${data.user.id}.`);
  }

  return {
    user: { id: data.user.id, email: data.user.email ?? null },
    profile,
  };
}

async function requireRole(role: ProfileRole): Promise<AuthContext> {
  const context = await requireUser();
  if (context.profile.role !== role) {
    throw new RoleForbiddenError(`This action requires a '${role}' account.`, role);
  }
  return context;
}

export function requireContributor(): Promise<AuthContext> {
  return requireRole("contributor");
}

export function requireCompany(): Promise<AuthContext> {
  return requireRole("company");
}
