// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for the settlements table and its two coordinating RPCs
// (migration 0007). Route handlers translate results/errors into
// responses; this module only talks to Postgres.

import { getSupabaseServiceClient } from "./client";
import {
  NotFoundError,
  SettlementInconsistentStateError,
  SubmissionNotAcceptedError,
} from "./errors";
import type { SettlementRow } from "./types";

export async function getSettlementBySubmissionId(
  submissionId: string,
): Promise<SettlementRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch settlement for submission ${submissionId}: ${error.message}`);
  }

  return (data as SettlementRow | null) ?? null;
}

export interface ClaimSettlementInput {
  submissionId: string;
  missionId: string;
  chainMissionId: string;
  contributorAddress: string;
  submissionHash: string;
  amountMon: string;
  amountWei: string;
}

export interface ClaimSettlementResult {
  settlement: SettlementRow;
  // true: this call won the right to actually call the gateway.
  // false: another call already owns it ('broadcasting') or it's already
  // 'confirmed' — the caller must not call the gateway again.
  claimed: boolean;
}

/**
 * Atomically creates (if missing) and claims the settlement row via
 * public.claim_settlement_for_broadcast — see migration 0007 for the
 * concurrency guarantees. Never call the settlement gateway without first
 * getting claimed=true back from this.
 */
export async function claimSettlementForBroadcast(
  input: ClaimSettlementInput,
): Promise<ClaimSettlementResult> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("claim_settlement_for_broadcast", {
    p_submission_id: input.submissionId,
    p_mission_id: input.missionId,
    p_chain_mission_id: input.chainMissionId,
    p_contributor_address: input.contributorAddress,
    p_submission_hash: input.submissionHash,
    p_amount_mon: input.amountMon,
    p_amount_wei: input.amountWei,
  });

  if (error) {
    if (error.message.includes("SUBMISSION_NOT_FOUND")) {
      throw new NotFoundError(`Submission ${input.submissionId} not found.`);
    }
    if (error.message.includes("SUBMISSION_NOT_ACCEPTED")) {
      throw new SubmissionNotAcceptedError(
        `Submission ${input.submissionId} is not in 'accepted' status.`,
      );
    }
    throw new Error(`Failed to claim settlement for ${input.submissionId}: ${error.message}`);
  }

  const row = data as { settlement: SettlementRow; claimed: boolean };
  return { settlement: row.settlement, claimed: row.claimed };
}

export interface FinalizeSettlementInput {
  submissionId: string;
  txHash: string;
  amountWei: string;
  blockNumber: string;
}

/**
 * Atomically finalizes a successful gateway call via
 * public.finalize_settlement_confirmed — marks the settlement confirmed
 * and the submission paid together. Idempotent: calling this again on an
 * already-confirmed settlement just returns the existing row unchanged.
 */
export async function finalizeSettlementConfirmed(
  input: FinalizeSettlementInput,
): Promise<SettlementRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("finalize_settlement_confirmed", {
    p_submission_id: input.submissionId,
    p_tx_hash: input.txHash,
    p_amount_wei: input.amountWei,
    p_block_number: input.blockNumber,
  });

  if (error) {
    if (error.message.includes("SETTLEMENT_NOT_FOUND")) {
      throw new NotFoundError(`No settlement record found for submission ${input.submissionId}.`);
    }
    if (error.message.includes("SETTLEMENT_INCONSISTENT_STATE")) {
      throw new SettlementInconsistentStateError(
        `Settlement for submission ${input.submissionId} was not in a finalizable state.`,
      );
    }
    throw new Error(`Failed to finalize settlement for ${input.submissionId}: ${error.message}`);
  }

  return data as SettlementRow;
}

/**
 * Conditional single-row update, guarded on still being 'broadcasting' —
 * atomic at the row level without needing an RPC (unlike the accept/
 * finalize paths, this only ever touches one table). A null return means
 * the row left 'broadcasting' concurrently (e.g. another process already
 * finalized or failed it); the caller should re-fetch rather than error.
 */
export async function markSettlementFailed(
  submissionId: string,
  errorCode: string,
): Promise<SettlementRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("settlements")
    .update({ status: "failed", error_code: errorCode, updated_at: new Date().toISOString() })
    .eq("submission_id", submissionId)
    .eq("status", "broadcasting")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark settlement failed for ${submissionId}: ${error.message}`);
  }

  return (data as SettlementRow | null) ?? null;
}

