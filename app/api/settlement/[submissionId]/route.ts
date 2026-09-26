// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/settlement/[submissionId] — settlement orchestration. Only the
// submissionId comes from the client; the payout recipient, chain mission
// id, proof hash, and amount all come from trusted DB rows (see
// lib/verification/settlement/eligibility.ts). The actual on-chain call is
// delegated to a SettlementGateway (lib/verification/settlement/gateway.ts)
// — this route never talks to a chain/contract directly, and never fakes
// a transaction if no gateway is wired in.

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import { toSettlementResponseDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";
import { getSubmissionById } from "@/lib/supabase/submissions";
import {
  claimSettlementForBroadcast,
  finalizeSettlementConfirmed,
  getSettlementBySubmissionId,
  markSettlementFailed,
} from "@/lib/supabase/settlements";
import { checkSettlementEligibility } from "@/lib/verification/settlement/eligibility";
import { getSettlementGateway } from "@/lib/verification/settlement/gateway";
import { SettlementGatewayError } from "@/lib/verification/settlement/types";

interface RouteParams {
  params: Promise<{ submissionId: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { submissionId } = await params;
    assertUuid(submissionId, "submissionId");

    const submission = await getSubmissionById(submissionId);
    if (!submission) {
      throw ApiError.submissionNotFound(`Submission ${submissionId} not found.`);
    }

    const existingSettlement = await getSettlementBySubmissionId(submissionId);

    if (submission.status === "paid") {
      if (existingSettlement?.status === "confirmed") {
        return NextResponse.json(toSettlementResponseDto(submissionId, existingSettlement));
      }
      throw ApiError.settlementInconsistentState(
        `Submission ${submissionId} is marked paid but no confirmed settlement record exists.`,
      );
    }

    if (existingSettlement?.status === "confirmed") {
      // Should be unreachable — finalize_settlement_confirmed sets both
      // rows together — but never trust a mismatch silently.
      throw ApiError.settlementInconsistentState(
        `Settlement for submission ${submissionId} is confirmed but the submission is not marked paid.`,
      );
    }

    if (submission.status !== "accepted") {
      throw ApiError.submissionNotAccepted(
        `Submission status is '${submission.status}'; only 'accepted' submissions can be settled.`,
      );
    }

    const mission = await getMissionById(submission.mission_id);
    if (!mission) {
      throw ApiError.missionNotFound(`Mission ${submission.mission_id} not found.`);
    }

    const eligibility = checkSettlementEligibility(submission, mission);
    if (!eligibility.ok) {
      switch (eligibility.reason) {
        case "MISSION_NOT_ACTIVE":
          throw ApiError.missionNotActive(eligibility.message);
        case "CHAIN_MISSION_NOT_CONFIGURED":
          throw ApiError.chainMissionNotConfigured(eligibility.message);
        case "INVALID_REWARD_AMOUNT":
          throw ApiError.invalidRewardAmount(eligibility.message);
        case "SUBMISSION_NOT_ACCEPTED":
          throw ApiError.submissionNotAccepted(eligibility.message);
        default:
          throw ApiError.settlementNotAllowed(eligibility.message);
      }
    }

    const claim = await claimSettlementForBroadcast({
      submissionId,
      missionId: mission.id,
      chainMissionId: eligibility.chainMissionId,
      contributorAddress: submission.contributor_address,
      submissionHash: eligibility.submissionHash,
      amountMon: eligibility.amountMon,
      amountWei: eligibility.amountWei.toString(),
    });

    if (claim.settlement.status === "confirmed") {
      return NextResponse.json(toSettlementResponseDto(submissionId, claim.settlement));
    }

    if (!claim.claimed) {
      throw ApiError.settlementAlreadyInProgress(
        `Settlement for submission ${submissionId} is already being processed.`,
      );
    }

    let gatewayResult;
    try {
      const gateway = getSettlementGateway();
      gatewayResult = await gateway.settleSubmission({
        chainMissionId: eligibility.chainMissionId,
        contributorAddress: submission.contributor_address,
        // media_hash is stored as bare 64 hex (no 0x prefix, see M1) —
        // lib/monad requires 0x-prefixed submissionHash.
        submissionHash: `0x${eligibility.submissionHash}`,
      });
    } catch (error) {
      const errorCode =
        error instanceof SettlementGatewayError ? error.kind.toUpperCase() : "UNKNOWN";
      await markSettlementFailed(submissionId, errorCode).catch((cleanupError: unknown) => {
        console.error(`Failed to mark settlement failed for ${submissionId}:`, cleanupError);
      });
      throw error;
    }

    let finalized;
    try {
      finalized = await finalizeSettlementConfirmed({
        submissionId,
        txHash: gatewayResult.txHash,
        amountWei: gatewayResult.amountWei,
        // Real SettleSubmissionResult has no separate blockNumber — only
        // txHash + amount. block_number stays null for chain-settled rows.
        blockNumber: null,
      });
    } catch (error) {
      // The gateway call already succeeded here — funds likely moved
      // on-chain but we failed to record it. Never swallow this quietly.
      console.error(
        `CRITICAL: settlement gateway succeeded for submission ${submissionId} ` +
          `(txHash=${gatewayResult.txHash}, amountWei=${gatewayResult.amountWei}) ` +
          "but finalize_settlement_confirmed failed:",
        error,
      );
      throw ApiError.settlementInconsistentState(
        `Payment likely succeeded on-chain (tx ${gatewayResult.txHash}) but could not be ` +
          "recorded. Manual reconciliation required.",
        500,
      );
    }

    return NextResponse.json(toSettlementResponseDto(submissionId, finalized));
  });
}
