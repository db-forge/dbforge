// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// POST /api/auth/signup/company — see signup/contributor/route.ts's doc
// comment; identical flow, role='company' and companyName instead of
// displayName.

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import {
  optionalEvmAddress,
  parseJsonBody,
  requireEmail,
  requirePassword,
  requireString,
} from "@/app/api/_lib/validation";
import { toAuthUserDto, toProfileDto } from "@/app/api/_lib/dto";
import { createSupabaseAuthClient, mapSupabaseAuthError } from "@/lib/supabase/auth";
import { createProfile } from "@/lib/supabase/profiles";

export async function POST(request: Request) {
  return withApiErrorHandling(async () => {
    const body = await parseJsonBody(request);
    const email = requireEmail(body);
    const password = requirePassword(body);
    const companyName = requireString(body, "companyName");
    const walletAddress = optionalEvmAddress(body, "walletAddress");

    const supabase = await createSupabaseAuthClient();
    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      throw mapSupabaseAuthError(error, "signup");
    }
    if (!data.user) {
      throw ApiError.authProviderError("Sign-up did not return a user.");
    }

    const profile = await createProfile({
      id: data.user.id,
      role: "company",
      companyName,
      walletAddress,
    });

    return NextResponse.json(
      {
        user: toAuthUserDto({ id: data.user.id, email: data.user.email ?? null }),
        profile: toProfileDto(profile),
      },
      { status: 201 },
    );
  });
}
