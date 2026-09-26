// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import { toSubmissionDto } from "@/app/api/_lib/dto";
import { getSubmissionById } from "@/lib/supabase/submissions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { id } = await params;
    assertUuid(id, "id");

    const submission = await getSubmissionById(id);

    if (!submission) {
      throw ApiError.notFound(`Submission ${id} not found.`);
    }

    return NextResponse.json({ submission: toSubmissionDto(submission) });
  });
}
