// Server-side settlement adapter (G6). Public surface: settleSubmission, getSettlement, getContributorBalance,
// withdrawForContributor, listWithdrawals. Idempotency and nonces live in the SettlementStore; contract calls in chain.ts.

import { randomUUID } from "node:crypto";
import { parseEventLogs, type Address, type Hex } from "viem";
import { MISSION_STATUS, missionVaultAbi } from "./abi";
import { BroadcastError, type PreparedTx, type ReceiptInfo, type VaultChain } from "./chain";
import type { MonadAdapterConfig } from "./config";
import { MonadSettlementError, isMonadSettlementError } from "./errors";
import { silentLogger, type SettlementLogger } from "./log";
import { waitForTx, type InFlightTx, type WaitOptions } from "./receipts";
import type { SettlementKey, SettlementRecord, SettlementStore } from "./store/types";
import { parseAddress, parseMissionId, parseSubmissionHash, requireObject } from "./validation";

export interface SettleSubmissionInput {
  chainMissionId: string | number | bigint;
  contributorAddress: string;
  submissionHash: string;
}
export interface SettleSubmissionResult {
  /** null only when the chain shows the settlement but its Settled log is outside the scanned block range. */
  txHash: Hex | null;
  /** wei, decimal string */
  amount: string;
  status: "settled";
}
export type SettlementView =
  | { status: "none" }
  | { status: "pending"; txHash?: Hex }
  | { status: "settled"; txHash?: Hex; amount: string };
export interface ContributorBalance {
  credited: string;
  withdrawn: string;
  withdrawable: string;
}
export interface WithdrawResult {
  txHash: Hex;
  amount: string;
}
export interface WithdrawalEntry {
  txHash: Hex;
  blockNumber: string;
  amount: string;
}

export type AdapterTimings = Pick<
  MonadAdapterConfig,
  "txTimeoutMs" | "confirmations" | "pollIntervalMs" | "leaseMs" | "dropGraceMs" | "vaultDeployBlock"
>;

export interface SettlementAdapterOptions {
  chain: VaultChain;
  store: SettlementStore;
  timings: AdapterTimings;
  logger?: SettlementLogger;
  /** Unique per process/instance; used as the lease owner. */
  instanceId?: string;
}

/** A dropped/replaced tx gets exactly one new attempt. */
const MAX_TX_ATTEMPTS = 2;
/** Broadcasts that hit "nonce too low" (nonce used by something else) re-reserve at most this often. */
const MAX_NONCE_RETRIES = 3;
/** Hole repair touches at most this many nonces per check (a bigger hole means a stale counter: see reconcile). */
const MAX_HOLE_REPAIR = 16;

class LeaseLost extends Error {}

interface SettleRequest {
  missionId: bigint;
  contributor: Address;
  hash: Hex;
  key: SettlementKey;
  log: { chainMissionId: string; submissionHash: string };
}

export class SettlementAdapter {
  private readonly chain: VaultChain;
  private readonly store: SettlementStore;
  private readonly t: AdapterTimings;
  private readonly log: SettlementLogger;
  private readonly id: string;

  constructor(options: SettlementAdapterOptions) {
    this.chain = options.chain;
    this.store = options.store;
    this.t = options.timings;
    this.log = options.logger ?? silentLogger;
    this.id = options.instanceId ?? `${process.pid}-${randomUUID()}`;
  }

  // ------------------------------------------------------------------------------------------------ public API

  /** Credits one reward on chain. Returns only after a successful receipt. Same key again → same result, no new tx. */
  async settleSubmission(input: SettleSubmissionInput): Promise<SettleSubmissionResult> {
    const startedAt = Date.now();
    const req = this.parseSettle(input);
    try {
      const result = await this.settle(req, startedAt + this.t.txTimeoutMs);
      this.log({ event: "settle.ok", ...req.log, txHash: result.txHash ?? undefined, status: result.status,
        durationMs: Date.now() - startedAt });
      return result;
    } catch (e) {
      const err = isMonadSettlementError(e) ? e : new MonadSettlementError("RPC_ERROR", { reason: "UNEXPECTED" });
      this.log({ event: "settle.error", ...req.log, code: err.code, reason: err.reason, txHash: err.txHash,
        durationMs: Date.now() - startedAt });
      throw err;
    }
  }

