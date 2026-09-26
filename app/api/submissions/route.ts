// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
import { NextResponse } from "next/server";
import { withApiErrorHandling } from "@/app/api/_lib/errors";
import {
  assertUuid,
  optionalString,
  parseJsonBody,
  requireEvmAddress,
  requireString,
} from "@/app/api/_lib/validation";
import { toSubmissionDto } from "@/app/api/_lib/dto";
import { createSubmission } from "@/lib/supabase/submissions";

export async function GET() {
  // Listing submissions (e.g. by mission or contributor) is not part of
  // M0's scope — only creation and single-record lookup are implemented.
  return NextResponse.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Listing submissions is not implemented yet." } },
    { status: 501 },
  );
}

export async function POST(request: Request) {
  return withApiErrorHandling(async () => {
    const body = await parseJsonBody(request);

    const missionId = assertUuid(requireString(body, "missionId"), "missionId");
    const contributorAddress = requireEvmAddress(body, "contributorAddress");
    const mediaUrl = optionalString(body, "mediaUrl");
    const mediaHash = optionalString(body, "mediaHash");

    const submission = await createSubmission({
      missionId,
      contributorAddress,
      mediaUrl,
      mediaHash,
    });

    return NextResponse.json({ submission: toSubmissionDto(submission) }, { status: 201 });
  });
}
