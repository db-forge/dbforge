import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  encodeErrorResult,
  parseEther,
  type Abi,
} from "viem";
import { dbforgeErrorsAbi, missionFactoryAbi, missionVaultAbi, provenanceRegistryAbi } from "../abi";
import { MONAD_TESTNET_DEPLOYMENT, loadClientConfig } from "../config";
import { DbforgeClientError, clientErrorMessages, toClientError } from "../errors";
import { parseMonAmount } from "../mission";
import { checkReserveBalance, MONAD_RESERVE_BALANCE } from "../tx";
import { REPO_ROOT, loadArtifact } from "./anvil";

const CLIENT_DIR = join(REPO_ROOT, "lib", "monad", "client");

test("every client ABI entry matches the Foundry artifact exactly", () => {
  const strip = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "internalType" ? undefined : v)));
  const pairs: [readonly unknown[], string[]][] = [
    [missionFactoryAbi, ["MissionFactory", "MissionVault", "ProvenanceRegistry"]],
    [missionVaultAbi, ["MissionVault", "MissionFactory", "ProvenanceRegistry"]],
    [provenanceRegistryAbi, ["ProvenanceRegistry", "MissionVault", "MissionFactory"]],
  ];
  for (const [abi, sources] of pairs) {
    const own = strip(loadArtifact(sources[0]).abi) as { type: string; name?: string }[];
    const allErrors = sources.flatMap((s) => strip(loadArtifact(s).abi) as { type: string; name?: string }[]);
    for (const entry of strip(abi) as { type: string; name: string }[]) {
      const pool = entry.type === "error" ? allErrors : own;
      const match = pool.find((x) => x.type === entry.type && x.name === entry.name);
      assert.ok(match, `${entry.type} ${entry.name} missing in ${sources[0]}`);
      assert.deepEqual(entry, match, `${entry.type} ${entry.name} differs from the artifact`);
    }
  }
  const finalize = provenanceRegistryAbi.find((x) => x.type === "function" && x.name === "finalizeDataset");
  assert.deepEqual(finalize?.inputs.map((i) => i.type), ["uint256", "bytes32"]);
});

test("MONAD_TESTNET_DEPLOYMENT mirrors contracts/deployments/monad-testnet.json", () => {
  const json = JSON.parse(readFileSync(join(REPO_ROOT, "contracts", "deployments", "monad-testnet.json"), "utf8"));
  assert.equal(MONAD_TESTNET_DEPLOYMENT.chainId, json.chainId);
  assert.equal(MONAD_TESTNET_DEPLOYMENT.factory, json.contracts.MissionFactory);
  assert.equal(MONAD_TESTNET_DEPLOYMENT.vault, json.contracts.MissionVault);
  assert.equal(MONAD_TESTNET_DEPLOYMENT.registry, json.contracts.ProvenanceRegistry);
  assert.equal(MONAD_TESTNET_DEPLOYMENT.deployBlock, BigInt(json.blocks.first));
});

test("loadClientConfig: env wins, testnet falls back to the deployment, other chains need all addresses", () => {
  assert.deepEqual(loadClientConfig({}), MONAD_TESTNET_DEPLOYMENT);
  const lower = "0x000000000000000000000000000000000000beef";
  const c = loadClientConfig({ NEXT_PUBLIC_MISSION_VAULT_ADDRESS: lower });
  assert.equal(c.vault, "0x000000000000000000000000000000000000bEEF");
  assert.equal(c.factory, MONAD_TESTNET_DEPLOYMENT.factory);
  assert.throws(() => loadClientConfig({ NEXT_PUBLIC_MONAD_CHAIN_ID: "31337" }), { code: "CONFIG_MISSING" });
  assert.throws(() => loadClientConfig({ NEXT_PUBLIC_MISSION_VAULT_ADDRESS: "0x123" }), { code: "CONFIG_MISSING" });
  assert.throws(() => loadClientConfig({ NEXT_PUBLIC_MONAD_CHAIN_ID: "abc" }), { code: "CONFIG_MISSING" });
});