  async getSettlement(input: { chainMissionId: string | number | bigint; submissionHash: string }): Promise<SettlementView> {
    const o = requireObject(input);
    const missionId = parseMissionId(o.chainMissionId);
    const hash = parseSubmissionHash(o.submissionHash);
    const stored = await this.store.get(this.keyOf(missionId, hash));
    if (stored?.status === "settled" && stored.amountWei !== null) {
      return { status: "settled", amount: stored.amountWei, ...(stored.txHash ? { txHash: stored.txHash as Hex } : {}) };
    }
    const onChain = await this.chain.getSettlement(missionId, hash);
    if (onChain.settled) {
      return { status: "settled", amount: onChain.amount.toString(), ...(stored?.txHash ? { txHash: stored.txHash as Hex } : {}) };
    }
    if (stored?.status === "pending") return { status: "pending", ...(stored.txHash ? { txHash: stored.txHash as Hex } : {}) };
    return { status: "none" };
  }

  async getContributorBalance(input: { contributorAddress: string }): Promise<ContributorBalance> {
    const contributor = parseAddress(requireObject(input).contributorAddress, "contributorAddress");
    const b = await this.chain.getContributorBalance(contributor);
    return { credited: b.credited.toString(), withdrawn: b.withdrawn.toString(), withdrawable: b.withdrawable.toString() };
  }

  /** The verifier pays the gas; the Vault sends the MON ONLY to `contributorAddress` (withdrawFor). */
  async withdrawForContributor(input: { contributorAddress: string }): Promise<WithdrawResult> {
    const startedAt = Date.now();
    const contributor = parseAddress(requireObject(input).contributorAddress, "contributorAddress");
    try {
      const result = await this.withdrawFor(contributor, startedAt + this.t.txTimeoutMs);
      this.log({ event: "withdraw.ok", contributor, txHash: result.txHash, durationMs: Date.now() - startedAt });
      return result;
    } catch (e) {
      const err = isMonadSettlementError(e) ? e : new MonadSettlementError("RPC_ERROR", { reason: "UNEXPECTED" });
      this.log({ event: "withdraw.error", contributor, code: err.code, reason: err.reason, txHash: err.txHash });
      throw err;
    }
  }

  async listWithdrawals(input: { contributorAddress: string; fromBlock?: bigint | number }): Promise<WithdrawalEntry[]> {
    const o = requireObject(input);
    const contributor = parseAddress(o.contributorAddress, "contributorAddress");
    const from = o.fromBlock === undefined ? this.t.vaultDeployBlock : BigInt(o.fromBlock as bigint | number);
    const logs = await this.chain.listWithdrawn(contributor, from);
    return logs.map((l) => ({ txHash: l.txHash, blockNumber: l.blockNumber.toString(), amount: l.amount.toString() }));
  }

  /** `paused()` on the Vault. The UI should block "Create mission" while true (G4 L-2); settlement is refused anyway. */
  async isSettlementPaused(): Promise<boolean> {
    return this.chain.isPaused();
  }

  /** Ops tool (key rotation, DB restore): align the stored nonce counter with the chain. */
  async resyncNonce(): Promise<number> {
    const pending = await this.chain.getNonce(this.chain.signer, "pending");
    await this.store.resyncSignerNonce(this.signerKey(), pending);
    return pending;
  }

  // ------------------------------------------------------------------------------------------------ settle flow

  private async settle(req: SettleRequest, deadline: number): Promise<SettleSubmissionResult> {
    const stored = await this.store.get(req.key);
    if (stored) this.assertSameContributor(stored, req);
    if (stored?.status === "settled") return this.fromRecord(stored, req);

    // Check the chain before sending anything (Monad bills a reverted AlreadySettled in full).
    const already = await this.readChainSettlement(req, stored?.txHash ?? null);
    if (already) return already;

    for (;;) {
      const { claimed, record } = await this.store.claim(req.key, req.contributor.toLowerCase(), this.id, this.t.leaseMs);
      this.assertSameContributor(record, req);
      if (record.status === "settled") return this.fromRecord(record, req);
      try {
        if (claimed) return await this.sendAsOwner(req, deadline, false);
        if (record.txHash) return await this.awaitRecorded(req, this.inFlight(record), deadline);
      } catch (e) {
        if (!(e instanceof LeaseLost)) throw e;
      }
      // Another instance is preparing this key: wait for its tx hash (or its lease to expire).
      if (Date.now() >= deadline) throw new MonadSettlementError("TX_TIMEOUT", { reason: "IN_PROGRESS_ELSEWHERE" });
      await sleep(this.t.pollIntervalMs);
    }
  }

