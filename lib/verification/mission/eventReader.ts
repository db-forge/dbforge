// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Mission-creation event verification boundary. The buyer creates the
// mission ON-CHAIN from their own wallet (funds are locked there) — the
// backend's job is only to VERIFY that receipt/event and mirror the
// verified fields into our DB, never to trust client-supplied mission
// fields. lib/monad does not exist yet, so nothing here imports it; wire
// in the real adapter later with a plain static import:
//
//   import { readMissionCreated } from "@/lib/monad/mission";
//   export function getMissionEventReader(): MissionEventReader {
//     return { readMissionCreated };
//   }
//
// Until then this always throws a typed "unavailable" error — POST
// /api/missions turns that into 503 MISSION_EVENT_READER_UNAVAILABLE. No
// fake verification, no inventing chain_mission_id/reward/buyer/target.

export interface MissionCreatedEvent {
  chainMissionId: string;
  buyerAddress: string;
  rewardWei: string;
  targetCount: number;
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
  readMissionCreated(input: { txHash: string }): Promise<MissionCreatedEvent>;
}

let testOverride: MissionEventReader | null = null;

/** Test-only injection point — see lib/verification/settlement/gateway.ts's identical pattern/caveats. */
export function __setMissionEventReaderForTests(reader: MissionEventReader | null): void {
  testOverride = reader;
}

export function getMissionEventReader(): MissionEventReader {
  if (testOverride) return testOverride;

  throw new MissionEventReaderError(
    "No mission event reader is configured yet — the Monad adapter (lib/monad) has not been wired in.",
    "unavailable",
  );
}
