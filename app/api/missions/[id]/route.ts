// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import { toMissionDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { id } = await params;
    assertUuid(id, "id");

    const mission = await getMissionById(id);

    if (!mission) {
      throw ApiError.notFound(`Mission ${id} not found.`);
    }

    return NextResponse.json({ mission: toMissionDto(mission) });
  });
}
