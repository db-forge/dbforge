// Test harness for the browser helpers: a private anvil with all three contracts deployed as in Deploy.s.sol.
// Keys come from anvil's public test mnemonic; no real key anywhere. Only the anvil spawned here is killed.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import type { DbforgeClientConfig } from "../config";
import type { ClientContext } from "../tx";

const MNEMONIC = "test test test test test test test test test test test junk";
export const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const OUT = join(REPO_ROOT, "contracts", "out");

export function loadArtifact(name: string): { abi: Abi; bytecode: { object: Hex } } {
  const path = join(OUT, `${name}.sol`, `${name}.json`);
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run \`forge build\` in contracts/ first.`);
  return JSON.parse(readFileSync(path, "utf8"));
}

export const account = (i: number): HDAccount => mnemonicToAccount(MNEMONIC, { addressIndex: i });

function anvilBinary(): string {
  const exe = process.platform === "win32" ? "anvil.exe" : "anvil";
  const local = join(homedir(), ".foundry", "bin", exe);
  return process.env.ANVIL_BIN ?? (existsSync(local) ? local : exe);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 0));
    });
  });
}

export interface Env {
  config: DbforgeClientConfig;
  publicClient: PublicClient;
  test: ReturnType<typeof createTestClient>;
  admin: HDAccount;
  verifier: HDAccount;
  wallet(from: HDAccount): WalletClient;
  ctx(from?: HDAccount): ClientContext;
  /** Direct tx from a test account (verifier actions the browser never does). */
  send(from: HDAccount, to: Address, name: string, fn: string, args: readonly unknown[]): Promise<void>;
  stop(): void;
}

export async function startEnv(): Promise<Env> {
  const port = await freePort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  const proc = spawn(anvilBinary(), ["--port", String(port), "--silent", "--mnemonic", MNEMONIC], {
    stdio: "ignore",
    windowsHide: true,
  });
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: foundry, transport, pollingInterval: 50 }) as PublicClient;
  for (let i = 0; ; i++) {
    try {
      await publicClient.getChainId();
      break;
    } catch {
      if (i > 100) throw new Error("anvil did not start");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const test = createTestClient({ chain: foundry, mode: "anvil", transport });
  const wallet = (from: HDAccount) =>
    createWalletClient({ account: from, chain: foundry, transport, pollingInterval: 50 }) as WalletClient;
  const admin = account(0);
  const verifier = account(1);

  async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
    const art = loadArtifact(name);
    const hash = await wallet(admin).deployContract({ abi: art.abi, bytecode: art.bytecode.object, args } as never);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (!r.contractAddress) throw new Error(`deploy ${name} failed`);
    return r.contractAddress;
  }
  async function send(from: HDAccount, to: Address, name: string, fn: string, args: readonly unknown[]) {
    const hash = await wallet(from).writeContract({ address: to, abi: loadArtifact(name).abi, functionName: fn, args } as never);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${fn} reverted`);
  }

  const vault = await deploy("MissionVault", [admin.address]);
  const factory = await deploy("MissionFactory", [vault]);
  await send(admin, vault, "MissionVault", "setFactory", [factory]);
  const registry = await deploy("ProvenanceRegistry", [admin.address, vault]);
  const role = keccak256(toHex("VERIFIER_ROLE"));
  await send(admin, vault, "MissionVault", "grantRole", [role, verifier.address]);
  await send(admin, registry, "ProvenanceRegistry", "grantRole", [role, verifier.address]);

  const config: DbforgeClientConfig = { chainId: foundry.id, factory, vault, registry, deployBlock: BigInt(0) };
  return {
    config,
    publicClient,
    test,
    admin,
    verifier,
    wallet,
    ctx: (from) => ({ publicClient, walletClient: from ? wallet(from) : undefined, config, receiptTimeoutMs: 10_000 }),
    send,
    stop: () => {
      proc.kill();
    },
  };
}
