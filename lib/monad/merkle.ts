// Dataset Merkle tree (ARCHITECTURE.md v2 §5). Same result as OpenZeppelin
// `StandardMerkleTree.of(hashes.map((h) => [h]), ["bytes32"])` (@openzeppelin/merkle-tree v1, sortLeaves on),
// so ProvenanceRegistry.verifySample accepts its proofs. Written out here: package.json stays unchanged.
// Guarded by the fixture in contracts/test/ProvenanceRegistry.t.sol (test_verifySample_matchesOpenZeppelinJsTree).

import { concat, encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { MonadSettlementError } from "./errors";
import { parseMissionId, parseSubmissionHash } from "./validation";
import { defaultReader, readAbi, readChain, type MonadReader } from "./reader";

/** `keccak256(bytes.concat(keccak256(abi.encode(submissionHash))))`: the leaf ProvenanceRegistry checks. */
export function datasetLeaf(submissionHash: Hex): Hex {
  return keccak256(keccak256(encodeAbiParameters([{ type: "bytes32" }], [submissionHash])));
}

/** OpenZeppelin `Hashes.commutativeKeccak256`: hash of the sorted pair. */
function hashPair(a: Hex, b: Hex): Hex {
  return BigInt(a) < BigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

export interface DatasetTree {
  root: Hex;
  /** Submission hashes (lowercase) in tree order. `sampleCount` for anchorDataset is `hashes.length`. */
  hashes: readonly Hex[];
  /** Sibling hashes for `verifySample`, or null when the hash is not in the tree. */
  getProof(submissionHash: Hex): Hex[] | null;
}

/** Builds the tree from submission hashes. Rejects an empty list, a malformed hash and a duplicate. */
export function buildTreeFromHashes(input: readonly string[]): DatasetTree {
  if (input.length === 0) {
    throw new MonadSettlementError("INVALID_INPUT", { reason: "EMPTY_DATASET", detail: "No settled submissions." });
  }
  const seen = new Set<string>();
  const leaves = input.map((raw) => {
    const hash = parseSubmissionHash(raw);
    if (seen.has(hash)) {
      throw new MonadSettlementError("INVALID_INPUT", { reason: "DUPLICATE_LEAF", detail: `Duplicate ${hash}.` });
    }
    seen.add(hash);
    return { hash, leaf: datasetLeaf(hash) };
  });
  // OZ sortLeaves: ascending by leaf hash; leaf i sits at tree[length - 1 - i].
  const sorted = [...leaves].sort((x, y) => (BigInt(x.leaf) < BigInt(y.leaf) ? -1 : 1));
  const tree: Hex[] = new Array(2 * sorted.length - 1);
  sorted.forEach((l, i) => {
    tree[tree.length - 1 - i] = l.leaf;
  });
  for (let i = tree.length - 1 - sorted.length; i >= 0; i--) {
    tree[i] = hashPair(tree[2 * i + 1], tree[2 * i + 2]);
  }
  const position = new Map(sorted.map((l, i) => [l.hash, tree.length - 1 - i] as const));

  return {
    root: tree[0],
    hashes: sorted.map((l) => l.hash),
    getProof(submissionHash) {
      let i = position.get(submissionHash.toLowerCase() as Hex);
      if (i === undefined) return null;
      const proof: Hex[] = [];
      while (i > 0) {
        proof.push(tree[i % 2 === 1 ? i + 1 : i - 1]);
        i = Math.floor((i - 1) / 2);
      }
      return proof;
    },
  };
}

export interface SettledEntry {
  submissionHash: Hex;
  contributor: Address;
  /** wei string */
  amount: string;
  txHash: Hex;
  blockNumber: string;
}

export interface OnChainDatasetTree extends DatasetTree {
  missionId: string;
  /** One entry per Settled event of the mission, in chain order (for the dataset manifest). */
  entries: SettledEntry[];
}

/** Every `Settled` log of one mission, scanned forward in `logChunkSize` block ranges. */
async function readSettledLogs(reader: MonadReader, missionId: bigint): Promise<SettledEntry[]> {
  const out: SettledEntry[] = [];
  const latest = await readChain(() => reader.client.getBlockNumber({ cacheTime: 0 }));
  for (let from = reader.fromBlock; from <= latest; from += reader.logChunkSize) {
    const to = from + reader.logChunkSize - BigInt(1) < latest ? from + reader.logChunkSize - BigInt(1) : latest;
    const logs = await readChain(() =>
      reader.client.getContractEvents({
        address: reader.vault,
        abi: readAbi,
        eventName: "Settled",
        args: { missionId },
        fromBlock: from,
        toBlock: to,
        strict: true,
      }),
    );
    for (const l of logs) {
      out.push({
        submissionHash: l.args.submissionHash.toLowerCase() as Hex,
        contributor: l.args.contributor,
        amount: l.args.amount.toString(),
        txHash: l.transactionHash,
        blockNumber: l.blockNumber.toString(),
      });
    }
  }
  return out;
}

/**
 * The dataset tree of a mission, built only from what the chain says: its `Settled` events on the Vault.
 * The leaf count must equal `getMission(missionId).acceptedCount`; otherwise the scan missed logs
 * (MONAD_VAULT_DEPLOY_BLOCK too high, RPC range limits) and the root would be wrong, so it throws.
 */
export async function buildDatasetTree(
  input: { chainMissionId: unknown },
  reader: MonadReader = defaultReader(),
): Promise<OnChainDatasetTree> {
  const missionId = parseMissionId(input.chainMissionId);
  const mission = await readChain(() =>
    reader.client.readContract({ address: reader.vault, abi: readAbi, functionName: "getMission", args: [missionId] }),
  );
  if (mission.status === 0) throw new MonadSettlementError("MISSION_NOT_FOUND");
  const entries = await readSettledLogs(reader, missionId);
  if (BigInt(entries.length) !== mission.acceptedCount) {
    throw new MonadSettlementError("RPC_ERROR", {
      reason: "SETTLED_LOG_COUNT_MISMATCH",
      detail: `Found ${entries.length} Settled logs, acceptedCount is ${mission.acceptedCount}.`,
    });
  }
  const tree = buildTreeFromHashes(entries.map((e) => e.submissionHash));
  return { ...tree, missionId: missionId.toString(), entries };
}
