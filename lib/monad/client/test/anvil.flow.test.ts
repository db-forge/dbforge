// Real chain (anvil) flows for the browser helpers: create → parse → read → cancel, withdraw / withdrawFor,
// finalize with the reviewed root, and the pre-send guards (reserve, network, wallet).

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { keccak256, parseEther, toHex, type Hex } from "viem";
import {
  cancelMission,
  createMission,
  finalizeDataset,
  parseMissionCreated,
  prepareCreateMission,
  readContributorBalance,
  readDataset,
  readMission,
  withdraw,
  withdrawFor,
} from "../index";
import { account, startEnv, type Env } from "./anvil";

let env: Env;
before(async () => {
  env = await startEnv();
});
after(() => env?.stop());

const buyer = () => account(2);
const contributor = () => account(3);
const helper = () => account(4);
let seq = 0;
const meta = (): Hex => keccak256(toHex(`mission-${++seq}`));

async function nonceOf(addr: `0x${string}`) {
  return env.publicClient.getTransactionCount({ address: addr, blockTag: "pending" });
}

test("create → parse → read → cancel", async () => {
  const ctx = env.ctx(buyer());
  const metadataHash = meta();
  const reward = parseEther("0.5");
  const created = await createMission(ctx, { metadataHash, rewardPerSubmission: reward, targetCount: 3 });
  assert.equal(created.missionId, BigInt(1));
  assert.equal(created.buyer, buyer().address);
  assert.equal(created.rewardPerSubmission, reward);
  assert.equal(created.targetCount, BigInt(3));
  assert.equal(created.metadataHash, metadataHash);

  const receipt = await env.publicClient.getTransactionReceipt({ hash: created.txHash });
  assert.deepEqual(parseMissionCreated(receipt.logs, env.config.factory).missionId, created.missionId);
  assert.ok(receipt.gasUsed < BigInt(240_000));
  const tx = await env.publicClient.getTransaction({ hash: created.txHash });
  assert.equal(tx.value, reward * BigInt(3));
  assert.ok(tx.gas <= BigInt(240_000), `explicit gas limit under the cap (${tx.gas})`);

  const m = await readMission(ctx, created.missionId.toString());
  assert.deepEqual(
    [m.status, m.buyer, m.acceptedCount, m.remainingBudget, m.metadataHash],
    ["Active", buyer().address, BigInt(0), reward * BigInt(3), metadataHash],
  );

  await assert.rejects(cancelMission(env.ctx(contributor()), created.missionId), { code: "NOT_BUYER" });
  const cancelled = await cancelMission(ctx, created.missionId);
  assert.equal(cancelled.refunded, reward * BigInt(3));
  assert.equal((await readMission(ctx, created.missionId)).status, "Cancelled");
  await assert.rejects(cancelMission(ctx, created.missionId), { code: "MISSION_NOT_ACTIVE" });
});

test("pull payments: balance triple, withdrawFor by a helper, withdraw by the contributor", async () => {
  const ctx = env.ctx(buyer());
  const reward = parseEther("1");
  const { missionId } = await createMission(ctx, { metadataHash: meta(), rewardPerSubmission: reward, targetCount: 3 });
  const c = contributor().address;
  for (let i = 0; i < 2; i++) {
    await env.send(env.verifier, env.config.vault, "MissionVault", "approveSubmission", [missionId, c, keccak256(toHex(`s${seq}-${i}`))]);
  }
  assert.deepEqual(await readContributorBalance(ctx, c.toLowerCase()), {
    credited: reward * BigInt(2),
    withdrawn: BigInt(0),
    withdrawable: reward * BigInt(2),
  });

  const before = await env.publicClient.getBalance({ address: c });
  const viaHelper = await withdrawFor(env.ctx(helper()), c);
  assert.equal(viaHelper.amount, reward * BigInt(2));
  assert.equal(await env.publicClient.getBalance({ address: c }), before + reward * BigInt(2), "MON went to the contributor");
  assert.deepEqual(await readContributorBalance(ctx, c), { credited: reward * BigInt(2), withdrawn: reward * BigInt(2), withdrawable: BigInt(0) });

  const n = await nonceOf(c);
  await assert.rejects(withdraw(env.ctx(contributor())), { code: "NOTHING_TO_WITHDRAW" });
  assert.equal(await nonceOf(c), n, "a revert caught by the simulation sends nothing");

  await env.send(env.verifier, env.config.vault, "MissionVault", "approveSubmission", [missionId, c, keccak256(toHex(`s${seq}-2`))]);
  const own = await withdraw(env.ctx(contributor()));
  assert.equal(own.amount, reward);
  await assert.rejects(withdrawFor(env.ctx(helper()), env.config.vault), { code: "INVALID_INPUT" });
});

