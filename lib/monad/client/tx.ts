// One write path for every browser tx: wallet + network check → simulate → estimate × 1.15 under a hard cap →
// fee + balance (and Monad reserve) check → send with an explicit gas limit → wait for the receipt.
// On Monad the whole gas LIMIT is charged, also for reverts, so nothing is sent that the simulation rejects,
// and a revert is never retried automatically.

import type { Abi, Address, Hex, PublicClient, TransactionReceipt, WalletClient } from "viem";
import { parseEther } from "viem";
import type { DbforgeClientConfig } from "./config";
import { DbforgeClientError, toClientError } from "./errors";

/** Monad: an EOA tx with value > 0 reverts if it leaves the sender below 10 MON (it still pays gas). */
export const MONAD_RESERVE_BALANCE = parseEther("10");

/** Upper bounds from the G3b gas report (worst case + ~30%). An estimate above the cap is not sent. */
export const CLIENT_GAS_CAP = {
  createMission: BigInt(240_000),
  cancelMission: BigInt(90_000),
  withdraw: BigInt(110_000),
  withdrawFor: BigInt(160_000),
  finalizeDataset: BigInt(90_000),
} as const;

export type CappedFunction = keyof typeof CLIENT_GAS_CAP;

const GAS_MARGIN_NUM = BigInt(115);
const GAS_MARGIN_DEN = BigInt(100);
const DEFAULT_RECEIPT_TIMEOUT_MS = 60_000;

export interface ClientContext {
  publicClient: PublicClient;
  /** Needed for writes only. With wagmi: `useWalletClient().data`. */
  walletClient?: WalletClient;
  config: DbforgeClientConfig;
  receiptTimeoutMs?: number;
}

export interface ReserveCheck {
  ok: boolean;
  balance: bigint;
  /** value + gas × maxFeePerGas (+ 10 MON reserve when value > 0). */
  required: bigint;
  shortfall: bigint;
  /** true when the balance covers value + gas but not the 10 MON reserve. */
  reserveOnly: boolean;
}

/** Pure check, usable before the wallet popup to show "you need N more MON". */
export function checkReserveBalance(p: { balance: bigint; value: bigint; gas: bigint; maxFeePerGas: bigint }): ReserveCheck {
  const spend = p.value + p.gas * p.maxFeePerGas;
  const required = spend + (p.value > BigInt(0) ? MONAD_RESERVE_BALANCE : BigInt(0));
  const shortfall = p.balance >= required ? BigInt(0) : required - p.balance;
  return { ok: shortfall === BigInt(0), balance: p.balance, required, shortfall, reserveOnly: shortfall > BigInt(0) && p.balance >= spend };
}

export interface WriteRequest {
  address: Address;
  abi: Abi;
  functionName: CappedFunction;
  args: readonly unknown[];
  value?: bigint;
}

export interface PreparedWrite {
  account: Address;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  reserve: ReserveCheck;
}

export function requireWallet(ctx: ClientContext): { walletClient: WalletClient; account: Address } {
  const walletClient = ctx.walletClient;
  const account = walletClient?.account?.address;
  if (!walletClient || !account) throw new DbforgeClientError("WALLET_NOT_CONNECTED");
  return { walletClient, account };
}

/** Everything before the wallet popup. Throws a DbforgeClientError; sends nothing. */
export async function prepareWrite(ctx: ClientContext, req: WriteRequest): Promise<PreparedWrite> {
  const { walletClient, account } = requireWallet(ctx);
  const value = req.value ?? BigInt(0);
  try {
    const walletChain = await walletClient.getChainId();
    if (walletChain !== ctx.config.chainId) throw new DbforgeClientError("WRONG_NETWORK", { reason: String(walletChain) });
    const call = { account, address: req.address, abi: req.abi, functionName: req.functionName, args: req.args, value } as never;
    await ctx.publicClient.simulateContract(call);
    const estimate = await ctx.publicClient.estimateContractGas(call);
    const cap = CLIENT_GAS_CAP[req.functionName];
    if (estimate > cap) throw new DbforgeClientError("GAS_CAP_EXCEEDED", { reason: req.functionName });
    const withMargin = (estimate * GAS_MARGIN_NUM) / GAS_MARGIN_DEN;
    const gas = withMargin > cap ? cap : withMargin;
    const fees = await ctx.publicClient.estimateFeesPerGas();
    const balance = await ctx.publicClient.getBalance({ address: account });
    const reserve = checkReserveBalance({ balance, value, gas, maxFeePerGas: fees.maxFeePerGas });
    if (!reserve.ok) {
      throw new DbforgeClientError(reserve.reserveOnly ? "RESERVE_BALANCE" : "INSUFFICIENT_FUNDS", {
        reason: `shortfall=${reserve.shortfall}`,
      });
    }
    return { account, gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, reserve };
  } catch (e) {
    throw toClientError(e);
  }
}

export interface WriteResult {
  txHash: Hex;
  receipt: TransactionReceipt;
}

/** prepareWrite → wallet signs and sends → successful receipt. */
export async function sendWrite(ctx: ClientContext, req: WriteRequest): Promise<WriteResult> {
  const prepared = await prepareWrite(ctx, req);
  const { walletClient } = requireWallet(ctx);
  let txHash: Hex;
  try {
    txHash = await walletClient.writeContract({
      account: walletClient.account!,
      chain: walletClient.chain ?? null,
      address: req.address,
      abi: req.abi,
      functionName: req.functionName,
      args: req.args,
      value: req.value,
      gas: prepared.gas,
      maxFeePerGas: prepared.maxFeePerGas,
      maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
    } as never);
  } catch (e) {
    throw toClientError(e);
  }
  let receipt: TransactionReceipt;
  try {
    receipt = await ctx.publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: ctx.receiptTimeoutMs ?? DEFAULT_RECEIPT_TIMEOUT_MS,
    });
  } catch (e) {
    const err = toClientError(e);
    throw new DbforgeClientError(err.reason === "WaitForTransactionReceiptTimeoutError" ? "TX_TIMEOUT" : err.code, {
      reason: err.reason,
      txHash,
    });
  }
  if (receipt.status !== "success") throw new DbforgeClientError("TX_REVERTED", { reason: "REVERTED_ON_CHAIN", txHash });
  return { txHash, receipt };
}
