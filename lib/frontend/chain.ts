// Mock contract calls for the UI. Will be replaced by real helpers from
// lib/monad once the escrow contract is deployed. Hashes are fake 0x values.
import { t } from "./i18n";
import { randomHex, sleep } from "./utils";

export type TxStage = "idle" | "awaiting_signature" | "pending" | "success" | "error";

export interface TxState {
  stage: TxStage;
  hash?: string;
  error?: string;
}

type OnStage = (state: TxState) => void;

async function simulateTx(onStage: OnStage, shouldFail: boolean, failMessage: string) {
  onStage({ stage: "awaiting_signature" });
  await sleep(1400);
  if (shouldFail) {
    const state: TxState = { stage: "error", error: failMessage };
    onStage(state);
    return state;
  }
  const hash = randomHex(32);
  onStage({ stage: "pending", hash });
  await sleep(2000);
  const state: TxState = { stage: "success", hash };
  onStage(state);
  return state;
}

/** Locks rewardMon × targetCount MON into the mission escrow. */
export function createMissionTx(
  params: { title: string; rewardMon: number; targetCount: number },
  onStage: OnStage,
) {
  // Demo hook: a title containing "fail" simulates a rejected transaction.
  return simulateTx(
    onStage,
    params.title.toLowerCase().includes("fail"),
    t().tx.signerRejected,
  );
}

/** Buyer tops up an existing mission's escrow. */
export function fundMissionTx(params: { missionId: string; amountMon: number }, onStage: OnStage) {
  void params;
  return simulateTx(onStage, false, "");
}

/** Buyer cancels a mission and withdraws the unspent budget. */
export function cancelMissionTx(params: { missionId: string }, onStage: OnStage) {
  void params;
  return simulateTx(onStage, false, "");
}
