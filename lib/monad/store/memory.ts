// In-process SettlementStore for tests and local scripts. Each method runs synchronously between awaits, so it is
// atomic inside one Node process — the same guarantees the Postgres functions give across processes.
// Semantics mirror lib/monad/sql/settlement.sql one to one; test/store.contract.ts runs against both.

import type { ClaimResult, NonceHolder, SettlementKey, SettlementRecord, SettlementStore } from "./types";

interface SignerState {
  nextNonce: number;
  gaps: Set<number>;
  touchedAt: number; // last allocation / resync (epoch ms)
}

/** Hole reconciliation never walks more than this many nonces (a huge range means a wrong chain, not a hole). */
const MAX_RECONCILE_RANGE = 1024;

function keyId(key: SettlementKey): string {
  return `${key.vault}|${key.missionId}|${key.submissionHash}`;
}

function copy(record: SettlementRecord): SettlementRecord {
  return { ...record, key: { ...record.key } };
}

export class MemorySettlementStore implements SettlementStore {
  private readonly records = new Map<string, SettlementRecord>();
  private readonly signers = new Map<string, SignerState>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  async get(key: SettlementKey): Promise<SettlementRecord | null> {
    const rec = this.records.get(keyId(key));
    return rec ? copy(rec) : null;
  }

  async claim(key: SettlementKey, contributor: string, owner: string, leaseMs: number): Promise<ClaimResult> {
    const id = keyId(key);
    const now = this.now();
    const rec = this.records.get(id);
    if (!rec) {
      const created: SettlementRecord = {
        key: { ...key },
        contributor,
        status: "pending",
        leaseOwner: owner,
        leaseExpiresAt: now + leaseMs,
        signer: null,
        nonce: null,
        txHash: null,
        rawTx: null,
        amountWei: null,
        attempts: 0,
        lastError: null,
        updatedAt: now,
      };
      this.records.set(id, created);
      return { claimed: true, record: copy(created) };
    }
    const expired = rec.leaseExpiresAt === null || rec.leaseExpiresAt < now;
    const takeOver = rec.status === "failed" || (rec.status === "pending" && rec.txHash === null && expired);
    if (!takeOver) return { claimed: false, record: copy(rec) };

    const next: SettlementRecord = {
      ...rec,
      status: "pending",
      leaseOwner: owner,
      leaseExpiresAt: now + leaseMs,
      // failed → its nonce was consumed by a mined tx or already returned to the gap list.
      // pending → keep the reserved nonce so the new owner reuses it (no gap).
      nonce: rec.status === "failed" ? null : rec.nonce,
      txHash: null,
      rawTx: null,
      lastError: null,
      updatedAt: now,
    };
    this.records.set(id, next);
    return { claimed: true, record: copy(next) };
  }

  async reserveNonce(
    key: SettlementKey,
    owner: string,
    signer: string,
    chainPendingNonce: number,
    leaseMs: number,
  ): Promise<number | null> {
    const rec = this.records.get(keyId(key));
    const now = this.now();
    if (!rec || rec.status !== "pending" || rec.leaseOwner !== owner || rec.txHash !== null) return null;

    let nonce = rec.nonce;
    if (nonce !== null && rec.signer !== signer) {
      this.gapsOf(rec.signer as string).add(nonce); // key rotated: give the old signer its nonce back
      nonce = null;
    }
    if (nonce !== null && nonce < chainPendingNonce) nonce = null; // consumed on chain by another tx
    if (nonce === null) nonce = this.allocateSync(signer, chainPendingNonce, leaseMs);

    this.records.set(keyId(key), { ...rec, signer, nonce, leaseExpiresAt: now + leaseMs, updatedAt: now });
    return nonce;
  }

  async recordBroadcast(key: SettlementKey, owner: string, txHash: string, rawTx: string): Promise<boolean> {
    const rec = this.records.get(keyId(key));
    if (!rec || rec.status !== "pending" || rec.leaseOwner !== owner || rec.txHash !== null || rec.nonce === null) {
      return false;
    }
    this.records.set(keyId(key), { ...rec, txHash, rawTx, attempts: rec.attempts + 1, updatedAt: this.now() });
    return true;
  }

  async releaseNonce(key: SettlementKey, owner: string, reason: string): Promise<void> {
    const rec = this.records.get(keyId(key));
    if (!rec || rec.leaseOwner !== owner || rec.status !== "pending") return;
    if (rec.nonce !== null && rec.signer !== null) this.gapsOf(rec.signer).add(rec.nonce);
    this.records.set(keyId(key), {
      ...rec,
      status: "failed",
      nonce: null,
      txHash: null,
      rawTx: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: reason,
      updatedAt: this.now(),
    });
  }

  async resetAttempt(
    key: SettlementKey,
    expectedTxHash: string,
    owner: string,
    leaseMs: number,
    maxAttempts: number,
  ): Promise<boolean> {
    const rec = this.records.get(keyId(key));
    const now = this.now();
    if (!rec || rec.status !== "pending" || rec.txHash !== expectedTxHash || rec.attempts >= maxAttempts) return false;
    this.records.set(keyId(key), {
      ...rec,
      txHash: null,
      rawTx: null,
      nonce: null,
      leaseOwner: owner,
      leaseExpiresAt: now + leaseMs,
      updatedAt: now,
    });
    return true;
  }

