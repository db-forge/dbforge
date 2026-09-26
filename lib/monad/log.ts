// Structured log events of the adapter. Fields are an allowlist: no key, no raw tx, no RPC body.

export interface SettlementLogEvent {
  event:
    | "settle.ok"
    | "settle.error"
    | "settle.already_settled"
    | "tx.broadcast"
    | "tx.rebroadcast"
    | "tx.replaced"
    | "tx.retry"
    | "tx.hole_rebroadcast"
    | "tx.hole_filled"
    | "withdraw.ok"
    | "withdraw.error"
    | "anchor.ok"
    | "anchor.error"
    | "anchor.already_anchored";
  chainMissionId?: string;
  submissionHash?: string;
  merkleRoot?: string;
  contributor?: string;
  txHash?: string;
  nonce?: number;
  status?: string;
  code?: string;
  reason?: string;
  durationMs?: number;
  retry?: boolean;
  idempotent?: boolean;
}

export type SettlementLogger = (event: SettlementLogEvent) => void;

/** Default: one JSON line per event on stdout (picked up by the hosting platform's log drain). */
export const jsonConsoleLogger: SettlementLogger = (event) => {
  console.info(JSON.stringify({ scope: "lib/monad", ts: new Date().toISOString(), ...event }));
};

export const silentLogger: SettlementLogger = () => {};
