import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  InsufficientFundsError,
  RpcRequestError,
  encodeErrorResult,
  toFunctionSelector,
  toEventSelector,
  type AbiFunction,
  type AbiEvent,
} from "viem";
import { GAS_CAP, missionVaultAbi } from "../abi";
import { classifyBroadcastError, mapChainError } from "../chain";
import { loadConfigFromEnv, readVerifierKey, MonadConfigError } from "../config";
import { MonadSettlementError } from "../errors";
import { SupabaseSettlementStore } from "../store/supabase";
import { parseAddress, parseMissionId, parseSubmissionHash } from "../validation";
import { loadArtifact } from "./anvil";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as MonadSettlementError).code;
  }
  return "OK";
};

test("input validation", () => {
  const checksummed = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  assert.equal(parseAddress(checksummed, "a"), checksummed);
  assert.equal(parseAddress(checksummed.toLowerCase(), "a"), checksummed, "lowercase has no checksum to check");
  assert.equal(code(() => parseAddress("0x70997970c51812dc3A010C7d01b50e0d17dc79C8", "a")), "INVALID_INPUT", "bad checksum");
  assert.equal(code(() => parseAddress("0x0000000000000000000000000000000000000000", "a")), "INVALID_INPUT");
  assert.equal(code(() => parseAddress("0x1234", "a")), "INVALID_INPUT");
  assert.equal(code(() => parseAddress(42, "a")), "INVALID_INPUT");

  const h = "0x" + "Ab".repeat(32);
  assert.equal(parseSubmissionHash(h), h.toLowerCase());
  for (const bad of ["ab".repeat(32), "0x" + "ab".repeat(31), "0x" + "zz".repeat(32), "0x" + "00".repeat(32), null]) {
    assert.equal(code(() => parseSubmissionHash(bad)), "INVALID_INPUT", String(bad));
  }

  assert.equal(parseMissionId("12"), BigInt(12));
  assert.equal(parseMissionId(12), BigInt(12));
  assert.equal(parseMissionId(BigInt(12)), BigInt(12));
  for (const bad of ["0", "-1", "1.5", "abc", 1.5, Number.MAX_SAFE_INTEGER + 2, "1" + "0".repeat(78), undefined]) {
    assert.equal(code(() => parseMissionId(bad)), "INVALID_INPUT", String(bad));
  }
});

test("errors: fixed messages, safe JSON", () => {
  const e = new MonadSettlementError("TX_TIMEOUT", { txHash: "0xabc", reason: "NO_RECEIPT" });
  assert.deepEqual(Object.keys(e.toJSON()).sort(), ["code", "message", "reason", "txHash"]);
  assert.equal(e.name, "MonadSettlementError");
});

test("config: env parsing and the key never lands in config or errors", () => {
  const key = "0x" + "11".repeat(32);
  const env = { MONAD_RPC_URL: "https://rpc.example", MONAD_VAULT_ADDRESS: "0x" + "ab".repeat(20), MONAD_VERIFIER_PRIVATE_KEY: key };
  const cfg = loadConfigFromEnv(env);
  assert.equal(cfg.chainId, 10143);
  assert.equal(cfg.txTimeoutMs, 60_000);
  assert.equal(JSON.stringify(cfg, (_, v) => (typeof v === "bigint" ? v.toString() : v)).includes("11".repeat(32)), false);
  assert.equal(readVerifierKey(env), key);
  assert.equal(loadConfigFromEnv({ ...env, MONAD_RPC_URL: undefined, NEXT_PUBLIC_MONAD_RPC_URL: "https://x" }).rpcUrl, "https://x");
  assert.equal(loadConfigFromEnv({ ...env, NEXT_PUBLIC_MONAD_CHAIN_ID: "31337" }).chainId, 31337);
  assert.throws(() => loadConfigFromEnv({ ...env, MONAD_VAULT_ADDRESS: "" }), MonadConfigError);
  assert.throws(() => loadConfigFromEnv({ ...env, MONAD_TX_TIMEOUT_MS: "-5" }), MonadConfigError);
  try {
    readVerifierKey({ MONAD_VERIFIER_PRIVATE_KEY: key.slice(0, 20) });
    assert.fail("should throw");
  } catch (e) {
    assert.ok(e instanceof MonadConfigError);
    assert.equal((e as Error).message.includes(key.slice(2, 20)), false);
  }
});

test("chain error mapping", () => {
  const revert = (name: string, args: readonly unknown[] = []) =>
    new ContractFunctionRevertedError({
      abi: missionVaultAbi,
      functionName: "approveSubmission",
      data: encodeErrorResult({ abi: missionVaultAbi, errorName: name, args } as never),
    });
  assert.equal(mapChainError(revert("EnforcedPause")).code, "CONTRACT_PAUSED");
  const notActive = mapChainError(revert("MissionNotActive", [BigInt(3)]));
  assert.equal(notActive.code, "TX_REVERTED");
  assert.equal(notActive.reason, "MissionNotActive");
  assert.equal(mapChainError(revert("AccessControlUnauthorizedAccount", ["0x" + "11".repeat(20), "0x" + "22".repeat(32)])).reason, "VERIFIER_ROLE_MISSING");
  assert.deepEqual(
    [mapChainError(revert("InvalidContributor")).code, mapChainError(revert("InvalidContributor")).reason],
    ["INVALID_INPUT", "InvalidContributor"],
  );
  assert.equal(mapChainError(revert("InvalidSubmission")).code, "INVALID_INPUT");
  assert.equal(mapChainError(new InsufficientFundsError()).code, "INSUFFICIENT_FUNDS");
  const rpc = mapChainError(new HttpRequestError({ url: "https://secret-rpc.example/key123", body: { x: 1 } }));
  assert.equal(rpc.code, "RPC_ERROR");
  assert.equal(rpc.message.includes("key123"), false);
});

