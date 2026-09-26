// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// TEST-ONLY. Leaf hashing + Merkle root computation, kept around purely to
// exercise/demonstrate the determinism properties (same sample set in a
// different order -> identical root; one sample changes -> root changes)
// without a live lib/monad/merkle.ts to call.
//
// Per the integration correction: this must NEVER be used for a real
// anchor-bound dataset build. The production path
// (lib/verification/dataset/merkleProvider.ts's getMerkleTreeProvider)
// fails closed until lib/monad/merkle.ts is wired in — it does not fall
// back to this module. The only way this file's algorithm reaches a real
// request is if something explicitly calls
// registerFallbackMerkleProviderForTests() below, which a route handler
// never does.
//
// lib/monad/merkle.ts (the blockchain developer's Merkle helper) does not
// exist yet in this repository. This module is a real, documented
// implementation — not a stub — built on keccak256 (via viem, already a
// project dependency) since that's the one thing any EVM-side Merkle
// verifier will need regardless of tree-construction convention.
//
// Algorithm ("merkle-fallback-sorted-pair-keccak256-v1"):
//   - leaf hash  = keccak256(utf8 bytes of the canonical sample string)
//   - combine(a, b) = keccak256(concat(sort(a, b)))  — pairs are sorted
//     lexicographically before hashing, so sibling order within a pair
//     never matters (canonical LEAF order, enforced upstream, is what
//     actually guarantees the whole-tree determinism the spec asks for)
//   - an odd node at any level is promoted unchanged to the next level
//     (no duplication) — avoids the well-known duplicate-last-leaf
//     ambiguity of the naive "duplicate to make it even" convention
//
// Before this is ever used for a REAL on-chain anchor, this convention
// must be reconciled against lib/monad/merkle.ts's actual convention —
// if they differ, a root computed here will not verify against on-chain
// proof-verification logic built to a different convention. Swap this
// file's computeMerkleRoot/hashCanonicalSample for calls into
// lib/monad/merkle.ts once it exists (keep the exported function
// signatures the same so callers don't need to change).

import { concat, keccak256, toBytes } from "viem";
import { serializeCanonicalSample } from "./canonical";
import { __setMerkleProviderForTests } from "./merkleProvider";
import type { CanonicalSample } from "./canonical";
import type { MerkleTreeProvider } from "./merkleProvider";

export const MERKLE_ALGORITHM_VERSION = "merkle-fallback-sorted-pair-keccak256-v1";
export const LEAF_HASH_ALGORITHM = "keccak256(utf8 bytes of serializeCanonicalSample(sample))";

export function hashCanonicalSample(sample: CanonicalSample): `0x${string}` {
  return keccak256(toBytes(serializeCanonicalSample(sample)));
}

function combine(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
  const [lo, hi] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(concat([lo, hi]));
}

/**
 * Computes the Merkle root over an ORDERED array of leaf hashes. The
 * caller is responsible for canonical ordering (submission_id ASC) before
 * calling this — this function itself never reorders anything, since
 * "same leaves, different order" legitimately produces a different tree
 * shape (only the upstream canonical ordering is what makes the overall
 * pipeline order-independent with respect to DB retrieval order).
 */
export function computeMerkleRoot(leafHashes: readonly `0x${string}`[]): `0x${string}` {
  if (leafHashes.length === 0) {
    throw new Error("Cannot compute a Merkle root over zero leaves.");
  }

  let level: `0x${string}`[] = [...leafHashes];
  while (level.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        next.push(combine(level[i], level[i + 1]));
      } else {
        next.push(level[i]);
      }
    }
    level = next;
  }

  return level[0];
}

const FALLBACK_PROVIDER: MerkleTreeProvider = {
  hashLeaf: hashCanonicalSample,
  computeRoot: computeMerkleRoot,
};

/**
 * The ONE sanctioned caller of this test-only fallback: a test/demo script
 * that explicitly opts in, never a production route handler. Always pair
 * with `registerFallbackMerkleProviderForTests(false)` (or restart the
 * process) afterward so a later real request can't accidentally observe
 * the override.
 */
export function registerFallbackMerkleProviderForTests(enabled: boolean): void {
  __setMerkleProviderForTests(enabled ? FALLBACK_PROVIDER : null);
}
