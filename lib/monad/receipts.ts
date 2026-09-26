// Waiting for a sent tx on Monad: receipt + confirmations, drop detection (re-broadcast the SAME signed tx once),
// replacement detection (the nonce was used by another tx → this hash can never be mined), and hole repair
// (the tx waits in the pool behind a nonce nobody sent).

import type { Hex } from "viem";
import type { ReceiptInfo, VaultChain } from "./chain";
import { MonadSettlementError } from "./errors";
import type { SettlementLogger } from "./log";

export interface InFlightTx {
  txHash: Hex;
  rawTx: Hex | null;
  nonce: number | null;
  signer: string | null;
}

export type WaitOutcome = { kind: "receipt"; receipt: ReceiptInfo } | { kind: "replaced" };

export interface WaitOptions {
  chain: VaultChain;
  deadline: number;
  pollIntervalMs: number;
  dropGraceMs: number;
  confirmations: number;
  sleep: (ms: number) => Promise<void>;
  log: SettlementLogger;
  logContext: { chainMissionId?: string; submissionHash?: string };
  /** Called when the tx sits in the pool behind missing nonces [fromNonce, toNonce) of `signer`. */
  repairHoles?: (signer: string, fromNonce: number, toNonce: number) => Promise<void>;
}

function timeout(txHash: Hex): MonadSettlementError {
  return new MonadSettlementError("TX_TIMEOUT", { reason: "NO_RECEIPT", txHash });
}

async function waitConfirmations(receipt: ReceiptInfo, tx: InFlightTx, o: WaitOptions): Promise<void> {
  if (o.confirmations <= 1) return;
  for (;;) {
    const head = await o.chain.getBlockNumber();
    if (head - receipt.blockNumber + BigInt(1) >= BigInt(o.confirmations)) return;
    if (Date.now() >= o.deadline) throw timeout(tx.txHash);
    await o.sleep(o.pollIntervalMs);
  }
}

/** Resolves on a receipt (success or reverted) or "replaced". Throws TX_TIMEOUT at the deadline. */
export async function waitForTx(tx: InFlightTx, o: WaitOptions): Promise<WaitOutcome> {
  let lastCheck = Date.now();
  let rebroadcast = false;
  for (;;) {
    const receipt = await o.chain.getReceipt(tx.txHash);
    if (receipt) {
      await waitConfirmations(receipt, tx, o);
      return { kind: "receipt", receipt };
    }

    let mined: number | null = null;
    if (tx.nonce !== null && tx.signer !== null) {
      mined = await o.chain.getNonce(tx.signer, "latest");
      if (mined > tx.nonce) {
        // Our nonce is used. Either our receipt appeared just now, or another tx took the nonce.
        const late = await o.chain.getReceipt(tx.txHash);
        if (late) {
          await waitConfirmations(late, tx, o);
          return { kind: "receipt", receipt: late };
        }
        o.log({ event: "tx.replaced", ...o.logContext, txHash: tx.txHash, nonce: tx.nonce });
        return { kind: "replaced" };
      }
    }

    if (Date.now() - lastCheck >= o.dropGraceMs) {
      lastCheck = Date.now();
      if (!(await o.chain.isKnown(tx.txHash))) {
        if (!rebroadcast && tx.rawTx) {
          // Dropped from the mempool: the same signed tx refills the same nonce. Identical bytes → no double send.
          rebroadcast = true;
          o.log({ event: "tx.rebroadcast", ...o.logContext, txHash: tx.txHash, nonce: tx.nonce ?? undefined });
          await o.chain.broadcast(tx.rawTx).catch(() => undefined); // "replaced" is detected on the next loop
        }
      } else if (mined !== null && tx.nonce !== null && tx.signer !== null && mined < tx.nonce && o.repairHoles) {
        // "pending" = next nonce the node can execute (contiguous pool). Past ours → just waiting for a block.
        // (A node without a pool view returns "latest" here; then every unmined nonce below ours is checked.)
        const executable = await o.chain.getNonce(tx.signer, "pending");
        if (executable <= tx.nonce) await o.repairHoles(tx.signer, Math.max(mined, executable), tx.nonce);
      }
    }

    if (Date.now() >= o.deadline) throw timeout(tx.txHash);
    await o.sleep(o.pollIntervalMs);
  }
}
