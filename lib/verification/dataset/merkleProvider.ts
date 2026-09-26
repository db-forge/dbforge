// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Production Merkle provider boundary — FAILS CLOSED.
//
// lib/verification/dataset/merkle.ts holds a real, tested, but PROVISIONAL
// hashing/tree algorithm (documented there as "fallback-sorted-pair-
// keccak256-v1"). Per the integration correction: that fallback must
// never be used for a real anchor-bound dataset build, because if its
// convention doesn't byte-for-byte match lib/monad/merkle.ts (which does
// not exist in this repo yet) and whatever the deployed contract expects,
// an anchored root would be unverifiable on-chain — worse than refusing
// to build at all.
//
// So: the real dataset-build endpoint calls getMerkleTreeProvider(), which
// throws (fails closed) until the real implementation is wired in. Once
// lib/monad/merkle.ts exists, wire it in with a plain static import:
//
//   import { hashLeaf, computeRoot } from "@/lib/monad/merkle";
//   export function getMerkleTreeProvider(): MerkleTreeProvider {
//     return { hashLeaf, computeRoot };
//   }
//
// The only other way to get a non-throwing provider is explicit test
// injection (see registerFallbackMerkleProviderForTests in merkle.ts) —
// never reachable from a real request.

import type { CanonicalSample } from "./canonical";

export interface MerkleTreeProvider {
  hashLeaf(sample: CanonicalSample): `0x${string}`;
  computeRoot(leafHashes: readonly `0x${string}`[]): `0x${string}`;
}

export type MerkleProviderErrorKind = "unavailable";

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

export function getMerkleTreeProvider(): MerkleTreeProvider {
  if (testOverride) return testOverride;

  throw new MerkleProviderError(
    "No production Merkle provider is configured — lib/monad/merkle.ts has not been wired in. " +
      "Refusing to compute an anchor-bound Merkle root with an unverified algorithm.",
    "unavailable",
  );
}
