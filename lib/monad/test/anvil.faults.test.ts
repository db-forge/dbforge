// Integration: G3b contracts on a private anvil. Receipt waiting, timeouts, restarts, reverts, dropped and replaced
// txs, and the nonce-gap strategy. Automine is switched off where a test needs to hold txs in the mempool.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createWalletClient, http, type Hex } from "viem";
import { foundry } from "viem/chains";
import { BroadcastError, type VaultChain } from "../chain";
import { MonadSettlementError } from "../errors";
import type { SettlementLogEvent } from "../log";
import { startAnvilWithContracts, type Deployment } from "./anvil";
import { closeStores, newStore, freshAddress, makeAdapter, poolSize, randomHash, sleep, track, until, verifierNonce } from "./helpers";

let d: Deployment;
before(async () => {
  d = await startAnvilWithContracts();
});
after(async () => {
  await d?.stop();
  await closeStores();
});

async function withManualMining<T>(fn: () => Promise<T>): Promise<T> {
  await d.test.setAutomine(false);
  try {
    return await fn();
  } finally {
    await d.test.setAutomine(true);
  }
}

async function caught(p: Promise<unknown>): Promise<MonadSettlementError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof MonadSettlementError, String(e));
    return e;
  }
  assert.fail("expected an error");
}

const broadcasts = (logs: SettlementLogEvent[]) => logs.filter((l) => l.event === "tx.broadcast");

test("does not return before the receipt, and waits for the configured confirmations", async () => {
  const { adapter } = makeAdapter(d, await newStore(), { timings: { confirmations: 2 } });
  const mission = await d.createMission("0.1", 5);
  await withManualMining(async () => {
    const p = track(adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() }));
    await until(async () => (await poolSize(d)) === 1, 8_000, "tx in pool");
    await sleep(300);
    assert.equal(p.settled(), false, "no receipt yet");
    await d.test.mine({ blocks: 1 });
    await sleep(300);
    assert.equal(p.settled(), false, "1 of 2 confirmations");
    await d.test.mine({ blocks: 1 });
    assert.equal((await p.promise).status, "settled");
  });
});

test("TX_TIMEOUT keeps the job; a new instance after a restart waits for the same tx (no second tx)", async () => {
  const store = await newStore();
  const mission = await d.createMission("0.1", 5);
  const input = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const nonce = await verifierNonce(d);
  await withManualMining(async () => {
    const first = makeAdapter(d, store, { timings: { txTimeoutMs: 700 } }).adapter;
    const err = await caught(first.settleSubmission(input));
    assert.equal(err.code, "TX_TIMEOUT");
    assert.match(err.txHash ?? "", /^0x[0-9a-f]{64}$/);

    const restarted = makeAdapter(d, store).adapter; // new process, same DB
    const p = track(restarted.settleSubmission(input));
    await sleep(400);
    assert.equal(await poolSize(d), 1, "still one tx");
    await d.test.mine({ blocks: 1 });
    const res = await p.promise;
    assert.equal(res.txHash, err.txHash);
  });
  assert.equal(await verifierNonce(d), nonce + 1);
});