test("reserve check: value spend must leave 10 MON; value 0 needs gas only", () => {
  const gas = BigInt(200_000);
  const fee = BigInt(100e9);
  const gasCost = gas * fee;
  const value = parseEther("1");
  const enough = checkReserveBalance({ balance: value + gasCost + MONAD_RESERVE_BALANCE, value, gas, maxFeePerGas: fee });
  assert.equal(enough.ok, true);
  const reserve = checkReserveBalance({ balance: value + gasCost + parseEther("9"), value, gas, maxFeePerGas: fee });
  assert.deepEqual([reserve.ok, reserve.reserveOnly, reserve.shortfall], [false, true, parseEther("1")]);
  const funds = checkReserveBalance({ balance: parseEther("0.5"), value, gas, maxFeePerGas: fee });
  assert.deepEqual([funds.ok, funds.reserveOnly], [false, false]);
  const withdraw = checkReserveBalance({ balance: gasCost, value: BigInt(0), gas, maxFeePerGas: fee });
  assert.equal(withdraw.ok, true);
});

test("parseMonAmount accepts decimal MON and rejects junk", () => {
  assert.equal(parseMonAmount(" 0.5 "), parseEther("0.5"));
  assert.equal(parseMonAmount("12"), parseEther("12"));
  for (const bad of ["", "0", "0.0", "-1", "1e3", "1.1234567890123456789", "abc", "1,5"]) {
    assert.throws(() => parseMonAmount(bad), { code: "INVALID_INPUT" }, bad);
  }
});

test("toClientError maps contract reverts, rejection and unknowns without copying raw text", () => {
  const revert = (errorName: string, args?: readonly unknown[]) =>
    new ContractFunctionRevertedError({
      abi: dbforgeErrorsAbi as unknown as Abi,
      functionName: "x",
      data: encodeErrorResult({ abi: dbforgeErrorsAbi as unknown as Abi, errorName, args } as never),
    });
  const root = `0x${"11".repeat(32)}`;
  assert.equal(toClientError(revert("RootMismatch", [BigInt(1), root, root])).code, "ROOT_MISMATCH");
  assert.equal(toClientError(revert("EnforcedPause")).code, "CONTRACT_PAUSED");
  assert.equal(toClientError(revert("NothingToWithdraw")).code, "NOTHING_TO_WITHDRAW");
  assert.equal(toClientError(revert("NotBuyer", [BigInt(1)])).code, "NOT_BUYER");
  const other = toClientError(revert("SampleCountMismatch", [BigInt(1), BigInt(2)]));
  assert.deepEqual([other.code, other.reason], ["TX_REVERTED", "SampleCountMismatch"]);
  assert.equal(toClientError(new UserRejectedRequestError(new Error("secret rpc text"))).code, "USER_REJECTED");
  const rpc = toClientError(new BaseError("secret rpc text"));
  assert.equal(rpc.code, "RPC_ERROR");
  assert.ok(!rpc.message.includes("secret"));
  assert.equal(toClientError("boom").code, "RPC_ERROR");
});

test("every error code has a Turkish and an English message and an i18n key", () => {
  const tr = Object.keys(clientErrorMessages.tr).sort();
  assert.deepEqual(tr, Object.keys(clientErrorMessages.en).sort());
  for (const code of tr) {
    const e = new DbforgeClientError(code as never);
    assert.equal(e.messageKey, `monad.errors.${code}`);
    assert.ok(e.localized("tr").length > 0 && e.localized("en").length > 0);
  }
  assert.match(clientErrorMessages.tr.RESERVE_BALANCE, /10 MON/);
});

test("client folder never imports the server adapter or server-only code", () => {
  const files = readdirSync(CLIENT_DIR).filter((f) => f.endsWith(".ts"));
  for (const f of files) {
    const src = readFileSync(join(CLIENT_DIR, f), "utf8");
    const imports = [...src.matchAll(/^(?:import|export)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(spec === "viem" || spec.startsWith("viem/") || /^\.\/[a-z]+$/.test(spec), `${f} imports ${spec}`);
    }
    assert.ok(!/import\s+"server-only"|PRIVATE_KEY|process\.env\.MONAD_/.test(src), `${f} touches server-only code or env`);
  }
});
