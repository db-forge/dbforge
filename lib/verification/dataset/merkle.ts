// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// TEST-ONLY / HISTORICAL. Leaf hashing + Merkle root computation over this
// codebase's own "canonical sample" object (mediaHash + contributor +
// settlementTxHash + semanticScore).
//
// SUPERSEDED at integration time: the real on-chain-verifiable dataset
// tree (lib/verification/dataset/merkleProvider.ts, wired to
// lib/monad.buildDatasetTree) is built ENTIRELY from the Vault's `Settled`
// event logs with single-value leaves (just the submissionHash, OpenZeppelin
// StandardMerkleTree-compatible) — a fundamentally different leaf shape
// than this module's, not just a different hash algorithm. This file no
// longer wires into getMerkleTreeProvider() at all (their interfaces no
// longer match) and must never be used for a real anchor-bound build.
// Kept only for its still-valid determinism demonstration (same sample set
// in a different order -> identical root; one sample changes -> root
// changes) and in case a future *off-chain-only* audit root is wanted
// alongside the on-chain one.
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
import type { CanonicalSample } from "./canonical";

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
