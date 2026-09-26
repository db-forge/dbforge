// Persistence contract of the settlement adapter. Every method must be atomic on its own: the adapter runs in
// several processes at once (no single-worker rule), and the store is what keeps them from double-sending.
// Implementations: `MemorySettlementStore` (tests, one process) and `SupabaseSettlementStore`
// (Postgres functions in `lib/monad/sql/settlement.sql`).

/** Addresses and hashes are lowercase; missionId is a decimal string. */
export interface SettlementKey {
  vault: string;
  missionId: string;
  submissionHash: string;
}

export type SettlementRecordStatus = "pending" | "settled" | "failed";

export interface SettlementRecord {
  key: SettlementKey;
  contributor: string;
  status: SettlementRecordStatus;
  /** Instance that may sign and send for this key while `leaseExpiresAt` is in the future. */
  leaseOwner: string | null;
  leaseExpiresAt: number | null; // epoch ms
  signer: string | null;
  /** Nonce reserved for (or used by) the current attempt. Stays with the job until a tx consumes it. */
  nonce: number | null;
  txHash: string | null;
  /** Signed raw tx of the current attempt. Public data once broadcast; lets any instance re-broadcast it. */
  rawTx: string | null;
  amountWei: string | null;
  /** Number of broadcast attempts (a replaced/dropped tx allows exactly one more). */
  attempts: number;
  lastError: string | null;
  updatedAt: number; // epoch ms
}

export type NonceHolder =
  | { kind: "inflight"; txHash: string; rawTx: string | null }
  | { kind: "reserved" }
  | { kind: "none" };

export interface ClaimResult {
  claimed: boolean;
  record: SettlementRecord;
}

export interface SettlementStore {
  get(key: SettlementKey): Promise<SettlementRecord | null>;

  /**
   * Insert the job as `pending` owned by `owner`, or take it over when it is `failed`, or `pending` without a tx and
   * with an expired lease. Otherwise returns `claimed: false` and the current record (someone else owns it).
   */
  claim(key: SettlementKey, contributor: string, owner: string, leaseMs: number): Promise<ClaimResult>;

  /**
   * Owner only. Returns the job's nonce: the one it already holds (reuse after a crash), or a new one from the
   * signer's counter (lowest gap first, never below `chainPendingNonce`). Extends the lease. `null` = lease lost.
   */
  reserveNonce(
    key: SettlementKey,
    owner: string,
    signer: string,
    chainPendingNonce: number,
    leaseMs: number,
  ): Promise<number | null>;

  /** Owner only, before the broadcast. Stores txHash + raw tx, attempts++. `false` = lease lost: do NOT broadcast. */
  recordBroadcast(key: SettlementKey, owner: string, txHash: string, rawTx: string): Promise<boolean>;

  /** Owner only. The node definitively rejected the tx: the nonce goes back to the signer's gap list, job → failed. */
  releaseNonce(key: SettlementKey, owner: string, reason: string): Promise<void>;

  /**
   * The tx `expectedTxHash` can no longer be mined (its nonce was consumed by another tx). Atomically clears the
   * attempt (nonce is NOT returned: it is used) and makes `owner` the owner, only if `attempts < maxAttempts`.
   * Exactly one concurrent caller wins.
   */
  resetAttempt(
    key: SettlementKey,
    expectedTxHash: string,
    owner: string,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<boolean>;

  /** Upsert as settled (also used when the chain already shows the settlement). */
  markSettled(key: SettlementKey, contributor: string, txHash: string | null, amountWei: string): Promise<void>;

  /** Job → failed (lease cleared, nonce kept only if a tx consumed it). A later call may claim it again. */
  markFailed(key: SettlementKey, txHash: string | null, reason: string): Promise<void>;

  /**
   * Who holds `nonce` of `signer`: a pending job with a recorded tx (its raw tx can be re-broadcast), a pending job
   * that reserved it under a live lease (it will broadcast soon), or nobody.
   */
  findNonceHolder(signer: string, nonce: number): Promise<NonceHolder>;

  /**
   * Jobless txs (withdrawFor). Same counter and gap list as `reserveNonce`. When the signer's counter has been idle
   * for `idleMs`, it is first reconciled with the chain: unused, unheld nonces become gaps, a stale counter comes down.
   */
  allocateNonce(signer: string, chainPendingNonce: number, idleMs: number): Promise<number>;
  releaseSignerNonce(signer: string, nonce: number): Promise<void>;

  /** Ops tool: set the counter to the chain's pending nonce and drop gaps below it. */
  resyncSignerNonce(signer: string, chainPendingNonce: number): Promise<void>;
}