test("finalizeDataset sends the reviewed root; a re-anchor makes it ROOT_MISMATCH", async () => {
  const ctx = env.ctx(buyer());
  const { missionId } = await createMission(ctx, { metadataHash: meta(), rewardPerSubmission: parseEther("0.1"), targetCount: 1 });
  await assert.rejects(finalizeDataset(ctx, { missionId, expectedRoot: keccak256(toHex("x")) }), { code: "NOT_ANCHORED" });
  await env.send(env.verifier, env.config.vault, "MissionVault", "approveSubmission", [missionId, contributor().address, meta()]);
  const reviewed = keccak256(toHex(`root-a-${seq}`));
  await env.send(env.verifier, env.config.registry, "ProvenanceRegistry", "anchorDataset", [missionId, reviewed, BigInt(1), meta()]);
  const shown = await readDataset(ctx, missionId);
  assert.equal(shown.merkleRoot, reviewed);

  // Verifier re-anchors while the buyer is reviewing the old root.
  const newer = keccak256(toHex(`root-b-${seq}`));
  await env.send(env.verifier, env.config.registry, "ProvenanceRegistry", "anchorDataset", [missionId, newer, BigInt(1), meta()]);
  const n = await nonceOf(buyer().address);
  await assert.rejects(finalizeDataset(ctx, { missionId, expectedRoot: shown.merkleRoot }), { code: "ROOT_MISMATCH" });
  assert.equal(await nonceOf(buyer().address), n);

  await assert.rejects(finalizeDataset(env.ctx(helper()), { missionId, expectedRoot: newer }), { code: "NOT_BUYER" });
  const done = await finalizeDataset(ctx, { missionId, expectedRoot: newer });
  assert.match(done.txHash, /^0x[0-9a-f]{64}$/);
  assert.equal((await readDataset(ctx, missionId)).finalized, true);
  await assert.rejects(finalizeDataset(ctx, { missionId, expectedRoot: newer }), { code: "ALREADY_FINALIZED" });
});

test("reserve balance: a funding tx that would leave < 10 MON is stopped before the wallet sends", async () => {
  const poor = account(5);
  await env.test.setBalance({ address: poor.address, value: parseEther("10.5") });
  const ctx = env.ctx(poor);
  const input = { metadataHash: meta(), rewardPerSubmission: parseEther("1"), targetCount: 1 };
  const prep = await prepareCreateMission(ctx, input).catch((e) => e);
  assert.equal(prep.code, "RESERVE_BALANCE");
  await assert.rejects(createMission(ctx, input), (e: { code: string; localized(l: string): string }) => {
    assert.equal(e.code, "RESERVE_BALANCE");
    assert.match(e.localized("tr"), /10 MON/);
    return true;
  });
  assert.equal(await nonceOf(poor.address), 0, "nothing was sent");

  await env.test.setBalance({ address: poor.address, value: parseEther("0.5") });
  await assert.rejects(createMission(ctx, input), { code: "INSUFFICIENT_FUNDS" });

  await env.test.setBalance({ address: poor.address, value: parseEther("12") });
  const ok = await prepareCreateMission(ctx, input);
  assert.equal(ok.reserve.ok, true);
  assert.equal(ok.value, parseEther("1"));
});

test("guards: no wallet, wrong network, bad input, zero-value reads", async () => {
  await assert.rejects(withdraw(env.ctx()), { code: "WALLET_NOT_CONNECTED" });
  const wrong = { ...env.ctx(buyer()), config: { ...env.config, chainId: 10143 } };
  await assert.rejects(createMission(wrong, { metadataHash: meta(), rewardPerSubmission: BigInt(1), targetCount: 1 }), {
    code: "WRONG_NETWORK",
  });
  const ctx = env.ctx(buyer());
  await assert.rejects(createMission(ctx, { metadataHash: `0x${"0".repeat(64)}`, rewardPerSubmission: BigInt(1), targetCount: 1 }), {
    code: "INVALID_INPUT",
  });
  await assert.rejects(createMission(ctx, { metadataHash: meta(), rewardPerSubmission: BigInt(1), targetCount: 0 }), {
    code: "INVALID_INPUT",
  });
  await assert.rejects(readMission(ctx, "abc"), { code: "INVALID_INPUT" });
  assert.equal((await readMission(ctx, 999)).status, "None");
  assert.equal((await readDataset(ctx, 999)).anchoredAt, BigInt(0));
});