  private async sendAsOwner(req: SettleRequest, deadline: number, retry: boolean): Promise<SettleSubmissionResult> {
    let prepared: PreparedTx;
    try {
      prepared = await this.prepareSettle(req);
    } catch (e) {
      // Settled between our chain check and the simulation (stale read on Monad): that is a success.
      if (isMonadSettlementError(e) && e.reason === "AlreadySettled") {
        const done = await this.readChainSettlement(req, null);
        if (done) return done;
      }
      throw e;
    }
    for (let i = 0; ; i++) {
      const pending = await this.chain.getNonce(this.chain.signer, "pending");
      const nonce = await this.store.reserveNonce(req.key, this.id, this.signerKey(), pending, this.t.leaseMs);
      if (nonce === null) throw new LeaseLost();
      const { hash, raw } = await this.chain.sign(prepared, nonce);
      // Persist BEFORE broadcasting: after a crash any instance finds the hash and waits instead of re-sending.
      if (!(await this.store.recordBroadcast(req.key, this.id, hash, raw))) throw new LeaseLost();
      this.log({ event: "tx.broadcast", ...req.log, txHash: hash, nonce, retry });

      const kind = await this.tryBroadcast(raw);
      if (kind === "ok") return this.awaitRecorded(req, { txHash: hash, rawTx: raw, nonce, signer: this.signerKey() }, deadline);
      if (kind === "nonce_too_low" && i < MAX_NONCE_RETRIES) {
        // The nonce is used by something else (not a gap): drop this attempt and reserve again.
        if (await this.store.resetAttempt(req.key, hash, this.id, this.t.leaseMs, MAX_TX_ATTEMPTS + MAX_NONCE_RETRIES)) continue;
        throw new LeaseLost();
      }
      if (kind === "nonce_too_low") {
        await this.store.markFailed(req.key, null, "NONCE_CONFLICT");
        throw new MonadSettlementError("RPC_ERROR", { reason: "NONCE_CONFLICT" });
      }
      // Definitive rejection: the nonce was never used → back to the gap list so the next tx fills it.
      await this.store.releaseNonce(req.key, this.id, kind.toUpperCase());
      if (kind === "insufficient_funds") throw new MonadSettlementError("INSUFFICIENT_FUNDS", { reason: "BROADCAST" });
      throw new MonadSettlementError("RPC_ERROR", { reason: "BROADCAST_REJECTED" });
    }
  }

  private async prepareSettle(req: SettleRequest): Promise<PreparedTx> {
    try {
      if (await this.chain.isPaused()) throw new MonadSettlementError("CONTRACT_PAUSED", { detail: "Not sent." });
      const status = await this.chain.getMissionStatus(req.missionId);
      if (status === MISSION_STATUS.None) throw new MonadSettlementError("MISSION_NOT_FOUND");
      return await this.chain.prepare({ functionName: "approveSubmission", args: [req.missionId, req.contributor, req.hash] });
    } catch (e) {
      const err = isMonadSettlementError(e) ? e : new MonadSettlementError("RPC_ERROR", { reason: "PREPARE" });
      // Nothing was sent: free the job so the next call can claim it at once.
      await this.store.markFailed(req.key, null, err.reason ?? err.code);
      throw err;
    }
  }

  /** Waits for a recorded tx (ours or another instance's). Handles replaced txs with ONE new attempt. */
  private async awaitRecorded(req: SettleRequest, tx: InFlightTx, deadline: number): Promise<SettleSubmissionResult> {
    let current = tx;
    for (;;) {
      const outcome = await waitForTx(current, this.waitOptions(deadline, req.log));
      if (outcome.kind === "receipt") return this.finishReceipt(req, current.txHash, outcome.receipt);

      const onChain = await this.readChainSettlement(req, null);
      if (onChain) return onChain;
      if (await this.store.resetAttempt(req.key, current.txHash, this.id, this.t.leaseMs, MAX_TX_ATTEMPTS)) {
        this.log({ event: "tx.retry", ...req.log, txHash: current.txHash, retry: true });
        return this.sendAsOwner(req, deadline, true);
      }
      const now = await this.store.get(req.key);
      if (now?.status === "settled") return this.fromRecord(now, req);
      if (now?.status === "pending" && now.txHash && now.txHash !== current.txHash) {
        current = this.inFlight(now); // another instance already made the retry
        continue;
      }
      if (now?.status === "pending" && !now.txHash) throw new LeaseLost();
      await this.store.markFailed(req.key, current.txHash, "TX_DROPPED");
      throw new MonadSettlementError("RPC_ERROR", { reason: "TX_DROPPED", txHash: current.txHash });
    }
  }

