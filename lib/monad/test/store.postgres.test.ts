// Runs the store contract against a real Postgres with lib/monad/sql/settlement.sql applied, through a
// `supabase.rpc()`-shaped shim (the same calls SupabaseSettlementStore makes via PostgREST). Opt-in: see test/pg.ts.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { SupabaseSettlementStore } from "../store/supabase";
import { applyDraft, openPool, pgConfigured, rpcShim } from "./pg";
import { storeContract } from "./store.contract";

if (!pgConfigured) {
  test("postgres store contract (skipped: set MONAD_TEST_PG_URL and MONAD_TEST_PG_MODULE)", { skip: true }, () => {});
} else {
  const pool = openPool();
  const rpc = rpcShim(pool);

  before(async () => {
    await applyDraft(pool);
  });
  after(async () => {
    await pool.end();
  });

  test("postgres: SQL constraints reject malformed keys", async () => {
    await assert.rejects(
      pool.query(
        "insert into public.monad_settlements (vault_address, chain_mission_id, submission_hash, contributor_address, status) values ('0xABC', '1', '0x00', '0x00', 'pending')",
      ),
    );
  });

  test("postgres: a failing rpc surfaces as RPC_ERROR/STORE_ERROR without the DB message", async () => {
    const store = new SupabaseSettlementStore(rpc);
    await assert.rejects(
      store.markSettled({ vault: "bad", missionId: "1", submissionHash: "bad" }, "bad", null, "1"),
      (e: Error & { code?: string; reason?: string }) => {
        assert.equal(e.code, "RPC_ERROR");
        assert.equal(e.reason, "STORE_ERROR");
        assert.equal(/violates|check constraint/i.test(e.message), false);
        return true;
      },
    );
  });

  test("postgres: functions are not executable by anon/authenticated when those roles exist", async () => {
    await pool.query("do $$ begin create role anon; exception when duplicate_object then null; end $$");
    await applyDraft(pool);
    const res = await pool.query(
      "select has_function_privilege('anon', 'public.monad_allocate_nonce(text,bigint,integer)', 'execute') as ok",
    );
    assert.equal(res.rows[0].ok, false);
  });

  storeContract("postgres", async () => new SupabaseSettlementStore(rpc));
}
