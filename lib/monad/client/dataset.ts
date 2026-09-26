// Buyer acceptance of an anchored dataset. Anchoring is server-side (verifier, lib/monad).

import { isAddressEqual, parseEventLogs, type Hex } from "viem";
import { provenanceRegistryAbi } from "./abi";
import { DbforgeClientError, toClientError } from "./errors";
import { assertBytes32, toMissionId } from "./mission";
import { sendWrite, type ClientContext } from "./tx";

export interface DatasetView {
  missionId: bigint;
  merkleRoot: Hex;
  metadataHash: Hex;
  sampleCount: bigint;
  /** unix seconds of the latest anchor; 0 = never anchored */
  anchoredAt: bigint;
  finalized: boolean;
}

export async function readDataset(ctx: ClientContext, missionId: bigint | number | string): Promise<DatasetView> {
  const id = toMissionId(missionId);
  try {
    const d = await ctx.publicClient.readContract({
      address: ctx.config.registry,
      abi: provenanceRegistryAbi,
      functionName: "getDataset",
      args: [id],
    });
    return { missionId: id, ...d };
  } catch (e) {
    throw toClientError(e);
  }
}

/**
 * Freezes the dataset. `expectedRoot` is the root the buyer REVIEWED (the one shown in the UI), not a fresh read:
 * if the verifier re-anchored in between, this throws ROOT_MISMATCH before the wallet popup (or the contract
 * reverts RootMismatch if the re-anchor lands between the check and the tx), and the UI must reload the dataset.
 */
export async function finalizeDataset(
  ctx: ClientContext,
  input: { missionId: bigint | number | string; expectedRoot: Hex },
): Promise<{ txHash: Hex }> {
  const id = toMissionId(input.missionId);
  const expectedRoot = assertBytes32(input.expectedRoot, "EXPECTED_ROOT");
  const current = await readDataset(ctx, id);
  if (current.finalized) throw new DbforgeClientError("ALREADY_FINALIZED");
  if (current.anchoredAt === BigInt(0)) throw new DbforgeClientError("NOT_ANCHORED");
  if (current.merkleRoot.toLowerCase() !== expectedRoot.toLowerCase()) {
    throw new DbforgeClientError("ROOT_MISMATCH", { reason: "PRECHECK" });
  }
  const { txHash, receipt } = await sendWrite(ctx, {
    address: ctx.config.registry,
    abi: provenanceRegistryAbi,
    functionName: "finalizeDataset",
    args: [id, expectedRoot],
  });
  const ev = parseEventLogs({ abi: provenanceRegistryAbi, eventName: "DatasetFinalized", logs: receipt.logs }).find(
    (l) => isAddressEqual(l.address, ctx.config.registry) && l.args.missionId === id,
  );
  if (!ev) throw new DbforgeClientError("EVENT_NOT_FOUND", { reason: "DatasetFinalized", txHash });
  return { txHash };
}
