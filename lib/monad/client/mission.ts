// Buyer side: create (fund) a mission, read it, cancel it.

import { isAddressEqual, parseEther, parseEventLogs, type Address, type Hex, type Log } from "viem";
import { missionFactoryAbi, missionVaultAbi } from "./abi";
import { DbforgeClientError, toClientError } from "./errors";
import { prepareWrite, sendWrite, type ClientContext, type PreparedWrite } from "./tx";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ZERO32 = `0x${"0".repeat(64)}`;
const MON_INPUT = /^\d+(\.\d{1,18})?$/;
/** UI guard, not a contract rule: keeps value = reward × target in a sane range. */
export const MAX_TARGET_COUNT = 100_000;

export const MISSION_STATUS = ["None", "Active", "Completed", "Cancelled"] as const;
export type MissionStatus = (typeof MISSION_STATUS)[number];

/** "0.5" → 500000000000000000n. Rejects empty, negative, zero, more than 18 decimals. */
export function parseMonAmount(input: string): bigint {
  const s = input.trim();
  if (!MON_INPUT.test(s)) throw new DbforgeClientError("INVALID_INPUT", { reason: "MON_AMOUNT" });
  const wei = parseEther(s);
  if (wei === BigInt(0)) throw new DbforgeClientError("INVALID_INPUT", { reason: "MON_AMOUNT" });
  return wei;
}

export function assertBytes32(value: string, reason: string): Hex {
  if (!BYTES32.test(value) || value.toLowerCase() === ZERO32) throw new DbforgeClientError("INVALID_INPUT", { reason });
  return value as Hex;
}

export function toMissionId(id: bigint | number | string): bigint {
  let v: bigint | undefined;
  if (typeof id === "bigint") v = id;
  else if (typeof id === "number") v = Number.isSafeInteger(id) ? BigInt(id) : undefined;
  else if (/^\d+$/.test(id)) v = BigInt(id);
  if (v === undefined || v <= BigInt(0)) throw new DbforgeClientError("INVALID_INPUT", { reason: "MISSION_ID" });
  return v;
}

export interface CreateMissionInput {
  /** bytes32 from the shared `metadataHash()` of lib/monad (keccak256 of the sorted-key mission JSON). */
  metadataHash: Hex;
  /** wei. Use `parseMonAmount("0.5")` for form input. */
  rewardPerSubmission: bigint;
  targetCount: number;
}

function createRequest(ctx: ClientContext, input: CreateMissionInput) {
  const metadataHash = assertBytes32(input.metadataHash, "METADATA_HASH");
  if (input.rewardPerSubmission <= BigInt(0)) throw new DbforgeClientError("INVALID_INPUT", { reason: "REWARD" });
  if (!Number.isSafeInteger(input.targetCount) || input.targetCount <= 0 || input.targetCount > MAX_TARGET_COUNT) {
    throw new DbforgeClientError("INVALID_INPUT", { reason: "TARGET_COUNT" });
  }
  const target = BigInt(input.targetCount);
  return {
    address: ctx.config.factory,
    abi: missionFactoryAbi,
    functionName: "createMission" as const,
    args: [metadataHash, input.rewardPerSubmission, target] as const,
    value: input.rewardPerSubmission * target,
  };
}

/** Dry run for the form: simulation + gas + reserve check, no wallet popup. `reserve` drives the warning. */
export async function prepareCreateMission(ctx: ClientContext, input: CreateMissionInput): Promise<PreparedWrite & { value: bigint }> {
  const req = createRequest(ctx, input);
  return { ...(await prepareWrite(ctx, req)), value: req.value };
}

export interface MissionCreated {
  missionId: bigint;
  buyer: Address;
  rewardPerSubmission: bigint;
  targetCount: bigint;
  metadataHash: Hex;
}

/** Reads the single MissionCreated log that `factory` emitted in these receipt logs. */
export function parseMissionCreated(logs: readonly Log[], factory: Address): MissionCreated {
  const events = parseEventLogs({ abi: missionFactoryAbi, eventName: "MissionCreated", logs: [...logs] }).filter((l) =>
    isAddressEqual(l.address, factory),
  );
  if (events.length !== 1) throw new DbforgeClientError("EVENT_NOT_FOUND", { reason: `MissionCreated×${events.length}` });
  const { missionId, buyer, rewardPerSubmission, targetCount, metadataHash } = events[0].args;
  return { missionId, buyer, rewardPerSubmission, targetCount, metadataHash };
}

/**
 * Funds a mission (value = reward × target) and returns its on-chain id from the MissionCreated event.
 * Order (ARCHITECTURE §8): chain first → then POST /api/missions with `missionId` and `txHash`.
 */
export async function createMission(ctx: ClientContext, input: CreateMissionInput): Promise<MissionCreated & { txHash: Hex }> {
  const { txHash, receipt } = await sendWrite(ctx, createRequest(ctx, input));
  try {
    return { ...parseMissionCreated(receipt.logs, ctx.config.factory), txHash };
  } catch (e) {
    const err = toClientError(e);
    throw new DbforgeClientError(err.code, { reason: err.reason, txHash });
  }
}

export interface MissionView {
  missionId: bigint;
  buyer: Address;
  rewardPerSubmission: bigint;
  targetCount: bigint;
  acceptedCount: bigint;
  remainingBudget: bigint;
  metadataHash: Hex;
  status: MissionStatus;
}

export async function readMission(ctx: ClientContext, missionId: bigint | number | string): Promise<MissionView> {
  const id = toMissionId(missionId);
  try {
    const m = await ctx.publicClient.readContract({
      address: ctx.config.vault,
      abi: missionVaultAbi,
      functionName: "getMission",
      args: [id],
    });
    return { missionId: id, ...m, status: MISSION_STATUS[m.status] ?? "None" };
  } catch (e) {
    throw toClientError(e);
  }
}

/** Buyer only, while Active. Refunds the remaining budget. Works while the Vault is paused. */
export async function cancelMission(ctx: ClientContext, missionId: bigint | number | string): Promise<{ txHash: Hex; refunded: bigint }> {
  const id = toMissionId(missionId);
  const { txHash, receipt } = await sendWrite(ctx, {
    address: ctx.config.vault,
    abi: missionVaultAbi,
    functionName: "cancelMission",
    args: [id],
  });
  const ev = parseEventLogs({ abi: missionVaultAbi, eventName: "MissionCancelled", logs: receipt.logs }).find(
    (l) => isAddressEqual(l.address, ctx.config.vault) && l.args.missionId === id,
  );
  if (!ev) throw new DbforgeClientError("EVENT_NOT_FOUND", { reason: "MissionCancelled", txHash });
  return { txHash, refunded: ev.args.refunded };
}
