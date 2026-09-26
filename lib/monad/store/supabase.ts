// SettlementStore on Supabase/Postgres. Every method is ONE rpc() call to a function from
// lib/monad/sql/settlement.sql, so atomicity lives in Postgres (row locks), not in this process.
// The client is passed in by the caller (Developer 3's server-side service-role client); lib/monad never creates one.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MonadSettlementError } from "../errors";
import type {
  ClaimResult,
  NonceHolder,
  SettlementKey,
  SettlementRecord,
  SettlementRecordStatus,
  SettlementStore,
} from "./types";

/** The only part of the Supabase client this store uses. */
export interface SupabaseRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Entry point for Developer 3: `createSupabaseSettlementStore(getSupabaseServiceClient())`. */
export function createSupabaseSettlementStore(client: SupabaseClient): SettlementStore {
  return new SupabaseSettlementStore(client);
}

interface RecordRow {
  vault_address: string;
  chain_mission_id: string;
  submission_hash: string;
  contributor_address: string;
  status: SettlementRecordStatus;
  lease_owner: string | null;
  lease_expires_at_ms: number | null;
  signer_address: string | null;
  nonce: number | null;
  tx_hash: string | null;
  raw_tx: string | null;
  amount_wei: string | null;
  attempts: number;
  last_error: string | null;
  updated_at_ms: number;
}

function toRecord(row: RecordRow): SettlementRecord {
  return {
    key: { vault: row.vault_address, missionId: row.chain_mission_id, submissionHash: row.submission_hash },
    contributor: row.contributor_address,
    status: row.status,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at_ms === null ? null : Number(row.lease_expires_at_ms),
    signer: row.signer_address,
    nonce: row.nonce === null ? null : Number(row.nonce),
    txHash: row.tx_hash,
    rawTx: row.raw_tx,
    amountWei: row.amount_wei,
    attempts: Number(row.attempts),
    lastError: row.last_error,
    updatedAt: Number(row.updated_at_ms),
  };
}

function keyArgs(key: SettlementKey): Record<string, string> {
  return { p_vault: key.vault, p_mission: key.missionId, p_hash: key.submissionHash };
}

export class SupabaseSettlementStore implements SettlementStore {
  private readonly client: SupabaseRpcClient;

  constructor(client: SupabaseRpcClient) {
    this.client = client;
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    // The DB message may contain row data; keep it out of the thrown message.
    if (error) throw new MonadSettlementError("RPC_ERROR", { reason: "STORE_ERROR", detail: `Store call ${fn} failed.` });
    return data as T;
  }

  async get(key: SettlementKey): Promise<SettlementRecord | null> {
    const row = await this.call<RecordRow | null>("monad_settlement_get", keyArgs(key));
    return row ? toRecord(row) : null;
  }

  async claim(key: SettlementKey, contributor: string, owner: string, leaseMs: number): Promise<ClaimResult> {
    const res = await this.call<{ claimed: boolean; record: RecordRow }>("monad_settlement_claim", {
      ...keyArgs(key),
      p_contributor: contributor,
      p_owner: owner,
      p_lease_ms: Math.round(leaseMs),
    });
    return { claimed: res.claimed, record: toRecord(res.record) };
  }

  async reserveNonce(
    key: SettlementKey,
    owner: string,
    signer: string,
    chainPendingNonce: number,
    leaseMs: number,
  ): Promise<number | null> {
    const n = await this.call<number | string | null>("monad_settlement_reserve_nonce", {
      ...keyArgs(key),
      p_owner: owner,
      p_signer: signer,
      p_chain_nonce: chainPendingNonce,
      p_lease_ms: Math.round(leaseMs),
    });
    return n === null ? null : Number(n);
  }

  async recordBroadcast(key: SettlementKey, owner: string, txHash: string, rawTx: string): Promise<boolean> {
    return this.call<boolean>("monad_settlement_record_broadcast", {
      ...keyArgs(key),
      p_owner: owner,
      p_tx_hash: txHash,
      p_raw_tx: rawTx,
    });
  }

  async releaseNonce(key: SettlementKey, owner: string, reason: string): Promise<void> {
    await this.call("monad_settlement_release_nonce", { ...keyArgs(key), p_owner: owner, p_reason: reason });
  }

  async resetAttempt(
    key: SettlementKey,
    expectedTxHash: string,
    owner: string,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<boolean> {
    return this.call<boolean>("monad_settlement_reset_attempt", {
      ...keyArgs(key),
      p_expected_tx_hash: expectedTxHash,
      p_owner: owner,
      p_lease_ms: Math.round(leaseMs),
      p_max_attempts: maxAttempts,
    });
  }

  async markSettled(key: SettlementKey, contributor: string, txHash: string | null, amountWei: string): Promise<void> {
    await this.call("monad_settlement_mark_settled", {
      ...keyArgs(key),
      p_contributor: contributor,
      p_tx_hash: txHash,
      p_amount_wei: amountWei,
    });
  }

  async markFailed(key: SettlementKey, txHash: string | null, reason: string): Promise<void> {
    await this.call("monad_settlement_mark_failed", { ...keyArgs(key), p_tx_hash: txHash, p_reason: reason });
  }

  async allocateNonce(signer: string, chainPendingNonce: number, idleMs: number): Promise<number> {
    const n = await this.call<number | string>("monad_allocate_nonce", {
      p_signer: signer,
      p_chain_nonce: chainPendingNonce,
      p_idle_ms: Math.round(idleMs),
    });
    return Number(n);
  }

  async findNonceHolder(signer: string, nonce: number): Promise<NonceHolder> {
    const h = await this.call<NonceHolder | null>("monad_find_nonce_holder", { p_signer: signer, p_nonce: nonce });
    return h ?? { kind: "none" };
  }

  async releaseSignerNonce(signer: string, nonce: number): Promise<void> {
    await this.call("monad_release_signer_nonce", { p_signer: signer, p_nonce: nonce });
  }

  async resyncSignerNonce(signer: string, chainPendingNonce: number): Promise<void> {
    await this.call("monad_resync_signer_nonce", { p_signer: signer, p_chain_nonce: chainPendingNonce });
  }
}
