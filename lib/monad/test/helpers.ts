import { randomUUID } from "node:crypto";
import { keccak256, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SettlementAdapter, type AdapterTimings } from "../adapter";
import { createViemVaultChain, type VaultChain } from "../chain";
import type { SettlementLogEvent } from "../log";
import { MemorySettlementStore } from "../store/memory";
import { SupabaseSettlementStore } from "../store/supabase";
import type { SettlementStore } from "../store/types";
import { privateKeyOf, type Deployment } from "./anvil";
import { applyDraft, createScratchDatabase, pgConfigured, rpcShim, type PgPool } from "./pg";

export const VERIFIER_INDEX = 1;

export const FAST: AdapterTimings = {
  txTimeoutMs: 8_000,
  confirmations: 1,
  pollIntervalMs: 40,
  leaseMs: 2_000,
  dropGraceMs: 300,
  vaultDeployBlock: BigInt(0),
};

export interface Harness {
  adapter: SettlementAdapter;
  chain: VaultChain;
  logs: SettlementLogEvent[];
}

export function makeAdapter(
  d: Deployment,
  store: SettlementStore,
  opts: {
    timings?: Partial<AdapterTimings>;
    wrap?: (c: VaultChain) => VaultChain;
    logs?: SettlementLogEvent[];
    registry?: Address;
  } = {},
): Harness {
  const timings = { ...FAST, ...opts.timings };
  const real = createViemVaultChain(
    {
      rpcUrl: d.rpcUrl,
      chainId: 31337,
      vaultAddress: d.vault,
      ...(opts.registry ? { registryAddress: opts.registry } : {}),
      logChunkSize: BigInt(1_000),
      ...timings,
    },
    privateKeyOf(VERIFIER_INDEX),
  );
  const chain = opts.wrap ? opts.wrap(real) : real;
  const logs = opts.logs ?? [];
  const adapter = new SettlementAdapter({ chain, store, timings, logger: (e) => logs.push(e) });
  return { adapter, chain, logs };
}

export function randomHash(): Hex {
  return keccak256(toHex(randomUUID()));
}

export function freshAddress(): Address {
  return privateKeyToAccount(generatePrivateKey()).address;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function until(cond: () => Promise<boolean> | boolean, timeoutMs = 8_000, label = "condition"): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await sleep(25);
  }
}

export async function verifierNonce(d: Deployment, tag: "latest" | "pending" = "latest"): Promise<number> {
  return d.publicClient.getTransactionCount({ address: d.verifier.address, blockTag: tag });
}

export async function poolSize(d: Deployment): Promise<number> {
  const s = await d.test.getTxpoolStatus();
  return s.pending + s.queued;
}

/** Captures an async result without awaiting it, so a test can assert "not resolved yet". */
export function track<T>(p: Promise<T>): { settled: () => boolean; promise: Promise<T> } {
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  return { settled: () => done, promise: p };
}

// MONAD_TEST_STORE=postgres runs the anvil suites on the real SQL draft (see test/pg.ts) instead of memory.
let scratch: { pool: PgPool; drop: () => Promise<void> } | undefined;

export async function newStore(): Promise<SettlementStore> {
  if (process.env.MONAD_TEST_STORE !== "postgres") return new MemorySettlementStore();
  if (!pgConfigured) throw new Error("MONAD_TEST_STORE=postgres needs MONAD_TEST_PG_URL and MONAD_TEST_PG_MODULE");
  if (!scratch) {
    scratch = await createScratchDatabase();
    await applyDraft(scratch.pool);
  }
  return new SupabaseSettlementStore(rpcShim(scratch.pool));
}

export async function closeStores(): Promise<void> {
  await scratch?.drop();
  scratch = undefined;
}
