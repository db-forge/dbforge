// Dataset reads from ProvenanceRegistry (ARCHITECTURE.md v2 §5). datasetId == missionId.

import type { Address, Hex } from "viem";
import { MonadSettlementError } from "./errors";
import { buildDatasetTree } from "./merkle";
import { defaultReader, readAbi, readChain, type MonadReader } from "./reader";
import { parseMissionId, parseSubmissionHash } from "./validation";

export type DatasetView =
  | { status: "none" }
  | {
      status: "anchored";
      merkleRoot: Hex;
      /** Hash of the dataset manifest JSON. */
      metadataHash: Hex;
      sampleCount: string;
      /** Unix seconds of the latest (re-)anchor. */
      anchoredAt: number;
      /** The buyer accepted this root; it can no longer change. */
      finalized: boolean;
    };

export type SampleProof =
  | { included: false }
  | {
      included: true;
      /** Root of the tree rebuilt from the chain's Settled events. */
      root: Hex;
      proof: Hex[];
      /** The anchored root, or null when the dataset is not anchored yet. */
      anchoredRoot: Hex | null;
      /** `ProvenanceRegistry.verifySample` returned true for this proof. */
      verified: boolean;
    };

function requireRegistry(reader: MonadReader): Address {
  if (!reader.registry) {
    throw new MonadSettlementError("INVALID_INPUT", {
      reason: "READER_NOT_CONFIGURED",
      detail: "MONAD_REGISTRY_ADDRESS is not set.",
    });
  }
  return reader.registry;
}

export async function getDataset(
  input: { chainMissionId: unknown },
  reader: MonadReader = defaultReader(),
): Promise<DatasetView> {
  const missionId = parseMissionId(input.chainMissionId);
  const registry = requireRegistry(reader);
  const d = await readChain(() =>
    reader.client.readContract({ address: registry, abi: readAbi, functionName: "getDataset", args: [missionId] }),
  );
  if (d.anchoredAt === BigInt(0)) return { status: "none" };
  return {
    status: "anchored",
    merkleRoot: d.merkleRoot,
    metadataHash: d.metadataHash,
    sampleCount: d.sampleCount.toString(),
    anchoredAt: Number(d.anchoredAt),
    finalized: d.finalized,
  };
}

/**
 * Merkle proof that `submissionHash` is in the mission's dataset. The tree is rebuilt from the chain (not from
 * our DB), then the proof is checked by the Registry itself, so `verified: true` is the on-chain answer:
 * "in the anchored root AND settled in this mission".
 */
export async function getSampleProof(
  input: { chainMissionId: unknown; submissionHash: unknown },
  reader: MonadReader = defaultReader(),
): Promise<SampleProof> {
  const missionId = parseMissionId(input.chainMissionId);
  const submissionHash = parseSubmissionHash(input.submissionHash);
  const registry = requireRegistry(reader);
  const tree = await buildDatasetTree({ chainMissionId: missionId }, reader);
  const proof = tree.getProof(submissionHash);
  if (proof === null) return { included: false };

  const dataset = await getDataset({ chainMissionId: missionId }, reader);
  const verified =
    dataset.status === "anchored" &&
    (await readChain(() =>
      reader.client.readContract({
        address: registry,
        abi: readAbi,
        functionName: "verifySample",
        args: [missionId, submissionHash, proof],
      }),
    ));
  return {
    included: true,
    root: tree.root,
    proof,
    anchoredRoot: dataset.status === "anchored" ? dataset.merkleRoot : null,
    verified,
  };
}
