// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/contributors/[address]/withdraw — integration correction.
// The verifier (our backend) pays gas for withdrawForContributor, so this
// must never be trivially spammable: balance is checked first (free read;
// a zero balance exits before any rate-limit budget or gas is spent), then
// a DB-backed cooldown is enforced per contributor address (and per IP,
// when derivable) before the one paid, fund-moving call. The gateway
// interface takes only contributorAddress — there is no recipient
// parameter anywhere in this file, so a caller can never redirect funds.

import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import { EVM_ADDRESS_RE } from "@/app/api/_lib/validation";
import { enforceRateLimit } from "@/lib/supabase/rateLimit";
import { getWithdrawalGateway } from "@/lib/verification/withdrawal/gateway";

const CONTRIBUTOR_WINDOW_SECONDS = 60;
const CONTRIBUTOR_MAX_ATTEMPTS = 3;
const IP_WINDOW_SECONDS = 60;
const IP_MAX_ATTEMPTS = 10;

interface RouteParams {
  params: Promise<{ address: string }>;
}

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const fromForwarded = forwarded?.split(",")[0]?.trim();
  if (fromForwarded) return fromForwarded;

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
}

export async function POST(request: Request, { params }: RouteParams) {
  return withApiErrorHandling(async () => {
    const { address } = await params;
    if (!EVM_ADDRESS_RE.test(address)) {
      throw ApiError.validation("address must be a valid 0x-prefixed EVM address.", {
        field: "address",
      });
    }
    const contributorAddress = address.toLowerCase();

    const gateway = getWithdrawalGateway();

    // 1. Free read first — a zero balance exits before spending any
    // rate-limit budget or gas.
    const { withdrawableWei } = await gateway.getContributorBalance({ contributorAddress });
    if (BigInt(withdrawableWei) <= BigInt(0)) {
      return NextResponse.json({
        contributorAddress,
        withdrawableWei: "0",
        status: "nothing_to_withdraw",
      });
    }

    // 2. Cooldown — this is what actually protects the verifier's gas
    // spend on the broadcast below.
    await enforceRateLimit(
      `contributor:${contributorAddress}`,
      CONTRIBUTOR_WINDOW_SECONDS,
      CONTRIBUTOR_MAX_ATTEMPTS,
    );

    const ip = getClientIp(request);
    if (ip) {
      await enforceRateLimit(`ip:${ip}`, IP_WINDOW_SECONDS, IP_MAX_ATTEMPTS);
    }

    // 3. Only now broadcast — always to the contributor themselves.
    const { txHash } = await gateway.withdrawForContributor({ contributorAddress });

    return NextResponse.json({ contributorAddress, txHash, status: "withdrawn" });
  });
}
