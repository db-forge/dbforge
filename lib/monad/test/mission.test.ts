import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { keccak256, parseEther, toBytes, type Abi, type Hex } from "viem";
import { MonadSettlementError } from "../errors";
import { canonicalJson, metadataHash, readMissionCreated } from "../mission";
import type { MonadReader } from "../reader";
import { loadArtifact, startAnvilWithContracts, type Deployment } from "./anvil";

function code(e: unknown): string {
  return e instanceof MonadSettlementError ? `${e.code}:${e.reason ?? ""}` : String(e);
}

describe("metadataHash (unit)", () => {
  test("is keccak256 of the sorted-key JSON", () => {
    const obj = { title: "Kitchen videos", description: "Egocentric", requirements: ["1080p", "30s"] };
    const json = '{"description":"Egocentric","requirements":["1080p","30s"],"title":"Kitchen videos"}';
    assert.equal(canonicalJson(obj), json);
    assert.equal(metadataHash(obj), keccak256(toBytes(json)));
  });

  test("key order does not matter at any depth; array order does", () => {
    const a = metadataHash({ b: 1, a: { y: [1, 2], x: "ü" } });
    const b = metadataHash({ a: { x: "ü", y: [1, 2] }, b: 1 });
    assert.equal(a, b);
    assert.notEqual(metadataHash({ a: [1, 2] }), metadataHash({ a: [2, 1] }));
    assert.notEqual(metadataHash({ a: "1" }), metadataHash({ a: 1 }));
  });

  test("rejects values that JSON would drop or change", () => {
    for (const bad of [{ a: undefined }, { a: BigInt(1) }, { a: Number.NaN }, { a: new Date(0) }, { a: () => 1 }]) {
      assert.throws(() => metadataHash(bad as Record<string, unknown>), (e) => code(e) === "INVALID_INPUT:INVALID_METADATA");
    }
    assert.throws(() => metadataHash([] as unknown as Record<string, unknown>), (e) => code(e).startsWith("INVALID_INPUT"));
  });
});

describe("readMissionCreated on anvil (integration)", () => {
  let d: Deployment;
  let reader: MonadReader;
  let factoryAbi: Abi;

  before(async () => {
    d = await startAnvilWithContracts();
    factoryAbi = loadArtifact("MissionFactory").abi;
    reader = { client: d.publicClient, vault: d.vault, factory: d.factory, fromBlock: BigInt(0), logChunkSize: BigInt(1000) };
  });

  after(async () => {
    await d?.stop();
  });

  test("returns the missionId and fields of a createMission tx", async () => {
    await d.createMission("0.01", 1); // mission 1, so the id under test is not the first one
    const meta = metadataHash({ title: "t", description: "d", requirements: [] });
    const reward = parseEther("0.02");
    const txHash = await d.send(d.buyer, d.factory, factoryAbi, "createMission", [meta, reward, BigInt(4)], reward * BigInt(4));

    const view = await readMissionCreated({ txHash }, reader);
    assert.ok(view);
    assert.equal(view.missionId, "2");
    assert.equal(view.buyer, d.buyer.address);
    assert.equal(view.rewardPerSubmission, reward.toString());
    assert.equal(view.targetCount, "4");
    assert.equal(view.metadataHash, meta);
    assert.equal(view.txHash, txHash.toLowerCase());

    const onChain = (await d.publicClient.readContract({
      address: d.vault,
      abi: d.vaultAbi,
      functionName: "getMission",
      args: [BigInt(view.missionId)],
    })) as { buyer: string; metadataHash: Hex };
    assert.equal(onChain.buyer, d.buyer.address);
    assert.equal(onChain.metadataHash, meta);
  });

  test("unknown tx → null (not mined yet); malformed hash → INVALID_TX_HASH", async () => {
    assert.equal(await readMissionCreated({ txHash: `0x${"ab".repeat(32)}` }, reader), null);
    await assert.rejects(readMissionCreated({ txHash: "0x12" }, reader), (e) => code(e) === "INVALID_INPUT:INVALID_TX_HASH");
  });

  test("a tx without a MissionCreated from OUR factory is rejected", async () => {
    const meta = metadataHash({ n: 1 });
    const createTx = await d.send(d.buyer, d.factory, factoryAbi, "createMission", [meta, BigInt(1), BigInt(1)], BigInt(1));
    // Same tx, but the reader trusts a different factory address → the real event must not count.
    await assert.rejects(
      readMissionCreated({ txHash: createTx }, { ...reader, factory: d.vault }),
      (e) => code(e) === "INVALID_INPUT:NO_MISSION_CREATED_EVENT",
    );
    await assert.rejects(
      readMissionCreated({ txHash: createTx }, { ...reader, factory: undefined }),
      (e) => code(e) === "INVALID_INPUT:READER_NOT_CONFIGURED",
    );
  });
});
