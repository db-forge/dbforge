import { getAddress, isAddress, type Address, type Hex } from "viem";
import { MonadSettlementError } from "./errors";

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const UINT_RE = /^[0-9]{1,78}$/;
const UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

function invalid(detail: string): MonadSettlementError {
  return new MonadSettlementError("INVALID_INPUT", { detail });
}

/**
 * Accepts an EIP-55 checksummed address, or an all-lowercase / all-uppercase one (no checksum to verify).
 * A mixed-case address with a wrong checksum is rejected. Returns the checksummed form.
 */
export function parseAddress(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw invalid(`${field} must be a 0x-prefixed 20-byte address.`);
  }
  const body = value.slice(2);
  const singleCase = body === body.toLowerCase() || body === body.toUpperCase();
  if (!singleCase && !isAddress(value, { strict: true })) {
    throw invalid(`${field} has an invalid EIP-55 checksum.`);
  }
  const checksummed = getAddress(value);
  if (checksummed === "0x0000000000000000000000000000000000000000") {
    throw invalid(`${field} must not be the zero address.`);
  }
  return checksummed;
}

/** `0x` + 64 hex (the backend prefixes its SHA-256). Returned lowercase. TODO(F6): salted commitment later. */
export function parseSubmissionHash(value: unknown): Hex {
  if (typeof value !== "string" || !HASH_RE.test(value)) {
    throw invalid("submissionHash must be 0x followed by 64 hex characters.");
  }
  const hash = value.toLowerCase() as Hex;
  if (/^0x0{64}$/.test(hash)) throw invalid("submissionHash must not be zero.");
  return hash;
}

/** Supabase `chain_mission_id` (bigint) → uint256. Accepts a decimal string, a safe integer or a bigint. */
export function parseMissionId(value: unknown): bigint {
  let id: bigint;
  if (typeof value === "bigint") id = value;
  else if (typeof value === "number" && Number.isSafeInteger(value)) id = BigInt(value);
  else if (typeof value === "string" && UINT_RE.test(value)) id = BigInt(value);
  else throw invalid("chainMissionId must be a positive integer (decimal string, safe integer or bigint).");
  if (id <= BigInt(0) || id > UINT256_MAX) throw invalid("chainMissionId must be between 1 and 2^256-1.");
  return id;
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw invalid("Expected an object argument.");
  return value as Record<string, unknown>;
}
