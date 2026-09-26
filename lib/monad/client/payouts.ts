// Contributor side (pull payments): read the balance triple, withdraw. Settlement itself is server-side (lib/monad).

import { getAddress, isAddress, isAddressEqual, parseEventLogs, type Address, type Hex } from "viem";
import { missionVaultAbi } from "./abi";
import { DbforgeClientError, toClientError } from "./errors";
import { sendWrite, type ClientContext } from "./tx";

export interface ContributorBalance {
  credited: bigint;
  withdrawn: bigint;
  withdrawable: bigint;
}

function toContributor(ctx: ClientContext, value: string): Address {
  if (!isAddress(value, { strict: false })) throw new DbforgeClientError("INVALID_INPUT", { reason: "CONTRIBUTOR" });
  const a = getAddress(value);
  if (/^0x0{40}$/.test(a) || isAddressEqual(a, ctx.config.vault)) {
    throw new DbforgeClientError("INVALID_INPUT", { reason: "CONTRIBUTOR" });
  }
  return a;
}

export async function readContributorBalance(ctx: ClientContext, contributor: string): Promise<ContributorBalance> {
  const address = toContributor(ctx, contributor);
  try {
    const [credited, withdrawn, withdrawable] = await ctx.publicClient.readContract({
      address: ctx.config.vault,
      abi: missionVaultAbi,
      functionName: "getContributorBalance",
      args: [address],
    });
    return { credited, withdrawn, withdrawable };
  } catch (e) {
    throw toClientError(e);
  }
}

function withdrawnAmount(ctx: ClientContext, logs: Parameters<typeof parseEventLogs>[0]["logs"], contributor: Address, txHash: Hex): bigint {
  const ev = parseEventLogs({ abi: missionVaultAbi, eventName: "Withdrawn", logs }).find(
    (l) => isAddressEqual(l.address, ctx.config.vault) && isAddressEqual(l.args.contributor, contributor),
  );
  if (!ev) throw new DbforgeClientError("EVENT_NOT_FOUND", { reason: "Withdrawn", txHash });
  return ev.args.amount;
}

/** The connected wallet withdraws its own credit (value 0: the 10 MON reserve rule does not apply). */
export async function withdraw(ctx: ClientContext): Promise<{ txHash: Hex; amount: bigint }> {
  const { txHash, receipt } = await sendWrite(ctx, {
    address: ctx.config.vault,
    abi: missionVaultAbi,
    functionName: "withdraw",
    args: [],
  });
  const account = ctx.walletClient!.account!.address;
  return { txHash, amount: withdrawnAmount(ctx, receipt.logs, account, txHash) };
}

/**
 * The connected wallet pays the gas; the MON goes ONLY to `contributor`. For a contributor wallet with 0 MON.
 * The Vault forwards a 50k gas stipend, so a contract wallet with a heavy receive() must use `withdraw()` itself.
 */
export async function withdrawFor(ctx: ClientContext, contributor: string): Promise<{ txHash: Hex; amount: bigint }> {
  const to = toContributor(ctx, contributor);
  const { txHash, receipt } = await sendWrite(ctx, {
    address: ctx.config.vault,
    abi: missionVaultAbi,
    functionName: "withdrawFor",
    args: [to],
  });
  return { txHash, amount: withdrawnAmount(ctx, receipt.logs, to, txHash) };
}
