// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/missions — the buyer creates the mission ON-CHAIN from their
// own wallet first (their funds are locked there), the frontend gets back
// a txHash, and THIS endpoint only verifies that receipt/event and
// mirrors the verified fields into our DB. chainMissionId/buyerAddress/
// reward/targetCount are never trusted from the request body — only
// txHash (to look up the event) and the purely descriptive title/
// description (which the chain event doesn't carry) are client input.
import { NextRequest, NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import {
  parseJsonBody,
  parseMissionStatusParam,
  parsePagination,
  requireString,
} from "@/app/api/_lib/validation";
import { toMissionDto } from "@/app/api/_lib/dto";
import { createMissionFromChainEvent, listMissions } from "@/lib/supabase/missions";
import { getMissionEventReader } from "@/lib/verification/mission/eventReader";
import { weiToDecimalMon } from "@/lib/verification/settlement/money";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

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

export async function POST(request: NextRequest) {
  return withApiErrorHandling(async () => {
    const body = await parseJsonBody(request);

    const txHash = requireString(body, "txHash");
    if (!TX_HASH_RE.test(txHash)) {
      throw ApiError.validation("txHash must be a 0x-prefixed 32-byte transaction hash.", {
        field: "txHash",
      });
    }

    // Purely descriptive — never a source of chainMissionId/buyer/reward/
    // targetCount, all of which come from the verified chain event below.
    const title = requireString(body, "title");
    const description = requireString(body, "description");

    const event = await getMissionEventReader().readMissionCreated({ txHash });

    if (event === null) {
      // No receipt yet — not an error. The client should retry shortly.
      return NextResponse.json({ code: "PENDING", message: "Transaction not yet mined." }, { status: 202 });
    }

    const { mission, created } = await createMissionFromChainEvent({
      chainMissionId: event.chainMissionId,
      buyerAddress: event.buyerAddress,
      rewardMon: weiToDecimalMon(BigInt(event.rewardWei)),
      targetCount: event.targetCount,
      title,
      description,
    });

    return NextResponse.json({ mission: toMissionDto(mission) }, { status: created ? 201 : 200 });
  });
}
