// Integration: G3b contracts on a private anvil. Core flows of the settlement adapter.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { parseEther, type Hex } from "viem";
import { MonadSettlementError } from "../errors";
import { startAnvilWithContracts, privateKeyOf, type Deployment } from "./anvil";
import { closeStores, newStore, VERIFIER_INDEX, freshAddress, makeAdapter, poolSize, randomHash, sleep, track, until, verifierNonce } from "./helpers";

let d: Deployment;
before(async () => {
  d = await startAnvilWithContracts();
});
after(async () => {
  await d?.stop();
  await closeStores();
});

async function rejectsWith(p: Promise<unknown>, code: string, reason?: string): Promise<MonadSettlementError> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof MonadSettlementError, `expected MonadSettlementError, got ${String(e)}`);
    assert.equal(e.code, code, `code (reason=${e.reason})`);
    if (reason) assert.equal(e.reason, reason);
    return e;
  }
  assert.fail(`expected ${code}`);
}

test("settles after a successful receipt and credits the contributor (pull model: no MON moves)", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const mission = await d.createMission("0.5", 5);
  const contributor = freshAddress();
  const hash = randomHash();

  const res = await adapter.settleSubmission({ chainMissionId: mission.toString(), contributorAddress: contributor, submissionHash: hash });

  assert.equal(res.status, "settled");
  assert.equal(res.amount, parseEther("0.5").toString());
  const receipt = await d.publicClient.getTransactionReceipt({ hash: res.txHash as Hex });
  assert.equal(receipt.status, "success");
  assert.deepEqual(await adapter.getSettlement({ chainMissionId: mission, submissionHash: hash }), {
    status: "settled",
    amount: res.amount,
    txHash: res.txHash,
  });
  assert.equal(await d.publicClient.getBalance({ address: contributor }), BigInt(0)); // credit only
});

test("same key again → same result, no new tx (idempotent)", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const mission = await d.createMission("0.1", 5);
  const input = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const first = await adapter.settleSubmission(input);
  const nonceAfterFirst = await verifierNonce(d);

  const second = await adapter.settleSubmission(input);

  assert.deepEqual(second, first);
  assert.equal(await verifierNonce(d), nonceAfterFirst);
});

test("already settled on chain but unknown to the store → Settled log answers, no tx", async () => {
  const mission = await d.createMission("0.1", 5);
  const input = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const first = await makeAdapter(d, await newStore()).adapter.settleSubmission(input);
  const nonce = await verifierNonce(d);
  const h = makeAdapter(d, await newStore()); // e.g. DB restored from an old backup

  const again = await h.adapter.settleSubmission(input);

  assert.deepEqual(again, first);
  assert.equal(await verifierNonce(d), nonce);
  assert.ok(h.logs.some((l) => l.event === "settle.already_settled" && l.idempotent));
});

test("same key, different contributor → INVALID_INPUT, nothing sent", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const mission = await d.createMission("0.1", 5);
  const hash = randomHash();
  await adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: hash });
  const nonce = await verifierNonce(d);

  await rejectsWith(
    adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: hash }),
    "INVALID_INPUT",
  );
  assert.equal(await verifierNonce(d), nonce);
});

test("two concurrent calls for the same key on two instances → exactly one tx", async () => {
  const store = await newStore();
  const a = makeAdapter(d, store).adapter;
  const b = makeAdapter(d, store).adapter;
  const mission = await d.createMission("0.1", 5);
  const input = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  const nonce = await verifierNonce(d);
  await d.test.setAutomine(false);
  try {
    const pa = track(a.settleSubmission(input));
    const pb = track(b.settleSubmission(input));
    await until(async () => (await poolSize(d)) >= 1, 8_000, "tx in pool");
    await sleep(300);
    assert.equal(await poolSize(d), 1, "only one tx may be in flight");
    assert.equal(pa.settled() || pb.settled(), false, "nothing returns before the receipt");
    await d.test.mine({ blocks: 1 });
    const [ra, rb] = await Promise.all([pa.promise, pb.promise]);
    assert.equal(ra.txHash, rb.txHash);
    assert.equal(await verifierNonce(d), nonce + 1);
  } finally {
    await d.test.setAutomine(true);
  }
});

test("two instances (same store), different keys, in parallel → no nonce collision", async () => {
  const store = await newStore();
  const logs: import("../log").SettlementLogEvent[] = [];
  const a = makeAdapter(d, store, { logs }).adapter;
  const b = makeAdapter(d, store, { logs }).adapter;
  const mission = await d.createMission("0.01", 50);
  const nonce = await verifierNonce(d);
  const jobs = Array.from({ length: 12 }, (_, i) =>
    (i % 2 === 0 ? a : b).settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() }),
  );

  const results = await Promise.all(jobs);

  assert.equal(new Set(results.map((r) => r.txHash)).size, 12);
  assert.equal(await verifierNonce(d), nonce + 12);
  const used = logs.filter((l) => l.event === "tx.broadcast").map((l) => l.nonce as number).sort((x, y) => x - y);
  assert.deepEqual(used, Array.from({ length: 12 }, (_, i) => nonce + i), "12 distinct, contiguous nonces");
});

