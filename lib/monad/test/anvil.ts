// Test harness: spawns a private anvil, deploys the G3b contracts from contracts/out, and funds a mission.
// Keys come from anvil's public test mnemonic — no real key anywhere.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  parseEther,
  toHex,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { foundry } from "viem/chains";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

const MNEMONIC = "test test test test test test test test test test test junk";
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const OUT = join(REPO_ROOT, "contracts", "out");

interface Artifact {
  abi: Abi;
  bytecode: { object: Hex };
}

export function loadArtifact(name: string): Artifact {
  const path = join(OUT, `${name}.sol`, `${name}.json`);
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run \`forge build\` in contracts/ first.`);
  return JSON.parse(readFileSync(path, "utf8")) as Artifact;
}

export function account(index: number): HDAccount {
  return mnemonicToAccount(MNEMONIC, { addressIndex: index });
}

/** Private key of an anvil test account (derived here, never written in the repo). */
export function privateKeyOf(index: number): Hex {
  const key = account(index).getHdKey().privateKey;
  if (!key) throw new Error("no key");
  return toHex(key);
}

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

export interface Deployment {
  rpcUrl: string;
  proc: ChildProcess;
  publicClient: PublicClient;
  test: ReturnType<typeof createTestClient>;
  vault: Address;
  factory: Address;
  vaultAbi: Abi;
  admin: HDAccount;
  verifier: HDAccount;
  buyer: HDAccount;
  stop(): Promise<void>;
  createMission(rewardMon: string, target: number): Promise<bigint>;
  send(from: HDAccount, to: Address, abi: Abi, functionName: string, args: readonly unknown[], value?: bigint): Promise<Hex>;
}

export async function startAnvilWithContracts(): Promise<Deployment> {
  const port = await freePort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  const proc = spawn(anvilBinary(), ["--port", String(port), "--silent", "--mnemonic", MNEMONIC], {
    stdio: "ignore",
    windowsHide: true,
  });
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl), pollingInterval: 50 }) as PublicClient;
  for (let i = 0; ; i++) {
    try {
      await publicClient.getChainId();
      break;
    } catch {
      if (i > 100) throw new Error("anvil did not start");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const test = createTestClient({ chain: foundry, mode: "anvil", transport: http(rpcUrl) });
  const admin = account(0);
  const verifier = account(1);
  const buyer = account(2);

  const wallet = (from: HDAccount) => createWalletClient({ account: from, chain: foundry, transport: http(rpcUrl), pollingInterval: 50 });

  async function deploy(name: string, args: readonly unknown[]): Promise<Address> {
    const art = loadArtifact(name);
    const hash = await wallet(admin).deployContract({ abi: art.abi, bytecode: art.bytecode.object, args });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (!r.contractAddress) throw new Error(`deploy ${name} failed`);
    return r.contractAddress;
  }

  async function send(
    from: HDAccount,
    to: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    value?: bigint,
  ): Promise<Hex> {
    const hash = await wallet(from).writeContract({ address: to, abi, functionName, args, value } as never);
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${functionName} reverted`);
    return hash;
  }

  const vaultAbi = loadArtifact("MissionVault").abi;
  const factoryAbi = loadArtifact("MissionFactory").abi;
  const vault = await deploy("MissionVault", [admin.address]);
  const factory = await deploy("MissionFactory", [vault]);
  await send(admin, vault, vaultAbi, "setFactory", [factory]);
  const verifierRole = keccak256(toHex("VERIFIER_ROLE"));
  await send(admin, vault, vaultAbi, "grantRole", [verifierRole, verifier.address]);

  let missionSeq = 0;
  async function createMission(rewardMon: string, target: number): Promise<bigint> {
    const reward = parseEther(rewardMon);
    const metadata = keccak256(toHex(`mission-${++missionSeq}`));
    const before = (await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "nextMissionId" })) as bigint;
    await send(buyer, factory, factoryAbi, "createMission", [metadata, reward, BigInt(target)], reward * BigInt(target));
    return before;
  }

  return {
    rpcUrl,
    proc,
    publicClient,
    test,
    vault,
    factory,
    vaultAbi,
    admin,
    verifier,
    buyer,
    createMission,
    send,
    async stop() {
      proc.kill(); // only the anvil this harness spawned
      await new Promise((r) => setTimeout(r, 100));
    },
  };
}

/** Deploys a ProvenanceRegistry wired to `d.vault` and grants VERIFIER_ROLE to `d.verifier` (G6b tests). */
export async function deployRegistry(d: Deployment): Promise<{ registry: Address; registryAbi: Abi }> {
  const art = loadArtifact("ProvenanceRegistry");
  const wallet = createWalletClient({ account: d.admin, chain: foundry, transport: http(d.rpcUrl), pollingInterval: 50 });
  const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode.object, args: [d.admin.address, d.vault] });
  const r = await d.publicClient.waitForTransactionReceipt({ hash });
  if (!r.contractAddress) throw new Error("deploy ProvenanceRegistry failed");
  await d.send(d.admin, r.contractAddress, art.abi, "grantRole", [keccak256(toHex("VERIFIER_ROLE")), d.verifier.address]);
  return { registry: r.contractAddress, registryAbi: art.abi };
}
