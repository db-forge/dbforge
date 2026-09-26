// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/settlement/[submissionId]/reconcile — M5 Part A. Recovers from
// the two known M4 failure modes: a settlement stuck 'broadcasting' after
// a server crash, and a settlement that succeeded on-chain but failed to
// finalize in our DB. Never mutates to 'paid' except through the atomic
// reconcile_settlement_confirmed RPC, and never downgrades a settlement
// our own DB already has as 'confirmed' based on a single conflicting
// chain read (that goes to SETTLEMENT_STATE_AMBIGUOUS for human review).

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { assertUuid } from "@/app/api/_lib/validation";
import { toReconcileResponseDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";
import { getSubmissionById } from "@/lib/supabase/submissions";
import {
  getSettlementBySubmissionId,
  markSettlementNotFoundOnChain,
  reconcileSettlementConfirmed,
  recordReconciliationAttempt,
} from "@/lib/supabase/settlements";
import {
  decideReconciliationEntry,
  hasReconciliationGracePeriodElapsed,
} from "@/lib/verification/settlement/reconciliationDecision";
import { getSettlementStatusGateway } from "@/lib/verification/settlement/statusGateway";

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

    const settlement = await getSettlementBySubmissionId(submissionId);
    const entry = decideReconciliationEntry(settlement, submission);

    if (!settlement || entry.kind === "not_required") {
      throw ApiError.reconciliationNotRequired(
        `Submission ${submissionId} has no settlement in a reconcilable state.`,
      );
    }

    if (entry.kind === "already_consistent") {
      return NextResponse.json(toReconcileResponseDto(submission.status, settlement));
    }

    const mission = await getMissionById(submission.mission_id);
    if (!mission) {
      throw ApiError.missionNotFound(`Mission ${submission.mission_id} not found.`);
    }
    if (!mission.chain_mission_id) {
      throw ApiError.chainMissionNotConfigured(
        `Mission ${mission.id} has no on-chain mission id recorded yet.`,
      );
    }
    if (!submission.media_hash) {
      throw ApiError.settlementNotAllowed("Submission has no media_hash to reconcile against.");
    }

    let chainResult;
    try {
      const gateway = getSettlementStatusGateway();
      chainResult = await gateway.getSubmissionSettlementStatus({
        chainMissionId: mission.chain_mission_id,
        mediaHashHex: submission.media_hash,
      });
    } catch (error) {
      await recordReconciliationAttempt(
        submissionId,
        "required",
        error instanceof Error ? error.message : "Unknown gateway error.",
      );
      throw error;
    }

    if (chainResult.settled) {
      if (!chainResult.txHash || !chainResult.creditedAmountWei) {
        await recordReconciliationAttempt(
          submissionId,
          "unknown",
          "Chain reported settled=true but omitted txHash/creditedAmountWei.",
        );
        throw ApiError.settlementStateAmbiguous(
          `Chain reports submission ${submissionId} as settled but returned no usable txHash/amount.`,
        );
      }

      const finalized = await reconcileSettlementConfirmed({
        submissionId,
        txHash: chainResult.txHash,
        amountWei: chainResult.creditedAmountWei,
      });

      return NextResponse.json(
        toReconcileResponseDto(
          "paid",
          finalized,
          "Reconciled: chain confirms this submission was settled.",
        ),
      );
    }

    if (settlement.status === "confirmed") {
      await recordReconciliationAttempt(
        submissionId,
        "unknown",
        "DB shows settlement confirmed but chain reports not settled.",
      );
      throw ApiError.settlementStateAmbiguous(
        `Settlement for submission ${submissionId} is confirmed in our records but the chain ` +
          "reports it as not settled. Manual review required.",
      );
    }

    if (
      settlement.status === "broadcasting" &&
      !hasReconciliationGracePeriodElapsed(settlement, new Date())
    ) {
      await recordReconciliationAttempt(
        submissionId,
        "required",
        "Grace period has not yet elapsed; too soon to conclude not-settled.",
      );
      return NextResponse.json(
        toReconcileResponseDto(
          submission.status,
          { ...settlement, reconciliation_status: "required" },
          "Settlement is still within its broadcast grace period; try again shortly.",
        ),
      );
    }

    if (settlement.status === "broadcasting") {
      // Demote the stuck broadcast to 'failed' (explicitly retryable).
      const demoted = await markSettlementNotFoundOnChain(submissionId);
      const finalSettlement =
        demoted ?? (await getSettlementBySubmissionId(submissionId)) ?? settlement;

      return NextResponse.json(
        toReconcileResponseDto(
          submission.status,
          finalSettlement,
          "Reconciled: chain does not show this submission as settled; marked failed and retryable.",
        ),
      );
    }

    // Already 'failed' — nothing to transition, but still worth recording
    // that the chain agrees it was never settled.
    await recordReconciliationAttempt(submissionId, "not_found_onchain", null);
    const refreshed = (await getSettlementBySubmissionId(submissionId)) ?? settlement;

    return NextResponse.json(
      toReconcileResponseDto(
        submission.status,
        refreshed,
        "Reconciled: chain confirms this submission was never settled.",
      ),
    );
  });
}
