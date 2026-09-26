// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// GET /api/auth/me — current session's user + profile, resolved entirely
// from the session cookie (never a client-supplied id). 401 AUTH_REQUIRED
// when there's no valid session.

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/app/api/_lib/errors";
import { toAuthUserDto, toProfileDto } from "@/app/api/_lib/dto";
import { requireUser } from "@/lib/supabase/authGuards";

export async function GET() {
  return withApiErrorHandling(async () => {
    const { user, profile } = await requireUser();

    return NextResponse.json({
      user: toAuthUserDto(user),
      profile: toProfileDto(profile),
    });
  });
}
