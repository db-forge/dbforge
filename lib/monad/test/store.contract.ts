// One behavioural contract for every SettlementStore. Runs against MemorySettlementStore (store.memory.test.ts)
// and against real Postgres through the SQL draft (store.postgres.test.ts). Uses short real-time leases.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { SettlementKey, SettlementStore } from "../store/types";

const LEASE = 150;
// An idle window no test reaches: allocations behave as inside a burst (no reconcile).
const BUSY = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hex(len: number): string {
  return "0x" + randomUUID().replace(/-/g, "").repeat(4).slice(0, len);
}
function newKey(): SettlementKey {
  return { vault: hex(40), missionId: String(1 + Math.floor(Math.random() * 1e9)), submissionHash: hex(64) };
}
const contributor = () => hex(40);
const signer = () => hex(40);
const txHash = () => hex(64);

export function storeContract(name: string, make: () => Promise<SettlementStore>): void {
  test(`${name}: first claim wins, a second owner is refused while the lease is live`, async () => {
    const s = await make();
    const k = newKey();
    const c = contributor();
    const a = await s.claim(k, c, "A", LEASE * 10);
    const b = await s.claim(k, c, "B", LEASE * 10);
    assert.equal(a.claimed, true);
    assert.equal(b.claimed, false);
    assert.equal(b.record.leaseOwner, "A");
    assert.equal(b.record.status, "pending");
  });

  test(`${name}: parallel claims on one key → exactly one winner`, async () => {
    const s = await make();
    const k = newKey();
    const c = contributor();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => s.claim(k, c, `o${i}`, LEASE * 10)));
    assert.equal(results.filter((r) => r.claimed).length, 1);
  });

  test(`${name}: nonces — owner only, fresh counter starts at the chain nonce, never below it`, async () => {
    const s = await make();
    const sg = signer();
    const k1 = newKey();
    const k2 = newKey();
    await s.claim(k1, contributor(), "A", LEASE * 10);
    await s.claim(k2, contributor(), "A", LEASE * 10);
    assert.equal(await s.reserveNonce(k1, "B", sg, 7, LEASE * 10), null, "not the owner");
    assert.equal(await s.reserveNonce(k1, "A", sg, 7, LEASE * 10), 7);
    assert.equal(await s.reserveNonce(k1, "A", sg, 7, LEASE * 10), 7, "same job keeps its nonce");
    assert.equal(await s.reserveNonce(k2, "A", sg, 3, LEASE * 10), 8, "stale lower chain nonce does not go back");
    assert.equal(await s.allocateNonce(sg, 20, BUSY), 20, "chain ahead → resync upwards");
  });

  test(`${name}: 40 parallel allocations → 40 distinct contiguous nonces`, async () => {
    const s = await make();
    const sg = signer();
    const got = await Promise.all(Array.from({ length: 40 }, () => s.allocateNonce(sg, 100, BUSY)));
    assert.deepEqual([...got].sort((x, y) => x - y), Array.from({ length: 40 }, (_, i) => 100 + i));
  });

  test(`${name}: recordBroadcast needs the lease; a job with a tx is never taken over`, async () => {
    const s = await make();
    const k = newKey();
    const sg = signer();
    await s.claim(k, contributor(), "A", LEASE);
    await s.reserveNonce(k, "A", sg, 0, LEASE);
    assert.equal(await s.recordBroadcast(k, "B", txHash(), "0x01"), false);
    const h = txHash();
    assert.equal(await s.recordBroadcast(k, "A", h, "0x02"), true);
    assert.equal(await s.recordBroadcast(k, "A", txHash(), "0x03"), false, "one tx per attempt");
    await sleep(LEASE + 60);
    const b = await s.claim(k, (await s.get(k))!.contributor, "B", LEASE);
    assert.equal(b.claimed, false, "tx in flight: wait for it, never re-send");
    assert.equal(b.record.txHash, h);
    assert.equal(b.record.rawTx, "0x02");
    assert.equal(b.record.attempts, 1);
  });

  test(`${name}: expired lease without a tx → takeover keeps the reserved nonce (reuse, no gap)`, async () => {
    const s = await make();
    const k = newKey();
    const sg = signer();
    const c = contributor();
    await s.claim(k, c, "A", LEASE);
    const n = await s.reserveNonce(k, "A", sg, 5, LEASE);
    await sleep(LEASE + 60);
    const b = await s.claim(k, c, "B", LEASE * 10);
    assert.equal(b.claimed, true);
    assert.equal(b.record.nonce, n);
    assert.equal(await s.reserveNonce(k, "B", sg, 5, LEASE * 10), n);
  });

  test(`${name}: abandoned job's nonce goes to the next allocation`, async () => {
    const s = await make();
    const k = newKey();
    const sg = signer();
    await s.claim(k, contributor(), "A", LEASE);
    const n = await s.reserveNonce(k, "A", sg, 11, LEASE);
    await sleep(LEASE + 60);
    assert.equal(await s.allocateNonce(sg, 11, BUSY), n);
    assert.equal((await s.get(k))!.nonce, null);
    assert.equal(await s.allocateNonce(sg, 11, BUSY), 12);
  });

  test(`${name}: releaseNonce → job failed, lowest gap reused first, gaps below the chain nonce dropped`, async () => {
    const s = await make();
    const sg = signer();
    const k = newKey();
    await s.claim(k, contributor(), "A", LEASE * 10);
    assert.equal(await s.reserveNonce(k, "A", sg, 0, LEASE * 10), 0);
    assert.equal(await s.allocateNonce(sg, 0, BUSY), 1);
    assert.equal(await s.allocateNonce(sg, 0, BUSY), 2);
    await s.releaseNonce(k, "A", "REJECTED");
    await s.releaseSignerNonce(sg, 2);
    const rec = (await s.get(k))!;
    assert.equal(rec.status, "failed");
    assert.equal(rec.nonce, null);
    assert.equal(rec.lastError, "REJECTED");
    assert.equal(await s.allocateNonce(sg, 0, BUSY), 0, "lowest gap first");
    assert.equal(await s.allocateNonce(sg, 3, BUSY), 3, "gap 2 < chain nonce 3 is dropped");
  });

  test(`${name}: resetAttempt — one winner, capped attempts`, async () => {
    const s = await make();
    const k = newKey();
    const sg = signer();
    await s.claim(k, contributor(), "A", LEASE * 10);
    await s.reserveNonce(k, "A", sg, 0, LEASE * 10);
    const h1 = txHash();
    await s.recordBroadcast(k, "A", h1, "0x01");
    const wins = await Promise.all(["B", "C", "D"].map((o) => s.resetAttempt(k, h1, o, LEASE * 10, 2)));
    assert.equal(wins.filter(Boolean).length, 1);
    const owner = ["B", "C", "D"][wins.indexOf(true)];
    const rec = (await s.get(k))!;
    assert.equal(rec.leaseOwner, owner);
    assert.equal(rec.txHash, null);
    assert.equal(rec.nonce, null, "the replaced nonce is used on chain: not a gap");
    await s.reserveNonce(k, owner, sg, 1, LEASE * 10);
    const h2 = txHash();
    await s.recordBroadcast(k, owner, h2, "0x02");
    assert.equal(await s.resetAttempt(k, h2, "E", LEASE * 10, 2), false, "only ONE new attempt");
  });

  test(`${name}: markSettled upserts; settled is final; markFailed frees the job and an unsent nonce`, async () => {
    const s = await make();
    const sg = signer();
    const k1 = newKey();
    const c = contributor();
    await s.markSettled(k1, c, null, "123");
    const r1 = await s.claim(k1, c, "A", LEASE);
    assert.equal(r1.claimed, false);
    assert.equal(r1.record.status, "settled");
    assert.equal(r1.record.amountWei, "123");

    const k2 = newKey();
    await s.claim(k2, c, "A", LEASE * 10);
    const n = await s.reserveNonce(k2, "A", sg, 40, LEASE * 10);
    await s.markFailed(k2, null, "CONTRACT_PAUSED");
    assert.equal((await s.get(k2))!.status, "failed");
    assert.equal(await s.allocateNonce(sg, 40, BUSY), n, "unsent nonce returned");
    const again = await s.claim(k2, c, "B", LEASE * 10);
    assert.equal(again.claimed, true);
    assert.equal(again.record.nonce, null);

    const h = txHash();
    await s.markSettled(k2, c, h, "5");
    await s.markFailed(k2, null, "late");
    assert.equal((await s.get(k2))!.status, "settled", "markFailed never downgrades a settlement");
    assert.equal((await s.get(k2))!.txHash, h);
  });

  test(`${name}: inside the idle window a counter above the chain is NOT clamped (jobless burst)`, async () => {
    const s = await make();
    const sg = signer();
    assert.equal(await s.allocateNonce(sg, 10, LEASE), 10);
    assert.equal(await s.allocateNonce(sg, 10, LEASE), 11, "the first tx may simply not be visible yet");
  });

  test(`${name}: idle stale counter (chain reset / lost rows) comes down to the chain nonce`, async () => {
    const s = await make();
    const sg = signer();
    for (let i = 0; i < 3; i++) await s.allocateNonce(sg, 50, BUSY); // 50, 51, 52 never reached the chain
    await sleep(LEASE + 60);
    assert.equal(await s.allocateNonce(sg, 0, LEASE), 0, "fresh chain → start at its pending nonce");
    assert.equal(await s.allocateNonce(sg, 0, BUSY), 1);
  });

  test(`${name}: idle reconcile keeps held nonces and turns unheld ones into gaps`, async () => {
    const s = await make();
    const sg = signer();
    const k1 = newKey();
    const k2 = newKey();
    await s.claim(k1, contributor(), "A", LEASE * 20);
    await s.claim(k2, contributor(), "A", LEASE * 20);
    assert.equal(await s.reserveNonce(k1, "A", sg, 5, LEASE * 20), 5); // reserved, live lease
    assert.equal(await s.allocateNonce(sg, 5, BUSY), 6); // jobless, then lost
    assert.equal(await s.reserveNonce(k2, "A", sg, 5, LEASE * 20), 7);
    const h = txHash();
    await s.recordBroadcast(k2, "A", h, "0x77"); // in flight
    await sleep(LEASE + 60);

    assert.equal(await s.allocateNonce(sg, 5, LEASE), 6, "the unheld hole is handed out again");
    assert.equal(await s.allocateNonce(sg, 5, BUSY), 8, "5 and 7 stay with their jobs");
    assert.deepEqual(await s.findNonceHolder(sg, 5), { kind: "reserved" });
    assert.deepEqual(await s.findNonceHolder(sg, 7), { kind: "inflight", txHash: h, rawTx: "0x77" });
    assert.deepEqual(await s.findNonceHolder(sg, 6), { kind: "none" });
  });

  test(`${name}: resyncSignerNonce sets the counter and drops lower gaps`, async () => {
    const s = await make();
    const sg = signer();
    await s.allocateNonce(sg, 0, BUSY);
    await s.releaseSignerNonce(sg, 0);
    await s.resyncSignerNonce(sg, 9);
    assert.equal(await s.allocateNonce(sg, 0, BUSY), 9);
  });
}