test("same hash in two missions → two separate settlements", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const m1 = await d.createMission("0.1", 5);
  const m2 = await d.createMission("0.2", 5);
  const hash = randomHash();
  const contributor = freshAddress();

  const r1 = await adapter.settleSubmission({ chainMissionId: m1, contributorAddress: contributor, submissionHash: hash });
  const r2 = await adapter.settleSubmission({ chainMissionId: m2, contributorAddress: contributor, submissionHash: hash });

  assert.notEqual(r1.txHash, r2.txHash);
  assert.equal(r2.amount, parseEther("0.2").toString());
  assert.equal((await adapter.getContributorBalance({ contributorAddress: contributor })).credited, parseEther("0.3").toString());
});

test("paused Vault → CONTRACT_PAUSED without a tx; after unpause the same key settles", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const mission = await d.createMission("0.1", 5);
  const input = { chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() };
  assert.equal(await adapter.isSettlementPaused(), false);
  await d.send(d.admin, d.vault, d.vaultAbi, "pause", []);
  const nonce = await verifierNonce(d);
  try {
    assert.equal(await adapter.isSettlementPaused(), true);
    await rejectsWith(adapter.settleSubmission(input), "CONTRACT_PAUSED");
    assert.equal(await verifierNonce(d, "pending"), nonce);
  } finally {
    await d.send(d.admin, d.vault, d.vaultAbi, "unpause", []);
  }
  assert.equal((await adapter.settleSubmission(input)).status, "settled");
});

test("contributor == Vault (G4 L-1) → INVALID_INPUT before any tx; the on-chain InvalidContributor maps the same way", async () => {
  const { adapter, chain } = makeAdapter(d, await newStore());
  const mission = await d.createMission("0.1", 5);
  const nonce = await verifierNonce(d, "pending");
  const err = await rejectsWith(
    adapter.settleSubmission({ chainMissionId: mission, contributorAddress: d.vault, submissionHash: randomHash() }),
    "INVALID_INPUT",
    "InvalidContributor",
  );
  assert.equal(err.txHash, undefined);
  // Bypass the pre-check: the simulation hits the contract's own guard (89308fa).
  await rejectsWith(chain.prepare({ functionName: "approveSubmission", args: [mission, d.vault, randomHash()] }), "INVALID_INPUT", "InvalidContributor");
  assert.equal(await verifierNonce(d, "pending"), nonce);
});

test("unknown mission → MISSION_NOT_FOUND without a tx", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const nonce = await verifierNonce(d);
  await rejectsWith(
    adapter.settleSubmission({ chainMissionId: "999999", contributorAddress: freshAddress(), submissionHash: randomHash() }),
    "MISSION_NOT_FOUND",
  );
  assert.equal(await verifierNonce(d, "pending"), nonce);
});

test("getContributorBalance after settle and after withdrawForContributor; MON goes to the contributor", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const mission = await d.createMission("0.25", 5);
  const contributor = freshAddress();
  for (let i = 0; i < 2; i++) {
    await adapter.settleSubmission({ chainMissionId: mission, contributorAddress: contributor, submissionHash: randomHash() });
  }
  const credited = parseEther("0.5").toString();
  assert.deepEqual(await adapter.getContributorBalance({ contributorAddress: contributor }), {
    credited,
    withdrawn: "0",
    withdrawable: credited,
  });
  const verifierBefore = await d.publicClient.getBalance({ address: d.verifier.address });

  const w = await adapter.withdrawForContributor({ contributorAddress: contributor });

  assert.equal(w.amount, credited);
  assert.equal(await d.publicClient.getBalance({ address: contributor }), parseEther("0.5"));
  assert.ok((await d.publicClient.getBalance({ address: d.verifier.address })) < verifierBefore, "verifier paid gas");
  assert.deepEqual(await adapter.getContributorBalance({ contributorAddress: contributor }), {
    credited,
    withdrawn: credited,
    withdrawable: "0",
  });
  assert.deepEqual(await adapter.listWithdrawals({ contributorAddress: contributor }), [
    { txHash: w.txHash, blockNumber: (await d.publicClient.getTransactionReceipt({ hash: w.txHash })).blockNumber.toString(), amount: credited },
  ]);
});

test("withdrawForContributor with nothing to withdraw → TX_REVERTED (simulated), no tx", async () => {
  const { adapter } = makeAdapter(d, await newStore());
  const nonce = await verifierNonce(d);
  await rejectsWith(adapter.withdrawForContributor({ contributorAddress: freshAddress() }), "TX_REVERTED", "NothingToWithdraw");
  assert.equal(await verifierNonce(d, "pending"), nonce);
});

test("logs and errors never contain the verifier key or a raw tx", async () => {
  const logs: import("../log").SettlementLogEvent[] = [];
  const { adapter } = makeAdapter(d, await newStore(), { logs });
  const mission = await d.createMission("0.1", 5);
  await adapter.settleSubmission({ chainMissionId: mission, contributorAddress: freshAddress(), submissionHash: randomHash() });
  const err = await rejectsWith(
    adapter.settleSubmission({ chainMissionId: "424242", contributorAddress: freshAddress(), submissionHash: randomHash() }),
    "MISSION_NOT_FOUND",
  );
  const text = JSON.stringify(logs) + JSON.stringify(err) + err.message + String(err.stack);
  const key = privateKeyOf(VERIFIER_INDEX);
  assert.equal(text.includes(key.slice(2)), false);
  assert.equal(/0x02f8/i.test(text), false, "no signed EIP-1559 tx in logs");
  assert.ok(logs.some((l) => l.event === "settle.ok" && typeof l.durationMs === "number"));
});