  private async finishReceipt(req: SettleRequest, txHash: Hex, receipt: ReceiptInfo): Promise<SettleSubmissionResult> {
    if (receipt.status !== "success") {
      await this.store.markFailed(req.key, txHash, "REVERTED");
      throw new MonadSettlementError("TX_REVERTED", { reason: "REVERTED_ON_CHAIN", txHash });
    }
    const settled = parseEventLogs({ abi: missionVaultAbi, eventName: "Settled", logs: receipt.logs as never }).find(
      (l) =>
        l.address.toLowerCase() === this.chain.vault.toLowerCase() &&
        l.args.missionId === req.missionId &&
        l.args.submissionHash.toLowerCase() === req.hash,
    );
    const amount = settled ? settled.args.amount : (await this.chain.getSettlement(req.missionId, req.hash)).amount;
    await this.store.markSettled(req.key, req.contributor.toLowerCase(), txHash, amount.toString());
    return { txHash, amount: amount.toString(), status: "settled" };
  }

  /** ALREADY_SETTLED is a successful return. A different contributor for the same key is INVALID_INPUT. */
  private async readChainSettlement(req: SettleRequest, knownTx: string | null): Promise<SettleSubmissionResult | null> {
    const s = await this.chain.getSettlement(req.missionId, req.hash);
    if (!s.settled) return null;
    if (s.contributor.toLowerCase() !== req.contributor.toLowerCase()) {
      throw new MonadSettlementError("INVALID_INPUT", { reason: "SETTLED_TO_OTHER_CONTRIBUTOR" });
    }
    const txHash = (knownTx as Hex | null) ?? (await this.chain.findSettledTx(req.missionId, req.hash));
    await this.store.markSettled(req.key, req.contributor.toLowerCase(), txHash, s.amount.toString());
    this.log({ event: "settle.already_settled", ...req.log, txHash: txHash ?? undefined, idempotent: true });
    return { txHash, amount: s.amount.toString(), status: "settled" };
  }

  // ------------------------------------------------------------------------------------------------ withdrawFor

  private async withdrawFor(contributor: Address, deadline: number): Promise<WithdrawResult> {
    const prepared = await this.chain.prepare({ functionName: "withdrawFor", args: [contributor] });
    const signer = this.signerKey();
    for (let i = 0; ; i++) {
      const pending = await this.chain.getNonce(this.chain.signer, "pending");
      const nonce = await this.store.allocateNonce(signer, pending, this.t.leaseMs);
      const { hash, raw } = await this.chain.sign(prepared, nonce);
      this.log({ event: "tx.broadcast", contributor, txHash: hash, nonce });
      const kind = await this.tryBroadcast(raw);
      if (kind === "nonce_too_low" && i < MAX_NONCE_RETRIES) continue; // used nonce: not a gap
      if (kind !== "ok") {
        if (kind !== "nonce_too_low") await this.store.releaseSignerNonce(signer, nonce);
        if (kind === "insufficient_funds") throw new MonadSettlementError("INSUFFICIENT_FUNDS", { reason: "BROADCAST" });
        throw new MonadSettlementError("RPC_ERROR", { reason: kind === "nonce_too_low" ? "NONCE_CONFLICT" : "BROADCAST_REJECTED" });
      }
      const outcome = await waitForTx({ txHash: hash, rawTx: raw, nonce, signer }, this.waitOptions(deadline, {}));
      if (outcome.kind === "replaced") throw new MonadSettlementError("RPC_ERROR", { reason: "TX_DROPPED", txHash: hash });
      if (outcome.receipt.status !== "success") {
        // G4 L-4: someone withdrew first (front-run) → the contributor is already paid. Never retried.
        const left = (await this.chain.getContributorBalance(contributor)).withdrawable;
        const reason = left === BigInt(0) ? "NothingToWithdraw" : "REVERTED_ON_CHAIN";
        throw new MonadSettlementError("TX_REVERTED", { reason, txHash: hash });
      }
      const log = parseEventLogs({ abi: missionVaultAbi, eventName: "Withdrawn", logs: outcome.receipt.logs as never }).find(
        (l) => l.address.toLowerCase() === this.chain.vault.toLowerCase() && l.args.contributor === contributor,
      );
      return { txHash: hash, amount: (log?.args.amount ?? BigInt(0)).toString() };
    }
  }

