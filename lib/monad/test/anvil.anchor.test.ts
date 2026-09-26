// Integration (G6b): anchorDataset on a private anvil with the G6c read helpers, end to end:
// buyer creates → readMissionCreated → 2 settles → buildDatasetTree → anchorDataset → verifySample → idempotent repeat.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { parseEther, type Abi, type Address, type Hex } from "viem";
import { getSampleProof } from "../dataset";
import { MonadSettlementError } from "../errors";
import type { SettlementLogEvent } from "../log";
import { buildDatasetTree } from "../merkle";
import { metadataHash, readMissionCreated } from "../mission";
import type { MonadReader } from "../reader";
import { deployRegistry, loadArtifact, startAnvilWithContracts, type Deployment } from "./anvil";
import { closeStores, freshAddress, makeAdapter, newStore, poolSize, randomHash, until, verifierNonce } from "./helpers";

let d: Deployment;
let registry: Address;
let registryAbi: Abi;
let reader: MonadReader;
const factoryAbi = loadArtifact("MissionFactory").abi;

before(async () => {
  d = await startAnvilWithContracts();
  ({ registry, registryAbi } = await deployRegistry(d));
  reader = { client: d.publicClient, vault: d.vault, factory: d.factory, registry, fromBlock: BigInt(0), logChunkSize: BigInt(1_000) };
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

async function adapterWithRegistry() {
  return makeAdapter(d, await newStore(), { registry });
}

/** A mission with `settled` settlements; ends (Completed) when settled == target. */
async function missionWith(target: number, settled: number): Promise<{ missionId: bigint; hashes: Hex[] }> {
  const missionId = await d.createMission("0.1", target);
  const { adapter } = await adapterWithRegistry();
  const hashes: Hex[] = [];
  for (let i = 0; i < settled; i++) {
    const h = randomHash();
    await adapter.settleSubmission({ chainMissionId: missionId, contributorAddress: freshAddress(), submissionHash: h });
    hashes.push(h);
  }
  return { missionId, hashes };
}

const manifestOf = (missionId: bigint, root: Hex) => metadataHash({ missionId: missionId.toString(), root, version: 1 });

test("create → readMissionCreated → 2 settles → buildDatasetTree → anchorDataset → verifySample → repeat sends no tx", async () => {
  // Buyer signs createMission (frontend in production); the backend trusts only the receipt's Factory event.
  const meta = metadataHash({ title: "Street signs", description: "Photos of street signs", requirements: ["jpg"] });
  const reward = parseEther("0.2");
  const createTx = await d.send(d.buyer, d.factory, factoryAbi, "createMission", [meta, reward, BigInt(2)], reward * BigInt(2));
  const created = await readMissionCreated({ txHash: createTx }, reader);
  assert.ok(created);
  assert.equal(created.buyer, d.buyer.address);
  assert.equal(created.metadataHash, meta);
  assert.equal(created.targetCount, "2");
  const missionId = BigInt(created.missionId);

  const logs: SettlementLogEvent[] = [];
  const { adapter } = makeAdapter(d, await newStore(), { registry, logs });
  const hashes = [randomHash(), randomHash()];
  for (const h of hashes) {
    await adapter.settleSubmission({ chainMissionId: created.missionId, contributorAddress: freshAddress(), submissionHash: h });
  }

  const tree = await buildDatasetTree({ chainMissionId: missionId }, reader);
  assert.deepEqual([...tree.hashes].sort(), [...hashes].sort());
  const manifestHash = manifestOf(missionId, tree.root);

  const before = await getSampleProof({ chainMissionId: missionId, submissionHash: hashes[0] }, reader);
  assert.ok(before.included);
  assert.equal(before.verified, false, "not anchored yet");

  const res = await adapter.anchorDataset({
    chainMissionId: created.missionId,
    merkleRoot: tree.root,
    sampleCount: tree.hashes.length,
    manifestHash,
  });
  assert.equal(res.status, "anchored");
  const receipt = await d.publicClient.getTransactionReceipt({ hash: res.txHash as Hex });
  assert.equal(receipt.status, "success");
  assert.equal(receipt.to?.toLowerCase(), registry.toLowerCase(), "sent to the Registry, not the Vault");
  assert.ok(receipt.gasUsed < BigInt(200_000));

  for (const h of hashes) {
    const p = await getSampleProof({ chainMissionId: missionId, submissionHash: h }, reader);
    assert.ok(p.included);
    assert.equal(p.verified, true, `verifySample(${h})`);
    assert.equal(p.anchoredRoot, tree.root);
  }

  // Same anchor again: no tx, same tx hash (found from the DatasetAnchored log).
  const nonce = await verifierNonce(d);
  const again = await adapter.anchorDataset({ chainMissionId: missionId, merkleRoot: tree.root, sampleCount: "2", manifestHash });
  assert.deepEqual(again, res);
  assert.equal(await verifierNonce(d), nonce, "no new tx");
  assert.ok(logs.some((l) => l.event === "anchor.already_anchored" && l.idempotent === true));
});

test("rejections before sending: active mission, wrong sampleCount, unknown mission, bad input — nonce unchanged", async () => {
  const { adapter } = await adapterWithRegistry();
  const active = await missionWith(3, 1);
  const ended = await missionWith(2, 2);
  const nonce = await verifierNonce(d);
  const root = randomHash();
  const manifestHash = randomHash();

  await rejectsWith(
    adapter.anchorDataset({ chainMissionId: active.missionId, merkleRoot: root, sampleCount: 1, manifestHash }),
    "TX_REVERTED",
    "MissionNotEnded",
  );
  await rejectsWith(
    adapter.anchorDataset({ chainMissionId: ended.missionId, merkleRoot: root, sampleCount: 3, manifestHash }),
    "INVALID_INPUT",
    "SampleCountMismatch",
  );
  await rejectsWith(
    adapter.anchorDataset({ chainMissionId: BigInt(9_999), merkleRoot: root, sampleCount: 1, manifestHash }),
    "MISSION_NOT_FOUND",
  );
  for (const bad of [
    { merkleRoot: "0x" + "00".repeat(32), sampleCount: 2, manifestHash },
    { merkleRoot: root, sampleCount: 2, manifestHash: "0x" + "00".repeat(32) },
    { merkleRoot: root, sampleCount: 0, manifestHash },
    { merkleRoot: "0x1234", sampleCount: 2, manifestHash },
  ]) {
    await rejectsWith(adapter.anchorDataset({ chainMissionId: ended.missionId, ...bad }), "INVALID_INPUT");
  }
  assert.equal(await verifierNonce(d), nonce, "nothing was sent");
});

test("paused Registry → CONTRACT_PAUSED, not sent; unpause → anchors", async () => {
  const { adapter } = await adapterWithRegistry();
  const { missionId, hashes } = await missionWith(1, 1);
  const tree = await buildDatasetTree({ chainMissionId: missionId }, reader);
  assert.deepEqual(tree.hashes, hashes);
  const input = { chainMissionId: missionId, merkleRoot: tree.root, sampleCount: 1, manifestHash: manifestOf(missionId, tree.root) };

  await d.send(d.admin, registry, registryAbi, "pause", []);
  const nonce = await verifierNonce(d);
  await rejectsWith(adapter.anchorDataset(input), "CONTRACT_PAUSED", "EnforcedPause");
  assert.equal(await verifierNonce(d), nonce);

  await d.send(d.admin, registry, registryAbi, "unpause", []);
  assert.equal((await adapter.anchorDataset(input)).status, "anchored");
});

test("re-anchor until finalized; after finalize: same root → success, another root → AlreadyFinalized, not sent", async () => {
  const { adapter } = await adapterWithRegistry();
  const { missionId } = await missionWith(2, 2);
  const tree = await buildDatasetTree({ chainMissionId: missionId }, reader);
  const first = { chainMissionId: missionId, merkleRoot: randomHash(), sampleCount: 2, manifestHash: randomHash() };
  const good = { chainMissionId: missionId, merkleRoot: tree.root, sampleCount: 2, manifestHash: manifestOf(missionId, tree.root) };

  const a = await adapter.anchorDataset(first);
  const b = await adapter.anchorDataset(good); // re-anchor: the Registry allows it until the buyer finalizes
  assert.notEqual(a.txHash, b.txHash);

  // The buyer (frontend) finalizes the root they reviewed. The backend never calls finalizeDataset.
  await d.send(d.buyer, registry, registryAbi, "finalizeDataset", [missionId, tree.root]);

  const nonce = await verifierNonce(d);
  assert.deepEqual(await adapter.anchorDataset(good), b, "same finalized anchor → idempotent success");
  await rejectsWith(adapter.anchorDataset(first), "TX_REVERTED", "AlreadyFinalized");
  assert.equal(await verifierNonce(d), nonce, "nothing was sent");
});

test("identical concurrent calls in one process share one tx", async () => {
  const { adapter } = await adapterWithRegistry();
  const { missionId } = await missionWith(1, 1);
  const tree = await buildDatasetTree({ chainMissionId: missionId }, reader);
  const input = { chainMissionId: missionId, merkleRoot: tree.root, sampleCount: 1, manifestHash: manifestOf(missionId, tree.root) };
  const nonce = await verifierNonce(d);

  await d.test.setAutomine(false);
  try {
    const calls = [adapter.anchorDataset(input), adapter.anchorDataset({ ...input, chainMissionId: missionId.toString() })];
    await until(async () => (await poolSize(d)) === 1, 8_000, "one tx in pool");
    await d.test.mine({ blocks: 1 });
    const [x, y] = await Promise.all(calls);
    assert.equal(x.txHash, y.txHash);
  } finally {
    await d.test.setAutomine(true);
  }
  assert.equal(await verifierNonce(d), nonce + 1, "exactly one tx");
});

test("MONAD_REGISTRY_ADDRESS not configured → INVALID_INPUT REGISTRY_NOT_CONFIGURED; settlement still works", async () => {
  const { adapter } = makeAdapter(d, await newStore()); // no registry
  const { missionId } = await missionWith(1, 1);
  await rejectsWith(
    adapter.anchorDataset({ chainMissionId: missionId, merkleRoot: randomHash(), sampleCount: 1, manifestHash: randomHash() }),
    "INVALID_INPUT",
    "REGISTRY_NOT_CONFIGURED",
  );
  const m2 = await d.createMission("0.1", 2);
  const res = await adapter.settleSubmission({ chainMissionId: m2, contributorAddress: freshAddress(), submissionHash: randomHash() });
  assert.equal(res.status, "settled");
});
