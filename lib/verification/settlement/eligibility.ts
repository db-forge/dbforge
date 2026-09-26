// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Pure settlement eligibility check. Takes already-fetched rows (no I/O
// here) and returns either the resolved payout amount or a typed
// ineligibility reason — the route maps the reason to the right HTTP
// error code. Kept separate from lib/supabase/settlements.ts so the rule
// itself is easy to reason about/test without a database.

import { assertSettleableWeiAmount, decimalMonToWei, InvalidRewardAmountError } from "./money";
import type { MissionRow, SubmissionRow } from "@/lib/supabase/types";

// Duplicated intentionally (not imported from app/api/_lib/validation) so
// lib/verification stays free of any dependency on the app/api layer —
// see the same reasoning in lib/verification/checks.ts.
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type SettlementIneligibleReason =
  | "SUBMISSION_NOT_ACCEPTED"
  | "MISSION_NOT_ACTIVE"
  | "CHAIN_MISSION_NOT_CONFIGURED"
  | "INVALID_REWARD_AMOUNT"
  | "SETTLEMENT_NOT_ALLOWED";

export type SettlementEligibilityResult =
  | {
      ok: true;
      chainMissionId: string;
      submissionHash: string;
      amountMon: string;
      amountWei: bigint;
    }
  | { ok: false; reason: SettlementIneligibleReason; message: string };

// Missions in either state may still owe payouts for already-accepted
// submissions — "completed" just means the mission stopped accepting new
// submissions, not that outstanding settlements are void.
const SETTLEABLE_MISSION_STATUSES: readonly MissionRow["status"][] = ["active", "completed"];

export function checkSettlementEligibility(
  submission: SubmissionRow,
  mission: MissionRow,
): SettlementEligibilityResult {
  if (submission.status !== "accepted") {
    return {
      ok: false,
      reason: "SUBMISSION_NOT_ACCEPTED",
      message: `Submission status is '${submission.status}'; only 'accepted' submissions can be settled.`,
    };
  }

  if (!SETTLEABLE_MISSION_STATUSES.includes(mission.status)) {
    return {
      ok: false,
      reason: "MISSION_NOT_ACTIVE",
      message: `Mission status is '${mission.status}'; settlement requires 'active' or 'completed'.`,
    };
  }

  if (!mission.chain_mission_id) {
    return {
      ok: false,
      reason: "CHAIN_MISSION_NOT_CONFIGURED",
      message: `Mission ${mission.id} has no on-chain mission id recorded yet.`,
    };
  }

  if (!submission.media_hash) {
    return {
      ok: false,
      reason: "SETTLEMENT_NOT_ALLOWED",
      message: "Submission has no media_hash to use as the on-chain proof hash.",
    };
  }

  if (!EVM_ADDRESS_RE.test(submission.contributor_address)) {
    return {
      ok: false,
      reason: "SETTLEMENT_NOT_ALLOWED",
      message: "Submission's contributor_address is not a syntactically valid EVM address.",
    };
  }

  try {
    const amountWei = decimalMonToWei(mission.reward_mon);
    assertSettleableWeiAmount(amountWei);
    return {
      ok: true,
      chainMissionId: mission.chain_mission_id,
      submissionHash: submission.media_hash,
      amountMon: mission.reward_mon,
      amountWei,
    };
  } catch (error) {
    if (error instanceof InvalidRewardAmountError) {
      return { ok: false, reason: "INVALID_REWARD_AMOUNT", message: error.message };
    }
    throw error;
  }
}