  // ------------------------------------------------------------------------------------------------ helpers

  private async tryBroadcast(raw: Hex): Promise<"ok" | "nonce_too_low" | "insufficient_funds" | "rejected"> {
    try {
      await this.chain.broadcast(raw);
      return "ok";
    } catch (e) {
      const kind = e instanceof BroadcastError ? e.kind : "ambiguous";
      // ambiguous: the node may have it. Keep the record and wait; a drop is re-broadcast from the stored raw tx.
      if (kind === "ambiguous" || kind === "already_known") return "ok";
      return kind;
    }
  }

  private parseSettle(input: SettleSubmissionInput): SettleRequest {
    const o = requireObject(input);
    const missionId = parseMissionId(o.chainMissionId);
    const contributor = parseAddress(o.contributorAddress, "contributorAddress");
    if (contributor.toLowerCase() === this.chain.vault.toLowerCase()) {
      // The Vault reverts InvalidContributor (G4 L-1). Catch it here: a reverted tx is billed in full on Monad.
      throw new MonadSettlementError("INVALID_INPUT", { reason: "InvalidContributor" });
    }
    const hash = parseSubmissionHash(o.submissionHash);
    return {
      missionId,
      contributor,
      hash,
      key: this.keyOf(missionId, hash),
      log: { chainMissionId: missionId.toString(), submissionHash: hash },
    };
  }

  private keyOf(missionId: bigint, hash: Hex): SettlementKey {
    return { vault: this.chain.vault.toLowerCase(), missionId: missionId.toString(), submissionHash: hash };
  }

  private signerKey(): string {
    return this.chain.signer.toLowerCase();
  }

  private assertSameContributor(record: SettlementRecord, req: SettleRequest): void {
    if (record.contributor.toLowerCase() !== req.contributor.toLowerCase()) {
      throw new MonadSettlementError("INVALID_INPUT", { reason: "KEY_USED_WITH_OTHER_CONTRIBUTOR" });
    }
  }

  private async fromRecord(record: SettlementRecord, req: SettleRequest): Promise<SettleSubmissionResult> {
    this.log({ event: "settle.already_settled", ...req.log, txHash: record.txHash ?? undefined, idempotent: true });
    return { txHash: record.txHash as Hex | null, amount: record.amountWei ?? "0", status: "settled" };
  }

  private inFlight(record: SettlementRecord): InFlightTx {
    return {
      txHash: record.txHash as Hex,
      rawTx: record.rawTx as Hex | null,
      nonce: record.nonce,
      signer: record.signer,
    };
  }

  /**
   * Our tx waits in the pool behind nonces [from, to) that are not mined. A nonce held by a recorded tx is
   * re-broadcast from its stored raw bytes (an orphaned, dropped tx of a job nobody waits for); a nonce nobody holds
   * is filled with a 0-value self-transfer. A live reservation is left alone: its owner is about to broadcast.
   */
  private async repairHoles(signer: string, from: number, to: number): Promise<void> {
    if (signer !== this.signerKey()) return; // only our own key can be signed for
    for (let n = from; n < to && n < from + MAX_HOLE_REPAIR; n++) {
      const holder = await this.store.findNonceHolder(signer, n);
      if (holder.kind === "reserved") continue;
      if (holder.kind === "inflight") {
        if (!holder.rawTx) continue;
        this.log({ event: "tx.hole_rebroadcast", txHash: holder.txHash, nonce: n });
        await this.chain.broadcast(holder.rawTx as Hex).catch(() => undefined);
        continue;
      }
      const filler = await this.chain.signFiller(n);
      this.log({ event: "tx.hole_filled", txHash: filler.hash, nonce: n });
      await this.chain.broadcast(filler.raw).catch(() => undefined); // taken meanwhile → harmless reject
    }
  }

  private waitOptions(deadline: number, ctx: WaitOptions["logContext"]): WaitOptions {
    return {
      repairHoles: (signer, from, to) => this.repairHoles(signer, from, to),
      chain: this.chain,
      deadline,
      pollIntervalMs: this.t.pollIntervalMs,
      dropGraceMs: this.t.dropGraceMs,
      confirmations: this.t.confirmations,
      sleep,
      log: this.log,
      logContext: ctx,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