test("lost race on the last slot: the tx that reverts on chain → TX_REVERTED with its hash; a retry is simulated, not sent", async () => {
  // Both simulations must pass before either tx is sent (a node that simulates against its pending pool, like
  // anvil, would otherwise refuse the loser without sending, which is the cheaper outcome).
  let arrived = 0;
  let release: () => void = () => {};
  const barrier = new Promise<void>((r) => (release = r));
  const wrap = (c: VaultChain): VaultChain => ({
    ...c,
    async prepare(call) {
      const prepared = await c.prepare(call);
      if (++arrived === 2) release();
      if (arrived <= 2) await barrier;
      return prepared;
    },
  });
  const { adapter } = makeAdapter(d, await newStore(), { wrap });
  const mission = await d.createMission("0.1", 1);
  const a = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const b = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const results = await withManualMining(async () => {
    const pa = adapter.settleSubmission(a).then((r) => ({ ok: r }), (e: unknown) => ({ err: e as MonadSettlementError }));
    const pb = adapter.settleSubmission(b).then((r) => ({ ok: r }), (e: unknown) => ({ err: e as MonadSettlementError }));
    await until(async () => (await poolSize(d)) === 2, 8_000, "both txs in pool");
    await d.test.mine({ blocks: 1 });
    return Promise.all([pa, pb]);
  });
  const oks = results.filter((r) => "ok" in r);
  const errs = results.flatMap((r) => ("err" in r ? [r.err] : []));
  assert.equal(oks.length, 1);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].code, "TX_REVERTED");
  assert.equal(errs[0].reason, "REVERTED_ON_CHAIN");
  const receipt = await d.publicClient.getTransactionReceipt({ hash: errs[0].txHash as Hex });
  assert.equal(receipt.status, "reverted");

  const loser = "ok" in results[0] ? b : a;
  const nonce = await verifierNonce(d);
  const again = await caught(adapter.settleSubmission(loser));
  assert.equal(again.code, "TX_REVERTED");
  assert.equal(again.reason, "MissionNotActive");
  assert.equal(await verifierNonce(d, "pending"), nonce, "no automatic retry, nothing sent");
});

test("front-run withdrawFor (G4 L-4) → TX_REVERTED 'NothingToWithdraw' (already paid), never retried", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const mission = await d.createMission("0.1", 5);
  const contributor = freshAddress();
  await adapter.settleSubmission({ chainMissionId: mission, contributorAddress: contributor, submissionHash: randomHash() });
  const buyerWallet = createWalletClient({ account: d.buyer, chain: foundry, transport: http(d.rpcUrl) });
  const err = await withManualMining(async () => {
    const p = caught(adapter.withdrawForContributor({ contributorAddress: contributor }));
    await until(async () => (await poolSize(d)) === 1, 8_000, "backend withdrawFor in pool");
    const fees = await d.publicClient.estimateFeesPerGas();
    await buyerWallet.writeContract({
      address: d.vault,
      abi: d.vaultAbi,
      functionName: "withdrawFor",
      args: [contributor],
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas * BigInt(10),
      maxFeePerGas: fees.maxFeePerGas * BigInt(10),
      gas: BigInt(150_000), // skip estimation: anvil would estimate against the pending pool and see NothingToWithdraw
    });
    await d.test.mine({ blocks: 1 });
    return p;
  });
  assert.equal(err.code, "TX_REVERTED");
  assert.equal(err.reason, "NothingToWithdraw");
  assert.equal((await d.publicClient.getTransactionReceipt({ hash: err.txHash as Hex })).status, "reverted");
  assert.equal(await d.publicClient.getBalance({ address: contributor }), BigInt(10) ** BigInt(17), "paid once, by the front-runner");
});

test("dropped tx is re-broadcast once with the same bytes (same hash, same nonce)", async () => {
  const logs: SettlementLogEvent[] = [];
  const { adapter } = makeAdapter(d, await newStore(), { logs, timings: { dropGraceMs: 300 } });
  const mission = await d.createMission("0.1", 5);
  const nonce = await verifierNonce(d);
  const res = await withManualMining(async () => {
    const p = adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() });
    await until(() => broadcasts(logs).length === 1 && true, 8_000, "broadcast");
    const hash = broadcasts(logs)[0].txHash as Hex;
    await until(async () => (await poolSize(d)) === 1, 8_000, "tx in pool");
    await d.test.dropTransaction({ hash });
    assert.equal(await poolSize(d), 0);
    await until(async () => (await poolSize(d)) === 1, 8_000, "re-broadcast");
    await d.test.mine({ blocks: 1 });
    return { r: await p, hash };
  });
  assert.equal(res.r.txHash, res.hash);
  assert.ok(logs.some((l) => l.event === "tx.rebroadcast"));
  assert.equal(await verifierNonce(d), nonce + 1);
});

