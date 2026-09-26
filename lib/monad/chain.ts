// The ONE internal layer that talks to the MissionVault: reads, simulate + estimate + cap, signing, broadcast,
// receipts, logs. Nothing outside lib/monad sees the ABI, the address, the chain config or the key.

import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  TimeoutError,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  createPublicClient,
  defineChain,
  encodeFunctionData,
  http,
  keccak256,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GAS_CAP, missionVaultAbi } from "./abi";
import type { MonadAdapterConfig } from "./config";
import { MonadSettlementError } from "./errors";

export type VaultCall =
  | { functionName: "approveSubmission"; args: readonly [bigint, Address, Hex] }
  | { functionName: "withdrawFor"; args: readonly [Address] };

export interface PreparedTx {
  call: VaultCall;
  data: Hex;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface ReceiptInfo {
  status: "success" | "reverted";
  blockNumber: bigint;
  logs: readonly Log[];
}

export interface OnChainSettlement {
  settled: boolean;
  contributor: Address;
  amount: bigint;
}

export interface BalanceTriple {
  credited: bigint;
  withdrawn: bigint;
  withdrawable: bigint;
}

export interface WithdrawnLog {
  txHash: Hex;
  blockNumber: bigint;
  amount: bigint;
}

export type BroadcastErrorKind = "nonce_too_low" | "already_known" | "insufficient_funds" | "rejected" | "ambiguous";

/** Thrown by `broadcast`. `ambiguous` = the node may or may not have the tx (network error / timeout). */
export class BroadcastError extends Error {
  readonly kind: BroadcastErrorKind;
  constructor(kind: BroadcastErrorKind) {
    super(`broadcast failed: ${kind}`);
    this.name = "BroadcastError";
    this.kind = kind;
  }
}

export interface VaultChain {
  readonly vault: Address;
  readonly signer: Address;
  isPaused(): Promise<boolean>;
  getMissionStatus(missionId: bigint): Promise<number>;
  getSettlement(missionId: bigint, submissionHash: Hex): Promise<OnChainSettlement>;
  findSettledTx(missionId: bigint, submissionHash: Hex): Promise<Hex | null>;
  getContributorBalance(contributor: Address): Promise<BalanceTriple>;
  listWithdrawn(contributor: Address, fromBlock: bigint): Promise<WithdrawnLog[]>;
  /** eth_call simulate → estimate × 1.15 → hard cap → fee + balance check. Throws MonadSettlementError. */
  prepare(call: VaultCall): Promise<PreparedTx>;
  sign(tx: PreparedTx, nonce: number): Promise<{ hash: Hex; raw: Hex }>;
  /** 0-value self-transfer (21k gas) that only fills a nonce hole nobody else will fill. */
  signFiller(nonce: number): Promise<{ hash: Hex; raw: Hex }>;
  broadcast(raw: Hex): Promise<void>;
  getNonce(address: string, blockTag: "pending" | "latest"): Promise<number>;
  getReceipt(hash: Hex): Promise<ReceiptInfo | null>;
  isKnown(hash: Hex): Promise<boolean>;
  getBlockNumber(): Promise<bigint>;
}

const GAS_MARGIN_NUM = BigInt(115);
const GAS_MARGIN_DEN = BigInt(100);

/** Maps a viem error to a typed adapter error. Never copies the raw RPC message. */
export function mapChainError(e: unknown): MonadSettlementError {
  if (e instanceof MonadSettlementError) return e;
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? "UnknownRevert";
      if (name === "EnforcedPause") return new MonadSettlementError("CONTRACT_PAUSED", { reason: name });
      // Input the contract rejects (G4 L-1: contributor == Vault → InvalidContributor).
      if (name === "InvalidContributor" || name === "ZeroAddress" || name === "InvalidSubmission") {
        return new MonadSettlementError("INVALID_INPUT", { reason: name });
      }
      if (name === "AccessControlUnauthorizedAccount") {
        return new MonadSettlementError("TX_REVERTED", { reason: "VERIFIER_ROLE_MISSING" });
      }
      return new MonadSettlementError("TX_REVERTED", { reason: name });
    }
    if (e.walk((x) => x instanceof InsufficientFundsError)) {
      return new MonadSettlementError("INSUFFICIENT_FUNDS", { reason: "INSUFFICIENT_FUNDS" });
    }
  }
  return new MonadSettlementError("RPC_ERROR", { reason: e instanceof BaseError ? e.name : "UNKNOWN" });
}

export function classifyBroadcastError(e: unknown): BroadcastErrorKind {
  if (!(e instanceof BaseError)) return "ambiguous";
  if (e.walk((x) => x instanceof HttpRequestError || x instanceof TimeoutError)) return "ambiguous";
  const text = `${e.shortMessage} ${e.details ?? ""}`.toLowerCase();
  if (/already known|known transaction|already imported/.test(text)) return "already_known";
  // "replacement … underpriced": another pending tx holds this nonce → same handling as a used nonce.
  if (/nonce too low|nonce is too low|oldnonce|replacement transaction underpriced|nonce.*already used/.test(text)) {
    return "nonce_too_low";
  }
  if (/insufficient funds/.test(text)) return "insufficient_funds";
  return "rejected";
}