test("broadcast error classification", () => {
  const rpcErr = (message: string) => new RpcRequestError({ body: {}, error: { code: -32000, message }, url: "http://x" });
  assert.equal(classifyBroadcastError(rpcErr("nonce too low")), "nonce_too_low");
  assert.equal(classifyBroadcastError(rpcErr("replacement transaction underpriced")), "nonce_too_low");
  assert.equal(classifyBroadcastError(rpcErr("already known")), "already_known");
  assert.equal(classifyBroadcastError(rpcErr("insufficient funds for gas * price + value")), "insufficient_funds");
  assert.equal(classifyBroadcastError(rpcErr("intrinsic gas too low")), "rejected");
  assert.equal(classifyBroadcastError(new HttpRequestError({ url: "http://x" })), "ambiguous");
  assert.equal(classifyBroadcastError(new BaseError("weird")), "rejected");
  assert.equal(classifyBroadcastError(new Error("socket hang up")), "ambiguous");
});

test("gas caps come from the G3b gas report (worst case + headroom)", () => {
  assert.ok(GAS_CAP.approveSubmission >= BigInt(151_857) && GAS_CAP.approveSubmission <= BigInt(250_000));
  assert.ok(GAS_CAP.withdrawFor >= BigInt(140_162) && GAS_CAP.withdrawFor <= BigInt(250_000));
});

test("hand-written ABI matches the Foundry artifact (selectors, events, errors)", () => {
  const artifact = loadArtifact("MissionVault").abi;
  const sig = (item: { type: string }) => {
    if (item.type === "function") return toFunctionSelector(item as AbiFunction);
    if (item.type === "event") return toEventSelector(item as AbiEvent);
    return toFunctionSelector({ ...(item as AbiFunction), type: "function", outputs: [], stateMutability: "view" } as AbiFunction);
  };
  const artifactSigs = new Set(artifact.map(sig));
  for (const item of missionVaultAbi) assert.ok(artifactSigs.has(sig(item)), `${item.type} ${"name" in item ? item.name : ""}`);
  for (const fn of ["getMission", "getSettlement", "getContributorBalance"] as const) {
    const ours = missionVaultAbi.find((x) => x.type === "function" && x.name === fn) as AbiFunction;
    const theirs = artifact.find((x) => x.type === "function" && x.name === fn) as AbiFunction;
    assert.deepEqual(
      JSON.stringify(ours.outputs, ["type", "components"]),
      JSON.stringify(theirs.outputs, ["type", "components"]),
      `${fn} outputs`,
    );
  }
  const indexed = (abi: readonly unknown[], name: string) =>
    ((abi as AbiEvent[]).find((x) => x.type === "event" && x.name === name) as AbiEvent).inputs.map((i) => i.indexed);
  assert.deepEqual(indexed(missionVaultAbi, "Settled"), indexed(artifact, "Settled"));
  assert.deepEqual(indexed(missionVaultAbi, "Withdrawn"), indexed(artifact, "Withdrawn"));
});

test("SupabaseSettlementStore calls the SQL functions with their parameter names", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const store = new SupabaseSettlementStore({
    async rpc(fn, args = {}) {
      calls.push({ fn, args });
      if (fn === "monad_settlement_claim") {
        return {
          data: {
            claimed: true,
            record: {
              vault_address: "0xv", chain_mission_id: "1", submission_hash: "0xh", contributor_address: "0xc",
              status: "pending", lease_owner: "A", lease_expires_at_ms: "1700000000000", signer_address: null,
              nonce: "7", tx_hash: null, raw_tx: null, amount_wei: null, attempts: 0, last_error: null,
              updated_at_ms: 1700000000000,
            },
          },
          error: null,
        };
      }
      if (fn === "monad_allocate_nonce") return { data: "42", error: null };
      return { data: null, error: { message: "duplicate key value violates … secret row data" } };
    },
  });
  const key = { vault: "0xv", missionId: "1", submissionHash: "0xh" };
  const claim = await store.claim(key, "0xc", "A", 1000);
  assert.equal(claim.record.nonce, 7);
  assert.equal(claim.record.leaseExpiresAt, 1_700_000_000_000);
  assert.deepEqual(calls[0], {
    fn: "monad_settlement_claim",
    args: { p_vault: "0xv", p_mission: "1", p_hash: "0xh", p_contributor: "0xc", p_owner: "A", p_lease_ms: 1000 },
  });
  assert.equal(await store.allocateNonce("0xs", 3, 500), 42);
  assert.deepEqual(calls.at(-1)?.args, { p_signer: "0xs", p_chain_nonce: 3, p_idle_ms: 500 });
  await assert.rejects(store.get(key), (e: MonadSettlementError) => e.code === "RPC_ERROR" && !e.message.includes("secret"));
});