test("replaced tx (its nonce used by another tx) → detected, exactly one new attempt", async () => {
  const logs: SettlementLogEvent[] = [];
  const { adapter } = makeAdapter(d, await newStore(), { logs, timings: { dropGraceMs: 60_000 } });
  const mission = await d.createMission("0.1", 5);
  const verifierWallet = createWalletClient({ account: d.verifier, chain: foundry, transport: http(d.rpcUrl) });
  const res = await withManualMining(async () => {
    const p = adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() });
    await until(() => broadcasts(logs).length === 1, 8_000, "first broadcast");
    const first = broadcasts(logs)[0];
    await until(async () => (await poolSize(d)) === 1, 8_000, "tx in pool");
    await d.test.dropTransaction({ hash: first.txHash as Hex });
    // Someone uses the same key and nonce outside the adapter (e.g. a manual cast send).
    await verifierWallet.sendTransaction({ to: d.verifier.address, value: BigInt(0), nonce: first.nonce });
    await d.test.mine({ blocks: 1 });
    await until(() => broadcasts(logs).length === 2, 8_000, "second broadcast");
    await d.test.mine({ blocks: 1 });
    return { r: await p, first, second: broadcasts(logs)[1] };
  });
  assert.equal(res.r.status, "settled");
  assert.equal(res.r.txHash, res.second.txHash);
  assert.notEqual(res.second.txHash, res.first.txHash);
  assert.equal(res.second.nonce, (res.first.nonce as number) + 1);
  assert.ok(logs.some((l) => l.event === "tx.replaced"));
  assert.ok(logs.some((l) => l.event === "tx.broadcast" && l.retry === true));
});

test("nonce gap, definitive broadcast rejection: the released nonce is reused by the next tx (no stuck tx)", async () => {
  const logs: SettlementLogEvent[] = [];
  let rejectNext = true;
  const wrap = (c: VaultChain): VaultChain => ({
    ...c,
    async broadcast(raw) {
      if (rejectNext) {
        rejectNext = false;
        throw new BroadcastError("rejected");
      }
      return c.broadcast(raw);
    },
  });
  const { adapter } = makeAdapter(d, await newStore(), { logs, wrap });
  const mission = await d.createMission("0.1", 5);
  const a = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const b = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const nonce = await verifierNonce(d);

  const err = await caught(adapter.settleSubmission(a));
  assert.equal(err.code, "RPC_ERROR");
  assert.equal(err.reason, "BROADCAST_REJECTED");
  await adapter.settleSubmission(b); // would hang (nonce+1 queued behind a hole) without the gap list
  await adapter.settleSubmission(a); // the failed job can be claimed again

  assert.deepEqual(broadcasts(logs).map((l) => l.nonce), [nonce, nonce, nonce + 1]);
  assert.equal(await verifierNonce(d), nonce + 2);
});

test("nonce gap, crash after reserving a nonce: an expired job's nonce is reused, the job resumes later", async () => {
  const logs: SettlementLogEvent[] = [];
  let crashNext = true;
  const wrap = (c: VaultChain): VaultChain => ({
    ...c,
    async sign(tx, n) {
      if (crashNext) {
        crashNext = false;
        throw new Error("process died");
      }
      return c.sign(tx, n);
    },
  });
  const store = await newStore();
  const { adapter } = makeAdapter(d, store, { logs, wrap, timings: { leaseMs: 300 } });
  const mission = await d.createMission("0.1", 5);
  const a = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const b = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const nonce = await verifierNonce(d);

  await caught(adapter.settleSubmission(a));
  await sleep(400); // lease of the "dead" instance expires
  await adapter.settleSubmission(b);
  await adapter.settleSubmission(a);

  assert.deepEqual(broadcasts(logs).map((l) => l.nonce), [nonce, nonce + 1]);
  assert.equal(await verifierNonce(d), nonce + 2);
});