export function createViemVaultChain(config: MonadAdapterConfig, verifierKey: Hex): VaultChain {
  const chain = defineChain({
    id: config.chainId,
    name: config.chainId === 10143 ? "Monad Testnet" : `chain-${config.chainId}`,
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
  const client: PublicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });
  const account = privateKeyToAccount(verifierKey); // the key stays inside this closure
  const vault = config.vaultAddress;

  const read = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw mapChainError(e);
    }
  };

  async function scanLogsBackwards<T>(
    fromBlock: bigint,
    fetch: (from: bigint, to: bigint) => Promise<T[]>,
    stopAtFirst: boolean,
  ): Promise<T[]> {
    const out: T[] = [];
    let to = await client.getBlockNumber({ cacheTime: 0 });
    while (to >= fromBlock) {
      const from = to - config.logChunkSize + BigInt(1) > fromBlock ? to - config.logChunkSize + BigInt(1) : fromBlock;
      const found = await fetch(from, to);
      out.unshift(...found);
      if (stopAtFirst && out.length > 0) break;
      to = from - BigInt(1);
    }
    return out;
  }

  return {
    vault,
    signer: account.address,

    isPaused: () => read(() => client.readContract({ address: vault, abi: missionVaultAbi, functionName: "paused" })),

    getMissionStatus: (missionId) =>
      read(async () => {
        const m = await client.readContract({
          address: vault,
          abi: missionVaultAbi,
          functionName: "getMission",
          args: [missionId],
        });
        return Number(m.status);
      }),

    getSettlement: (missionId, submissionHash) =>
      read(async () => {
        const [settled, contributor, amount] = await client.readContract({
          address: vault,
          abi: missionVaultAbi,
          functionName: "getSettlement",
          args: [missionId, submissionHash],
        });
        return { settled, contributor, amount };
      }),

    findSettledTx: (missionId, submissionHash) =>
      read(async () => {
        const logs = await scanLogsBackwards(
          config.vaultDeployBlock,
          (fromBlock, toBlock) =>
            client.getContractEvents({
              address: vault,
              abi: missionVaultAbi,
              eventName: "Settled",
              args: { missionId, submissionHash },
              fromBlock,
              toBlock,
            }),
          true,
        );
        return logs.length > 0 ? logs[0].transactionHash : null;
      }),

    getContributorBalance: (contributor) =>
      read(async () => {
        const [credited, withdrawn, withdrawable] = await client.readContract({
          address: vault,
          abi: missionVaultAbi,
          functionName: "getContributorBalance",
          args: [contributor],
        });
        return { credited, withdrawn, withdrawable };
      }),

    listWithdrawn: (contributor, fromBlock) =>
      read(async () => {
        const logs = await scanLogsBackwards(
          fromBlock,
          (from, to) =>
            client.getContractEvents({
              address: vault,
              abi: missionVaultAbi,
              eventName: "Withdrawn",
              args: { contributor },
              fromBlock: from,
              toBlock: to,
            }),
          false,
        );
        return logs.map((l) => ({ txHash: l.transactionHash, blockNumber: l.blockNumber, amount: l.args.amount ?? BigInt(0) }));
      }),

    prepare: (call) =>
      read(async () => {
        const base = { address: vault, abi: missionVaultAbi, account: account.address } as const;
        // Simulate first: a revert on Monad still costs the whole gas limit, so never send what would revert.
        await client.simulateContract({ ...base, ...call } as Parameters<typeof client.simulateContract>[0]);
        const estimate = await client.estimateContractGas({ ...base, ...call } as Parameters<
          typeof client.estimateContractGas
        >[0]);
        const cap = GAS_CAP[call.functionName];
        if (estimate > cap) {
          throw new MonadSettlementError("TX_REVERTED", { reason: "GAS_CAP_EXCEEDED", detail: "Not sent." });
        }
        const padded = (estimate * GAS_MARGIN_NUM) / GAS_MARGIN_DEN;
        const gas = padded > cap ? cap : padded;
        const fees = await client.estimateFeesPerGas();
        const balance = await client.getBalance({ address: account.address });
        if (balance < gas * fees.maxFeePerGas) {
          throw new MonadSettlementError("INSUFFICIENT_FUNDS", { reason: "VERIFIER_BALANCE_TOO_LOW" });
        }
        const data = encodeFunctionData({ abi: missionVaultAbi, ...call } as Parameters<typeof encodeFunctionData>[0]);
        return { call, data, gas, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas };
      }),

    async sign(tx, nonce) {
      const raw = await account.signTransaction({
        type: "eip1559",
        chainId: config.chainId,
        to: vault,
        data: tx.data,
        value: BigInt(0),
        nonce,
        gas: tx.gas,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      });
      return { raw, hash: keccak256(raw) };
    },

    async signFiller(nonce) {
      const fees = await read(() => client.estimateFeesPerGas());
      const raw = await account.signTransaction({
        type: "eip1559",
        chainId: config.chainId,
        to: account.address,
        value: BigInt(0),
        nonce,
        gas: BigInt(21_000),
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      return { raw, hash: keccak256(raw) };
    },

    async broadcast(raw) {
      try {
        await client.sendRawTransaction({ serializedTransaction: raw });
      } catch (e) {
        const kind = classifyBroadcastError(e);
        if (kind === "already_known") return;
        throw new BroadcastError(kind);
      }
    },

    getNonce: (address, blockTag) =>
      read(() => client.getTransactionCount({ address: address as Address, blockTag })),

    async getReceipt(hash) {
      try {
        const r = await client.getTransactionReceipt({ hash });
        return { status: r.status, blockNumber: r.blockNumber, logs: r.logs };
      } catch (e) {
        if (e instanceof BaseError && e.walk((x) => x instanceof TransactionReceiptNotFoundError)) return null;
        throw mapChainError(e);
      }
    },

    async isKnown(hash) {
      try {
        await client.getTransaction({ hash });
        return true;
      } catch (e) {
        if (e instanceof BaseError && e.walk((x) => x instanceof TransactionNotFoundError)) return false;
        throw mapChainError(e);
      }
    },

    getBlockNumber: () => read(() => client.getBlockNumber({ cacheTime: 0 })),
  };
}
