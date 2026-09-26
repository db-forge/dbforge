// Typed errors of the settlement adapter. Messages are fixed strings: never a key, a raw RPC body or a stack.

export type MonadErrorCode =
  | "INVALID_INPUT"
  | "MISSION_NOT_FOUND"
  | "CONTRACT_PAUSED"
  | "INSUFFICIENT_FUNDS"
  | "TX_REVERTED"
  | "TX_TIMEOUT"
  | "RPC_ERROR";

const MESSAGES: Record<MonadErrorCode, string> = {
  INVALID_INPUT: "Invalid input.",
  MISSION_NOT_FOUND: "Mission does not exist on chain.",
  CONTRACT_PAUSED: "Settlement is paused on chain.",
  INSUFFICIENT_FUNDS: "The verifier wallet cannot pay the gas for this transaction.",
  TX_REVERTED: "The transaction reverted or would revert.",
  TX_TIMEOUT: "The transaction was sent but no receipt arrived in time. Call again to keep waiting.",
  RPC_ERROR: "The Monad RPC request failed.",
};

export interface MonadErrorDetails {
  /** Short machine-readable cause, e.g. a contract error name ("MissionNotActive") or "GAS_CAP_EXCEEDED". */
  reason?: string;
  /** Set when a transaction exists for this call (TX_TIMEOUT, TX_REVERTED). */
  txHash?: string;
  /** Extra human-readable context without secrets. */
  detail?: string;
}

export class MonadSettlementError extends Error {
  readonly code: MonadErrorCode;
  readonly reason: string | undefined;
  readonly txHash: string | undefined;

  constructor(code: MonadErrorCode, details: MonadErrorDetails = {}) {
    super(details.detail ? `${MESSAGES[code]} ${details.detail}` : MESSAGES[code]);
    this.name = "MonadSettlementError";
    this.code = code;
    this.reason = details.reason;
    this.txHash = details.txHash;
  }

  /** Safe to log or to return from an API route. */
  toJSON(): { code: MonadErrorCode; message: string; reason?: string; txHash?: string } {
    return {
      code: this.code,
      message: this.message,
      ...(this.reason ? { reason: this.reason } : {}),
      ...(this.txHash ? { txHash: this.txHash } : {}),
    };
  }
}

export function isMonadSettlementError(e: unknown): e is MonadSettlementError {
  return e instanceof MonadSettlementError;
}
