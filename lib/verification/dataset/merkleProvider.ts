// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Production Merkle provider — wired to the real lib/monad.buildDatasetTree
// (confirmed shape from origin/feat/contracts's lib/monad/merkle.ts at
// integration time, NOT the shape assumed in earlier milestones).
//
// This is a real architectural correction, not just a hash-algorithm swap:
// the on-chain-verifiable dataset tree is built ENTIRELY from the Vault's
// `Settled` event logs (leaf = keccak256(keccak256(abi.encode(submissionHash))),
// OpenZeppelin StandardMerkleTree-compatible, sorted pairs) — never from our
// own DB query or our own richer "canonical sample" object (mediaHash +
// contributor + settlementTxHash + semanticScore) used in
// lib/verification/dataset/canonical.ts/merkle.ts. That module is now
// explicitly test-only (see its own doc comment) — a root computed from
// our richer leaves would not match what ProvenanceRegistry.verifySample
// can check on chain.
//
// Read-only (no signing key needed), so this calls lib/monad directly —
// no dependency on the SettlementAdapter/store.

import { buildDatasetTree, isMonadSettlementError, type MonadErrorCode } from "@/lib/monad";

export interface DatasetTreeEntry {
  submissionHash: string;
  contributor: string;
  amountWei: string;
  txHash: string;
  blockNumber: string;
}

export interface DatasetTreeResult {
  root: string;
  sampleCount: number;
  entries: DatasetTreeEntry[];
}

export interface MerkleTreeProvider {
  buildDatasetTree(input: { chainMissionId: string }): Promise<DatasetTreeResult>;
}

export type MerkleProviderErrorKind = "unavailable" | "invalid" | "unknown";

export class MerkleProviderError extends Error {
  constructor(
    message: string,
    readonly kind: MerkleProviderErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MerkleProviderError";
  }
}

let testOverride: MerkleTreeProvider | null = null;

/**
 * Test-only injection point. Production code must never call this — see
 * lib/verification/dataset/merkle.ts's registerFallbackMerkleProviderForTests
 * for the one sanctioned caller (explicit test/demo scripts).
 */
export function __setMerkleProviderForTests(provider: MerkleTreeProvider | null): void {
  testOverride = provider;
}

function mapErrorKind(code: MonadErrorCode): MerkleProviderErrorKind {
  if (code === "RPC_ERROR") return "unavailable";
  if (code === "MISSION_NOT_FOUND" || code === "INVALID_INPUT") return "invalid";
  return "unknown";
}

const realProvider: MerkleTreeProvider = {
  async buildDatasetTree({ chainMissionId }) {
    try {
      const tree = await buildDatasetTree({ chainMissionId });
      return {
        root: tree.root,
        sampleCount: tree.hashes.length,
        entries: tree.entries.map((e) => ({
          submissionHash: e.submissionHash,
          contributor: e.contributor,
          amountWei: e.amount,
          txHash: e.txHash,
          blockNumber: e.blockNumber,
        })),
      };
    } catch (error) {
      if (isMonadSettlementError(error)) {
        throw new MerkleProviderError(error.message, mapErrorKind(error.code), error);
      }
      throw new MerkleProviderError("Unexpected error building the dataset Merkle tree.", "unknown", error);
    }
  },
};

export function getMerkleTreeProvider(): MerkleTreeProvider {
  return testOverride ?? realProvider;
}
