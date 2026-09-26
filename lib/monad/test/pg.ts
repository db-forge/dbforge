// Opt-in Postgres backing for tests (`pg` is not a project dependency; package.json stays untouched):
//   MONAD_TEST_PG_URL=postgres://postgres:test@127.0.0.1:55432/postgres
//   MONAD_TEST_PG_MODULE=<path to an installed `pg` package>
// The shim turns `rpc(fn, args)` into `select public.fn(p_x => $1, …)`: the same call PostgREST makes for supabase.rpc().
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { SupabaseRpcClient } from "../store/supabase";

interface PgPool {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
  on(event: "error", listener: (e: Error) => void): void;
}

export const pgConfigured = Boolean(process.env.MONAD_TEST_PG_URL && process.env.MONAD_TEST_PG_MODULE);

export function openPool(connectionString = process.env.MONAD_TEST_PG_URL): PgPool {
  const req = createRequire(import.meta.url);
  const { Pool } = req(process.env.MONAD_TEST_PG_MODULE as string) as { Pool: new (o: object) => PgPool };
  const pool = new Pool({ connectionString, max: 10 });
  // An idle client can be terminated (drop database … with (force) at teardown): never an uncaught exception.
  pool.on("error", () => undefined);
  return pool;
}

/** A throwaway database per test process, so parallel test files never share nonce counters. */
export async function createScratchDatabase(): Promise<{ pool: PgPool; drop: () => Promise<void> }> {
  const name = `monad_test_${process.pid}_${Date.now()}`;
  const admin = openPool();
  await admin.query(`create database ${name}`);
  const url = new URL(process.env.MONAD_TEST_PG_URL as string);
  url.pathname = `/${name}`;
  const pool = openPool(url.toString());
  return {
    pool,
    async drop() {
      await pool.end();
      await admin.query(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}

/** Applies lib/monad/sql/settlement.sql twice (the draft must be re-runnable); drops the tables first by default. */
export async function applyDraft(pool: PgPool, opts: { drop?: boolean } = {}): Promise<void> {
  const sql = readFileSync(join(import.meta.dirname, "..", "sql", "settlement.sql"), "utf8");
  if (opts.drop !== false) {
    await pool.query("drop table if exists public.monad_settlements, public.signer_nonces, public.signer_nonce_gaps cascade");
  }
  await pool.query(sql);
  await pool.query(sql);
}

export function rpcShim(pool: PgPool): SupabaseRpcClient {
  return {
    async rpc(fn, args = {}) {
      const names = Object.keys(args);
      const params = names.map((n, i) => `${n} => $${i + 1}`).join(", ");
      try {
        const res = await pool.query(`select public.${fn}(${params}) as r`, names.map((n) => args[n]));
        return { data: res.rows[0]?.r ?? null, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
}

export type { PgPool };
