// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// POST /api/auth/login — Supabase password sign-in. The session is set
// via httpOnly cookies by createSupabaseAuthClient (@supabase/ssr) — this
// response body never contains an access/refresh token.

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { parseJsonBody, requireEmail, requirePassword } from "@/app/api/_lib/validation";
import { toAuthUserDto, toProfileDto } from "@/app/api/_lib/dto";
import { createSupabaseAuthClient, mapSupabaseAuthError } from "@/lib/supabase/auth";
import { getProfileById } from "@/lib/supabase/profiles";

export async function POST(request: Request) {
  return withApiErrorHandling(async () => {
    const body = await parseJsonBody(request);
    const email = requireEmail(body);
    const password = requirePassword(body);

    const supabase = await createSupabaseAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      throw mapSupabaseAuthError(error, "login");
    }
    if (!data.user) {
      throw ApiError.invalidCredentials();
    }

    const profile = await getProfileById(data.user.id);
    if (!profile) {
      throw ApiError.profileNotFound(`No profile found for user ${data.user.id}.`);
    }

    return NextResponse.json({
      user: toAuthUserDto({ id: data.user.id, email: data.user.email ?? null }),
      role: profile.role,
      profile: toProfileDto(profile),
    });
  });
}
