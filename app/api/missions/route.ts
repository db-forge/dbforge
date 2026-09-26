// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
import { NextRequest, NextResponse } from "next/server";
import { withApiErrorHandling } from "@/app/api/_lib/errors";
import { parseMissionStatusParam, parsePagination } from "@/app/api/_lib/validation";
import { toMissionDto } from "@/app/api/_lib/dto";
import { listMissions } from "@/lib/supabase/missions";

export async function GET(request: NextRequest) {
  return withApiErrorHandling(async () => {
    const { searchParams } = new URL(request.url);
    const status = parseMissionStatusParam(searchParams.get("status"));
    const { limit, offset } = parsePagination(searchParams);

    const { missions, total } = await listMissions({ status, limit, offset });

    return NextResponse.json({
      missions: missions.map(toMissionDto),
      pagination: { limit, offset, total },
    });
  });
}

export async function POST() {
  // Mission creation happens on-chain first (Developer 2's contract) and is
  // indexed into this table by a later milestone. Not part of M0.
  return NextResponse.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Mission creation is not implemented yet." } },
    { status: 501 },
  );
}