  async markSettled(key: SettlementKey, contributor: string, txHash: string | null, amountWei: string): Promise<void> {
    const rec = this.records.get(keyId(key));
    const now = this.now();
    const base: SettlementRecord = rec ?? {
      key: { ...key },
      contributor,
      status: "settled",
      leaseOwner: null,
      leaseExpiresAt: null,
      signer: null,
      nonce: null,
      txHash: null,
      rawTx: null,
      amountWei: null,
      attempts: 0,
      lastError: null,
      updatedAt: now,
    };
    this.records.set(keyId(key), {
      ...base,
      status: "settled",
      txHash: txHash ?? base.txHash,
      rawTx: null,
      amountWei,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      updatedAt: now,
    });
  }

  async markFailed(key: SettlementKey, txHash: string | null, reason: string): Promise<void> {
    const rec = this.records.get(keyId(key));
    if (!rec || rec.status === "settled") return;
    const unusedNonce = txHash === null && rec.nonce !== null && rec.signer !== null;
    if (unusedNonce) this.gapsOf(rec.signer as string).add(rec.nonce as number);
    this.records.set(keyId(key), {
      ...rec,
      status: "failed",
      txHash,
      rawTx: null,
      nonce: unusedNonce ? null : rec.nonce,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: reason,
      updatedAt: this.now(),
    });
  }

  async allocateNonce(signer: string, chainPendingNonce: number, idleMs: number): Promise<number> {
    return this.allocateSync(signer, chainPendingNonce, idleMs);
  }

  async findNonceHolder(signer: string, nonce: number): Promise<NonceHolder> {
    const now = this.now();
    for (const rec of this.records.values()) {
      if (rec.signer !== signer || rec.status !== "pending" || rec.nonce !== nonce) continue;
      if (rec.txHash !== null) return { kind: "inflight", txHash: rec.txHash, rawTx: rec.rawTx };
      if (rec.leaseExpiresAt !== null && rec.leaseExpiresAt >= now) return { kind: "reserved" };
    }
    return { kind: "none" };
  }

  async releaseSignerNonce(signer: string, nonce: number): Promise<void> {
    this.gapsOf(signer).add(nonce);
  }

  async resyncSignerNonce(signer: string, chainPendingNonce: number): Promise<void> {
    const state = this.stateOf(signer, chainPendingNonce);
    state.nextNonce = chainPendingNonce;
    state.touchedAt = this.now();
    for (const g of [...state.gaps]) if (g < chainPendingNonce) state.gaps.delete(g);
  }

  private allocateSync(signer: string, chainPendingNonce: number, idleMs: number): number {
    const state = this.stateOf(signer, chainPendingNonce);
    const now = this.now();
    const idle = now - state.touchedAt >= idleMs;
    state.touchedAt = now;
    // Abandoned jobs (nonce reserved, never broadcast, lease expired) give their nonce back first.
    for (const [id, rec] of this.records) {
      const abandoned =
        rec.signer === signer &&
        rec.status === "pending" &&
        rec.txHash === null &&
        rec.nonce !== null &&
        (rec.leaseExpiresAt === null || rec.leaseExpiresAt < now);
      if (abandoned) {
        state.gaps.add(rec.nonce as number);
        this.records.set(id, { ...rec, nonce: null, updatedAt: now });
      }
    }
    if (idle) this.reconcile(signer, state, chainPendingNonce, now);
    for (const g of [...state.gaps]) if (g < chainPendingNonce) state.gaps.delete(g);
    if (state.gaps.size > 0) {
      const lowest = Math.min(...state.gaps);
      state.gaps.delete(lowest);
      return lowest;
    }
    const nonce = Math.max(state.nextNonce, chainPendingNonce);
    state.nextNonce = nonce + 1;
    return nonce;
  }

  /**
   * Only after the counter was idle for a lease: no allocation can be between "reserved" and "broadcast" then.
   * Nonces the chain has not used and no live job holds are holes → gaps. A counter above every held nonce
   * (chain reset, lost DB rows) comes down to the chain's pending nonce.
   */
  private reconcile(signer: string, state: SignerState, chainPendingNonce: number, now: number): void {
    const held = new Set<number>();
    for (const rec of this.records.values()) {
      const live = rec.txHash !== null || (rec.leaseExpiresAt !== null && rec.leaseExpiresAt >= now);
      if (rec.signer === signer && rec.status === "pending" && rec.nonce !== null && live) held.add(rec.nonce);
    }
    const top = Math.max(chainPendingNonce, ...[...held].map((n) => n + 1));
    if (state.nextNonce > top) state.nextNonce = top;
    for (const g of [...state.gaps]) if (g >= top) state.gaps.delete(g);
    if (top - chainPendingNonce > MAX_RECONCILE_RANGE) return;
    for (let n = chainPendingNonce; n < top; n++) if (!held.has(n)) state.gaps.add(n);
  }

  private stateOf(signer: string, initial: number): SignerState {
    let state = this.signers.get(signer);
    if (!state) {
      state = { nextNonce: initial, gaps: new Set(), touchedAt: this.now() };
      this.signers.set(signer, state);
    }
    return state;
  }

  private gapsOf(signer: string): Set<number> {
    return this.stateOf(signer, 0).gaps;
  }
}
