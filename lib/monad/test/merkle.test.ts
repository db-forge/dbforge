import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { createWalletClient, encodeAbiParameters, http, keccak256, toHex, type Address, type Hex } from "viem";
import { foundry } from "viem/chains";
import { buildDatasetTree, buildTreeFromHashes, datasetLeaf } from "../merkle";
import { getDataset, getSampleProof } from "../dataset";
import { MonadSettlementError } from "../errors";
import type { MonadReader } from "../reader";
import { loadArtifact, startAnvilWithContracts, type Deployment } from "./anvil";

/** BaseTest._sub(i) = keccak256(abi.encode("submission", i)). */
function sub(i: number): Hex {
  return keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint256" }], ["submission", BigInt(i)]));
}

// contracts/test/ProvenanceRegistry.t.sol — test_verifySample_matchesOpenZeppelinJsTree
const FIXTURE = {
  sub0: "0xddda1b89871d04f6108c423d2d1e2110fd5540d3d2ffd4bd3c6bd0cbd711c23d",
  root: "0x606f8985f6718b7365f76ab2947d41e18c42b9c2a2a348c885065287742287be",
  proofs: [
    [
      "0x503eb4eff1808bfaca868ff3cdcf3f2f72c9991167877e6d43c5e761ceaaa7ea",
      "0xf45620d0e30dd17c6033f2a7f7c283a649f11c3c3af09cd7a40bb3222e67f9b9",
    ],
    [
      "0x4e46af3914d9eee76303e056fa372209c46e82b7008549fa8277347d08bb153e",
      "0xf45620d0e30dd17c6033f2a7f7c283a649f11c3c3af09cd7a40bb3222e67f9b9",
    ],
    ["0xa64f341e3839f625b3243e05078eb584fb93b7a325a96c659f93158b09fcae08"],
  ],
} as const;

function code(e: unknown): string {
  return e instanceof MonadSettlementError ? `${e.code}:${e.reason ?? ""}` : String(e);
}

describe("merkle (unit)", () => {
  test("matches the Solidity/OpenZeppelin fixture: root and every proof", () => {
    assert.equal(sub(0), FIXTURE.sub0);
    const tree = buildTreeFromHashes([sub(0), sub(1), sub(2)]);
    assert.equal(tree.root, FIXTURE.root);
    for (let i = 0; i < 3; i++) assert.deepEqual(tree.getProof(sub(i)), FIXTURE.proofs[i]);
  });

  test("root does not depend on input order or hash case", () => {
    const tree = buildTreeFromHashes([sub(2), sub(0).toUpperCase().replace("0X", "0x"), sub(1)]);
    assert.equal(tree.root, FIXTURE.root);
    assert.deepEqual(tree.getProof(sub(0).toUpperCase().replace("0X", "0x") as Hex), FIXTURE.proofs[0]);
  });

  test("single leaf: root is the leaf, proof is empty", () => {
    const tree = buildTreeFromHashes([sub(10)]);
    assert.equal(tree.root, datasetLeaf(sub(10)));
    assert.deepEqual(tree.getProof(sub(10)), []);
  });

  test("every proof of a larger odd-sized tree folds back to the root", () => {
    const hashes = Array.from({ length: 11 }, (_, i) => sub(100 + i));
    const tree = buildTreeFromHashes(hashes);
    for (const h of hashes) {
      let node = datasetLeaf(h);
      for (const sib of tree.getProof(h) ?? assert.fail("missing proof")) {
        const [a, b] = BigInt(node) < BigInt(sib) ? [node, sib] : [sib, node];
        node = keccak256(`0x${a.slice(2)}${b.slice(2)}`);
      }
      assert.equal(node, tree.root);
    }
  });

  test("rejects empty, duplicate and malformed input; unknown hash has no proof", () => {
    assert.throws(() => buildTreeFromHashes([]), (e) => code(e) === "INVALID_INPUT:EMPTY_DATASET");
    assert.throws(
      () => buildTreeFromHashes([sub(0), sub(0).toUpperCase().replace("0X", "0x")]),
      (e) => code(e) === "INVALID_INPUT:DUPLICATE_LEAF",
    );
    assert.throws(() => buildTreeFromHashes(["0x1234"]), (e) => code(e).startsWith("INVALID_INPUT"));
    assert.equal(buildTreeFromHashes([sub(0)]).getProof(sub(1)), null);
  });
});

