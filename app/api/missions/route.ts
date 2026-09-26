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
    const category = body.category;
    if (category !== "teknoloji" && category !== "doga" && category !== "gundelik") {
      throw ApiError.validation("category must be one of: teknoloji, doga, gundelik.", { field: "category" });
    }
    const coverUrl = body.coverUrl;
    if (coverUrl !== null && coverUrl !== undefined && (typeof coverUrl !== "string" || coverUrl.length > 2_000_000)) {
      throw ApiError.validation("coverUrl must be a string up to 2 MB.", { field: "coverUrl" });
    }
    const perUserLimit = body.perUserLimit;
    if (!Number.isSafeInteger(perUserLimit) || (perUserLimit as number) < 1) {
      throw ApiError.validation("perUserLimit must be a positive integer.", { field: "perUserLimit" });
    }
    const criteria = body.criteria;
    if (
      !Array.isArray(criteria) ||
      criteria.length > 20 ||
      !criteria.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 300)
    ) {
      throw ApiError.validation("criteria must contain at most 20 non-empty strings.", { field: "criteria" });
    }

    const event = await getMissionEventReader().readMissionCreated({ txHash });

    if (event === null) {
      // No receipt yet — not an error. The client should retry shortly.
      return NextResponse.json({ code: "PENDING", message: "Transaction not yet mined." }, { status: 202 });
    }
    if ((perUserLimit as number) > event.targetCount) {
      throw ApiError.validation("perUserLimit cannot exceed targetCount.", { field: "perUserLimit" });
    }

    const { mission, created } = await createMissionFromChainEvent({
      chainMissionId: event.chainMissionId,
      buyerAddress: event.buyerAddress,
      rewardMon: weiToDecimalMon(BigInt(event.rewardWei)),
      targetCount: event.targetCount,
      title,
      description,
      category,
      coverUrl: typeof coverUrl === "string" ? coverUrl : null,
      perUserLimit: perUserLimit as number,
      criteria: criteria as string[],
    });

    return NextResponse.json({ mission: toMissionDto(mission) }, { status: created ? 201 : 200 });
  });
}
