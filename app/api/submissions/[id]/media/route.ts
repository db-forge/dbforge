// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// GET /api/submissions/[id]/media — short-lived signed URL for private
// media. The storage path always comes from the trusted submission row,
// never from request input, so there's no way to sign an arbitrary path.

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import type { SignedMediaDto } from "@/app/api/_lib/dto";
import { getSubmissionById } from "@/lib/supabase/submissions";
import { createSignedSubmissionMediaUrl } from "@/lib/supabase/storage";

const SIGNED_URL_TTL_SECONDS = 300;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { id } = await params;
    assertUuid(id, "id");

    const submission = await getSubmissionById(id);
    if (!submission) {
      throw ApiError.submissionNotFound(`Submission ${id} not found.`);
    }

    if (!submission.media_path) {
      throw ApiError.mediaNotFound(`Submission ${id} has no associated media.`);
    }

    const url = await createSignedSubmissionMediaUrl(submission.media_path, SIGNED_URL_TTL_SECONDS);

    const body: SignedMediaDto = {
      url,
      expiresIn: SIGNED_URL_TTL_SECONDS,
      mediaType: submission.media_type,
      sizeBytes: submission.size_bytes,
    };

    return NextResponse.json(body);
  });
}
