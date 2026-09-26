// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Mission-creation event verification boundary. The buyer creates the
// mission ON-CHAIN from their own wallet (funds are locked there) — the
// backend's job is only to VERIFY that receipt/event and mirror the
// verified fields into our DB, never to trust client-supplied mission
// fields.
//
// Wired to the real lib/monad.readMissionCreated (see lib/monad/mission.ts
// and lib/monad/README.md's "Mission create flow"). Import path/shape
// confirmed from the actual code on origin/feat/contracts at integration
// time, not assumed.

import { readMissionCreated as monadReadMissionCreated } from "@/lib/monad";
import { isMonadSettlementError } from "@/lib/monad";

export interface MissionCreatedEvent {
  chainMissionId: string;
  buyerAddress: string;
  rewardWei: string;
  targetCount: number;
  /** keccak256 of the buyer's off-chain metadata (title/description/etc). Not yet cross-checked here — see README caveat below. */
  metadataHash: string;
  txHash: string;
  blockNumber: string;
}

export type MissionEventReaderErrorKind = "unavailable" | "not_found" | "invalid" | "unknown";

export class MissionEventReaderError extends Error {
  constructor(
    message: string,
    readonly kind: MissionEventReaderErrorKind,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MissionEventReaderError";
  }
}

export interface MissionEventReader {
  /** Returns null when the tx has no receipt yet (caller should ask the client to retry — see 202 PENDING in the route). */
  readMissionCreated(input: { txHash: string }): Promise<MissionCreatedEvent | null>;
}

let testOverride: MissionEventReader | null = null;

/** Test-only injection point — see lib/verification/settlement/gateway.ts's identical pattern/caveats. */
export function __setMissionEventReaderForTests(reader: MissionEventReader | null): void {
  testOverride = reader;
}

const realReader: MissionEventReader = {
  async readMissionCreated({ txHash }) {
    let event;
    try {
      event = await monadReadMissionCreated({ txHash });
    } catch (error) {
      if (isMonadSettlementError(error)) {
        if (error.code === "RPC_ERROR") {
          throw new MissionEventReaderError(error.message, "unavailable", error);
        }
        // INVALID_INPUT (bad hash / no MissionCreated event on our Factory) or TX_REVERTED.
        throw new MissionEventReaderError(error.message, "invalid", error);
      }
      throw new MissionEventReaderError("Unexpected error reading the mission-creation event.", "unknown", error);
    }

    if (event === null) return null;

    const targetCount = Number(event.targetCount);
    if (!Number.isSafeInteger(targetCount) || targetCount <= 0) {
      throw new MissionEventReaderError(
        `On-chain targetCount "${event.targetCount}" is not a usable positive integer.`,
        "invalid",
      );
    }

    return {
      chainMissionId: event.missionId,
      buyerAddress: event.buyer,
      rewardWei: event.rewardPerSubmission,
      targetCount,
      metadataHash: event.metadataHash,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
    };
  },
};

export function getMissionEventReader(): MissionEventReader {
  return testOverride ?? realReader;
}
