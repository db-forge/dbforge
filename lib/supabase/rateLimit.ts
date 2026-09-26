// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Generic DB-backed rate limiting, wrapping the
// check_and_increment_rate_limit RPC (migration 0010). Reusable for any
// per-key cooldown — currently only the withdrawal endpoint.

import { getSupabaseServiceClient } from "./client";

export class RateLimitedError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "RateLimitedError";
  }
}

/**
 * Throws RateLimitedError if `key` has exceeded `maxAttempts` within the
 * last `windowSeconds`; otherwise records this attempt and returns.
 */
export async function enforceRateLimit(
  key: string,
  windowSeconds: number,
  maxAttempts: number,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("check_and_increment_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max_attempts: maxAttempts,
  });

  if (error) {
    throw new Error(`Failed to check rate limit for ${key}: ${error.message}`);
  }

  const result = data as { allowed: boolean; attempt_count: number; retry_after_seconds: number };
  if (!result.allowed) {
    throw new RateLimitedError(
      `Rate limit exceeded for this request; try again in ${result.retry_after_seconds}s.`,
      result.retry_after_seconds,
    );
  }
}
