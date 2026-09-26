// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// POST /api/auth/logout — invalidates the session and clears the auth
// cookies (handled by @supabase/ssr's cookie adapter in
// createSupabaseAuthClient).

import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/app/api/_lib/errors";
import { createSupabaseAuthClient } from "@/lib/supabase/auth";

export async function POST() {
  return withApiErrorHandling(async () => {
    const supabase = await createSupabaseAuthClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      // Cookies are still cleared best-effort by the client library; don't
      // fail the logout UX over a provider-side hiccup.
      console.error("Sign-out error:", error);
    }

    return NextResponse.json({ success: true });
  });
}