describe("merkle + dataset on anvil (integration)", () => {
  let d: Deployment;
  let reader: MonadReader;
  let registry: Address;
  let registryAbi: ReturnType<typeof loadArtifact>["abi"];
  let missionId: bigint;

  before(async () => {
    d = await startAnvilWithContracts();
    const art = loadArtifact("ProvenanceRegistry");
    registryAbi = art.abi;
    const hash = await createWalletClient({ account: d.admin, chain: foundry, transport: http(d.rpcUrl) }).deployContract({
      abi: art.abi,
      bytecode: art.bytecode.object,
      args: [d.admin.address, d.vault],
    });
    const r = await d.publicClient.waitForTransactionReceipt({ hash });
    registry = r.contractAddress as Address;
    await d.send(d.admin, registry, registryAbi, "grantRole", [keccak256(toHex("VERIFIER_ROLE")), d.verifier.address]);
    reader = { client: d.publicClient, vault: d.vault, factory: d.factory, registry, fromBlock: BigInt(0), logChunkSize: BigInt(5) };

    missionId = await d.createMission("0.01", 3);
    for (let i = 0; i < 3; i++) {
      await d.send(d.verifier, d.vault, d.vaultAbi, "approveSubmission", [missionId, d.admin.address, sub(i)]);
    }
  });

  after(async () => {
    await d?.stop();
  });

  test("buildDatasetTree reads Settled events and reproduces the fixture root (chunked scan)", async () => {
    const tree = await buildDatasetTree({ chainMissionId: missionId.toString() }, reader);
    assert.equal(tree.root, FIXTURE.root);
    assert.equal(tree.entries.length, 3);
    assert.equal(tree.hashes.length, 3);
    assert.ok(tree.entries.every((e) => /^0x[0-9a-f]{64}$/.test(e.txHash) && e.amount === "10000000000000000"));
  });

  test("getDataset before anchor is none; getSampleProof reports not verified", async () => {
    assert.deepEqual(await getDataset({ chainMissionId: missionId }, reader), { status: "none" });
    const p = await getSampleProof({ chainMissionId: missionId, submissionHash: sub(1) }, reader);
    assert.equal(p.included, true);
    assert.equal(p.included && p.verified, false);
  });

  test("anchored root verifies every proof on chain (verifySample)", async () => {
    const manifest = keccak256(toHex("dataset-manifest"));
    await d.send(d.verifier, registry, registryAbi, "anchorDataset", [missionId, FIXTURE.root, BigInt(3), manifest]);

    const ds = await getDataset({ chainMissionId: missionId }, reader);
    assert.equal(ds.status, "anchored");
    assert.ok(ds.status === "anchored");
    assert.equal(ds.merkleRoot, FIXTURE.root);
    assert.equal(ds.metadataHash, manifest);
    assert.equal(ds.sampleCount, "3");
    assert.equal(ds.finalized, false);
    assert.ok(ds.anchoredAt > 0);

    for (let i = 0; i < 3; i++) {
      const p = await getSampleProof({ chainMissionId: missionId, submissionHash: sub(i) }, reader);
      assert.ok(p.included);
      assert.deepEqual(p.proof, FIXTURE.proofs[i]);
      assert.equal(p.root, FIXTURE.root);
      assert.equal(p.verified, true);
    }
    const missing = await getSampleProof({ chainMissionId: missionId, submissionHash: sub(99) }, reader);
    assert.deepEqual(missing, { included: false });
  });

  test("finalized flag is reported after the buyer finalizes", async () => {
    await d.send(d.buyer, registry, registryAbi, "finalizeDataset", [missionId, FIXTURE.root]);
    const ds = await getDataset({ chainMissionId: missionId }, reader);
    assert.ok(ds.status === "anchored" && ds.finalized);
  });

  test("a scan that misses logs fails loudly instead of returning a wrong root", async () => {
    const latest = await d.publicClient.getBlockNumber();
    await assert.rejects(
      buildDatasetTree({ chainMissionId: missionId }, { ...reader, fromBlock: latest }),
      (e) => code(e) === "RPC_ERROR:SETTLED_LOG_COUNT_MISMATCH",
    );
  });

  test("unknown mission → MISSION_NOT_FOUND; registry missing → READER_NOT_CONFIGURED", async () => {
    await assert.rejects(buildDatasetTree({ chainMissionId: 999 }, reader), (e) => code(e).startsWith("MISSION_NOT_FOUND"));
    await assert.rejects(
      getDataset({ chainMissionId: missionId }, { ...reader, registry: undefined }),
      (e) => code(e) === "INVALID_INPUT:READER_NOT_CONFIGURED",
    );
  });
});
