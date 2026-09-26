// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Precise decimal-MON <-> wei conversion. NEVER use Number/parseFloat for
// this — MON amounts come from Postgres `numeric(38,18)` (see
// supabase/migrations/0001_init_core_schema.sql), and both the raw decimal
// string and the derived wei amount can exceed what a JS double can
// represent exactly. Everything here is string/bigint only.

export class InvalidRewardAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRewardAmountError";
  }
}

const MON_DECIMALS = 18;

// Non-negative decimal: optional fractional part, at most MON_DECIMALS
// digits (matching numeric(38,18)'s scale — more digits than that could
// not have come from this column honestly). No sign, no exponent, no
// thousands separators.
const DECIMAL_MON_RE = /^(\d+)(?:\.(\d{1,18}))?$/;

/**
 * Converts an exact decimal MON amount (as returned by casting
 * missions.reward_mon::text — see lib/supabase/missions.ts) to wei.
 *
 * Examples:
 *   decimalMonToWei("0.1")   -> 100000000000000000n
 *   decimalMonToWei("1")     -> 1000000000000000000n
 *   decimalMonToWei("0")     -> 0n
 *   decimalMonToWei("-1")    -> throws InvalidRewardAmountError
 *   decimalMonToWei("1e5")   -> throws InvalidRewardAmountError
 *   decimalMonToWei("abc")   -> throws InvalidRewardAmountError
 */
export function decimalMonToWei(value: string): bigint {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidRewardAmountError("Reward amount is missing.");
  }

  const match = DECIMAL_MON_RE.exec(value.trim());
  if (!match) {
    throw new InvalidRewardAmountError(`Malformed decimal MON amount: "${value}".`);
  }

  const [, integerPart, fractionPartRaw] = match;
  const fractionPart = (fractionPartRaw ?? "").padEnd(MON_DECIMALS, "0");

  // Written via BigInt(...) rather than the `10n` literal form — this
  // project's tsconfig targets ES2017, which doesn't support BigInt
  // literal syntax (that needs ES2020+), and bumping the target is a
  // project-wide config change outside this milestone's ownership.
  const scale = BigInt(10) ** BigInt(MON_DECIMALS);
  return BigInt(integerPart) * scale + BigInt(fractionPart);
}

/**
 * Business-rule check on top of decimalMonToWei: a settleable reward must
 * be a strictly positive amount. Parsing "0" successfully is not itself an
 * error (the DB permits reward_mon = 0), but it is never something worth
 * calling the settlement gateway over.
 */
export function assertSettleableWeiAmount(wei: bigint): void {
  if (wei <= BigInt(0)) {
    throw new InvalidRewardAmountError("Reward amount must be greater than zero to settle.");
  }
}

/**
 * Inverse of decimalMonToWei — used when a verified on-chain event (wei)
 * needs to be stored as the decimal string missions.reward_mon expects.
 * String-only arithmetic throughout; never routes through Number.
 *
 *   weiToDecimalMon(100000000000000000n) -> "0.1"
 *   weiToDecimalMon(1000000000000000000n) -> "1"
 *   weiToDecimalMon(0n) -> "0"
 */
export function weiToDecimalMon(wei: bigint): string {
  if (wei < BigInt(0)) {
    throw new InvalidRewardAmountError("Wei amount must not be negative.");
  }

  const scale = BigInt(10) ** BigInt(MON_DECIMALS);
  const integerPart = wei / scale;
  const fractionPart = (wei % scale).toString().padStart(MON_DECIMALS, "0");
  const trimmedFraction = fractionPart.replace(/0+$/, "");

  return trimmedFraction.length > 0 ? `${integerPart}.${trimmedFraction}` : integerPart.toString();
}