export interface ReconcileSettlementInput {
  submissionId: string;
  txHash: string;
  amountWei: string;
}

/**
 * Atomically finalizes a settlement discovered to be confirmed on-chain
 * during reconciliation via public.reconcile_settlement_confirmed —
 * callable from 'broadcasting' OR 'failed' (unlike
 * finalize_settlement_confirmed, which only accepts 'broadcasting'), since
 * reconciliation exists specifically to recover both a stuck broadcast and
 * a settlement that was prematurely marked failed. Idempotent on an
 * already-confirmed row.
 */
export async function reconcileSettlementConfirmed(
  input: ReconcileSettlementInput,
): Promise<SettlementRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("reconcile_settlement_confirmed", {
    p_submission_id: input.submissionId,
    p_tx_hash: input.txHash,
    p_amount_wei: input.amountWei,
  });

  if (error) {
    if (error.message.includes("SETTLEMENT_NOT_FOUND")) {
      throw new NotFoundError(`No settlement record found for submission ${input.submissionId}.`);
    }
    if (error.message.includes("SETTLEMENT_INCONSISTENT_STATE")) {
      throw new SettlementInconsistentStateError(
        `Settlement for submission ${input.submissionId} was not in a reconcilable state.`,
      );
    }
    throw new Error(`Failed to reconcile settlement for ${input.submissionId}: ${error.message}`);
  }

  return data as SettlementRow;
}

/**
 * Chain reports not settled and the grace period has elapsed: demote a
 * stuck 'broadcasting' settlement to 'failed' (explicitly retryable, same
 * as any other failed settlement). Guarded to only affect a row still
 * 'broadcasting' — a null return means it moved on concurrently.
 */
export async function markSettlementNotFoundOnChain(
  submissionId: string,
): Promise<SettlementRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("settlements")
    .update({
      status: "failed",
      error_code: "NOT_FOUND_ONCHAIN",
      reconciliation_status: "not_found_onchain",
      last_reconciled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId)
    .eq("status", "broadcasting")
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to mark settlement not-found-on-chain for ${submissionId}: ${error.message}`,
    );
  }

  const row = (data as SettlementRow | null) ?? null;
  if (!row) return null;

  // supabase-js has no atomic "increment" in a plain update payload —
  // apply it as a immediate follow-up read-modify-write. This only races
  // against another reconciliation attempt on the SAME settlement, which
  // is vanishingly unlikely (reconciliation is an infrequent, operator/
  // cron-triggered action) and only affects the attempts counter, never
  // payment-relevant state.
  const { data: incremented, error: incError } = await supabase
    .from("settlements")
    .update({ reconciliation_attempts: row.reconciliation_attempts + 1 })
    .eq("id", row.id)
    .select("*")
    .single();

  if (incError) {
    throw new Error(`Failed to record reconciliation attempt for ${submissionId}: ${incError.message}`);
  }

  return incremented as SettlementRow;
}

/**
 * Records a reconciliation attempt that did not change *payment* state —
 * covers gateway failures, ambiguous chain results, and "chain confirms
 * not settled but the settlement was already 'failed'" (nothing to
 * transition, but the attempt is still worth recording). Never touches
 * settlement.status or submissions — see markSettlementNotFoundOnChain for
 * the one case that actually demotes 'broadcasting' -> 'failed'.
 */
export async function recordReconciliationAttempt(
  submissionId: string,
  status: Exclude<SettlementRow["reconciliation_status"], "none">,
  errorMessage: string | null,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: current, error: fetchError } = await supabase
    .from("settlements")
    .select("reconciliation_attempts")
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to read settlement for ${submissionId}: ${fetchError.message}`);
  }
  if (!current) return;

  const { error } = await supabase
    .from("settlements")
    .update({
      reconciliation_status: status,
      reconciliation_attempts: current.reconciliation_attempts + 1,
      reconciliation_error: errorMessage,
      last_reconciled_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  if (error) {
    throw new Error(`Failed to record reconciliation attempt for ${submissionId}: ${error.message}`);
  }
}