test("stale counter (chain reset / lost rows): after an idle lease the counter comes down, no stuck tx", async () => {
  const logs: SettlementLogEvent[] = [];
  const store = await newStore();
  const { adapter } = makeAdapter(d, store, { logs, timings: { leaseMs: 300 } });
  const mission = await d.createMission("0.1", 5);
  const nonce = await verifierNonce(d, "pending");
  await store.allocateNonce(d.verifier.address.toLowerCase(), nonce + 30, 60_000); // counter 31 ahead of the chain
  await sleep(400);

  await adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() });

  assert.equal(broadcasts(logs)[0].nonce, nonce);
  assert.equal(logs.some((l) => l.event === "tx.hole_filled"), false, "no filler needed");
});

test("orphaned dropped tx (its job timed out, nobody retries) is re-broadcast by the next waiter", async () => {
  const logs: SettlementLogEvent[] = [];
  const store = await newStore();
  const mission = await d.createMission("0.1", 5);
  const x = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const nonce = await verifierNonce(d);
  const xErr = await withManualMining(async () => {
    const err = await caught(makeAdapter(d, store, { timings: { txTimeoutMs: 600 } }).adapter.settleSubmission(x));
    await d.test.dropTransaction({ hash: err.txHash as Hex }); // the node forgets it; the job keeps the raw tx
    assert.equal(await poolSize(d), 0);
    return err;
  });

  const y = makeAdapter(d, store, { logs });
  const ry = await y.adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() });

  assert.equal(broadcasts(logs)[0].nonce, nonce + 1, "Y queued behind X's hole");
  assert.ok(logs.some((l) => l.event === "tx.hole_rebroadcast" && l.txHash === xErr.txHash));
  assert.equal(ry.status, "settled");
  assert.equal((await y.adapter.settleSubmission(x)).txHash, xErr.txHash, "X settled by its original tx");
  assert.equal(await verifierNonce(d), nonce + 2);
});

test("a hole nobody holds (lost jobless nonce) is filled with a 0-value self-transfer", async () => {
  const logs: SettlementLogEvent[] = [];
  const store = await newStore();
  const { adapter } = makeAdapter(d, store, { logs });
  const mission = await d.createMission("0.1", 5);
  const nonce = await verifierNonce(d, "pending");
  assert.equal(await store.allocateNonce(d.verifier.address.toLowerCase(), nonce, 60_000), nonce); // never sent

  const res = await adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() });

  assert.equal(res.status, "settled");
  assert.equal(broadcasts(logs)[0].nonce, nonce + 1);
  const filled = logs.find((l) => l.event === "tx.hole_filled");
  assert.equal(filled?.nonce, nonce);
  const tx = await d.publicClient.getTransaction({ hash: filled?.txHash as Hex });
  assert.deepEqual([tx.to?.toLowerCase(), tx.value, tx.gas], [d.verifier.address.toLowerCase(), BigInt(0), BigInt(21_000)]);
  assert.equal(await verifierNonce(d), nonce + 2);
});

test("chain ahead of the store (key used outside the adapter) → resync upwards from the pending nonce", async () => {
  const logs: SettlementLogEvent[] = [];
  const store = await newStore();
  const { adapter } = makeAdapter(d, store, { logs });
  const mission = await d.createMission("0.1", 5);
  await adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() });
  const verifierWallet = createWalletClient({ account: d.verifier, chain: foundry, transport: http(d.rpcUrl) });
  const h = await verifierWallet.sendTransaction({ to: d.verifier.address, value: BigInt(0) });
  await d.publicClient.waitForTransactionReceipt({ hash: h, pollingInterval: 50 });
  const nonce = await verifierNonce(d);

  await adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() });

  assert.equal(broadcasts(logs).at(-1)?.nonce, nonce);
  assert.equal(await adapter.resyncNonce(), nonce + 1);
});
