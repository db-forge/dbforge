// Mission creation reads (ARCHITECTURE.md v2 §8): the buyer's wallet calls MissionFactory.createMission, then the
// backend reads the missionId from that tx's MissionCreated event before `POST /api/missions` stores it.

import { keccak256, parseEventLogs, toBytes, type Address, type Hex } from "viem";
import { MonadSettlementError } from "./errors";
import { defaultReader, readAbi, readChain, type MonadReader } from "./reader";

function invalid(reason: string, detail: string): MonadSettlementError {
  return new MonadSettlementError("INVALID_INPUT", { reason, detail });
}

/** JSON with object keys sorted at every level; arrays keep their order. Only plain JSON values are allowed. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalid("INVALID_METADATA", "Numbers must be finite.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  throw invalid("INVALID_METADATA", `Unsupported value of type ${typeof value}.`);
}

/**
 * bytes32 for `createMission(metadataHash, …)` and the `missions.metadata_hash` column:
 * keccak256 of the UTF-8 sorted-key JSON, e.g. `metadataHash({ title, description, requirements })`.
 * The same object always gives the same hash, whatever its key order. Keys with `undefined` are rejected,
 * not dropped, so a missing field cannot silently change the hash.
 */
export function metadataHash(obj: Record<string, unknown>): Hex {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw invalid("INVALID_METADATA", "metadataHash expects a plain object.");
  }
  return keccak256(toBytes(canonicalJson(obj)));
}

export interface MissionCreatedView {
  /** uint256 as a decimal string → `missions.chain_mission_id`. */
  missionId: string;
  buyer: Address;
  /** wei string */
  rewardPerSubmission: string;
  targetCount: string;
  metadataHash: Hex;
  txHash: Hex;
  blockNumber: string;
}

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Reads the `MissionCreated` event of a createMission tx. Returns null while the tx has no receipt yet (call again).
 * Only a log emitted by OUR Factory counts: a tx that emits a look-alike event from another contract is rejected.
 * The caller still compares `buyer` and `metadataHash` with what the user submitted.
 */
export async function readMissionCreated(
  input: { txHash: unknown },
  reader: MonadReader = defaultReader(),
): Promise<MissionCreatedView | null> {
  if (typeof input?.txHash !== "string" || !TX_HASH_RE.test(input.txHash)) {
    throw invalid("INVALID_TX_HASH", "txHash must be 0x followed by 64 hex characters.");
  }
  const txHash = input.txHash.toLowerCase() as Hex;
  const factory = reader.factory;
  if (!factory) {
    throw invalid("READER_NOT_CONFIGURED", "MONAD_FACTORY_ADDRESS is not set.");
  }

  const receipt = await readChain(async () => {
    try {
      return await reader.client.getTransactionReceipt({ hash: txHash });
    } catch (e) {
      if (e instanceof Error && e.name === "TransactionReceiptNotFoundError") return null;
      throw e;
    }
  });
  if (receipt === null) return null;
  if (receipt.status !== "success") {
    throw new MonadSettlementError("TX_REVERTED", { reason: "REVERTED_ON_CHAIN", txHash });
  }

  const events = parseEventLogs({
    abi: readAbi,
    eventName: "MissionCreated",
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === factory.toLowerCase()),
  });
  if (events.length !== 1) {
    throw invalid("NO_MISSION_CREATED_EVENT", `Expected one MissionCreated from the Factory, found ${events.length}.`);
  }
  const { args } = events[0];
  return {
    missionId: args.missionId.toString(),
    buyer: args.buyer,
    rewardPerSubmission: args.rewardPerSubmission.toString(),
    targetCount: args.targetCount.toString(),
    metadataHash: args.metadataHash,
    txHash,
    blockNumber: receipt.blockNumber.toString(),
  };
}
