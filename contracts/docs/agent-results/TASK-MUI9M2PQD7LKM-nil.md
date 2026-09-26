# TASK-MUI9M2PQD7LKM (G6): Monad settlement adapter (server-side) v2 · nil

Branch `feat/contracts`. Commit **`b921320`** (only `lib/monad/`, 25 files, **not pushed**).
Base: `94765a5` (the contracts from `89308fa` are deployed on Monad testnet).
Spec: the card's DECISIONS 1–4, ARCHITECTURE.md v2 §3/§6–§8, G1 (tuna), G4 phase 0 + phase 1 (pelin), my G3b report.
Files I did not touch: `lib/types.ts`, `.env.example`, `package.json`, `supabase/`, `lib/supabase/`. `contracts/` got only this report.

## 1. What was done

| Card item | Implementation |
|---|---|
| Public interface | `settleSubmission`, `getSettlement`, `getContributorBalance`, `withdrawForContributor`, `listWithdrawals` (optional, done). Also `isSettlementPaused` (G4 L-2) and `resyncNonce` (ops). Entry point: `createMonadSettlement({ store })` in `lib/monad/index.ts` (`import "server-only"`). |
| One internal contract layer | `chain.ts` (`VaultChain`): reads, simulate → estimate ×1.15 → hard cap, sign, broadcast, receipt, logs. The ABI, address, chain and key stay only there. |
| Decision 1, store | `SettlementStore` interface (`store/types.ts`). `MemorySettlementStore` for tests. `SupabaseSettlementStore(client)` takes Developer 3's service-role client as a parameter and makes one `rpc()` call per method. SQL draft: `lib/monad/sql/settlement.sql`. |
| Decision 2, nonce from Postgres | `signer_nonces(signer_address pk, next_nonce)` + `SELECT … FOR UPDATE` in `monad_allocate_nonce` / `monad_settlement_reserve_nonce`, plus a `signer_nonce_gaps` table. No single-worker rule. Gap strategy: §1.1. |
| Decision 3, `withdrawFor` | `withdrawForContributor` calls `withdrawFor(contributor)`. The verifier pays the gas; the MON goes only to the contributor (the contract guarantees this; the test checks the contributor's balance). |
| Decision 4, idempotency | Returns only after a `success` receipt (+ `MONAD_TX_CONFIRMATIONS`). A retry of the same `(chainMissionId, submissionHash)` gets the first result back, with no tx. |
| Behaviour rules | Revert → `TX_REVERTED` (with `txHash`). Timeout → `TX_TIMEOUT` (with `txHash`; the job stays pending, the next call keeps waiting). The in-progress record (key, txHash, nonce, raw tx, time) is written **before** the broadcast; the lock is the PK `(vault, mission, hash)`. Dropped tx → same bytes re-broadcast. Replaced tx → **one** new attempt. Each is logged. |
| Security | Key only in `MONAD_VERIFIER_PRIVATE_KEY`, read by `readVerifierKey`, kept in the viem account closure, never in config, logs or errors. Pause → `CONTRACT_PAUSED` without a tx. The chain settlement check runs before sending. Gas cap: approve 200k, withdrawFor **160k** (G4 phase 1 §6.4). No automatic retry of reverts. `TODO(F6)`: the hash is used as it is. |
| Error codes | `INVALID_INPUT, MISSION_NOT_FOUND, CONTRACT_PAUSED, INSUFFICIENT_FUNDS, TX_REVERTED, TX_TIMEOUT, RPC_ERROR` + `reason`. `ALREADY_SETTLED` is a success. Messages are fixed strings (no key, raw RPC or stack). |
| Lead message (89308fa) | `InvalidContributor` → `INVALID_INPUT`, and the input check rejects `contributor == Vault` **before** any tx (L-1). `withdrawFor` front-run → `TX_REVERTED reason NothingToWithdraw` = already paid, never retried (L-4). The ABI is checked against the new `forge build` output. |
| Config / log | Env/config (§3). The deployed addresses are only in README examples, from `deployments/monad-testnet.json`, not in code. JSON log lines: `event, chainMissionId, submissionHash, txHash, nonce, status/code/reason, durationMs, retry, idempotent`. |
| `server-only` | Next aliases it (webpack: `next/dist/build/create-compiler-aliases.js` → `next/dist/compiled/server-only/{empty,index}`). TS 6 checks side-effect imports, so `lib/monad/server-only.d.ts` declares the module. Node tests: `lib/monad/test/register.mjs` maps it to Next's empty module, and `--conditions=react-server` is used. **package.json is unchanged.** |

### 1.1 Nonce gap strategy (both "reuse the same nonce" and "resync to the chain")

A nonce is **bound to the job**: `reserve_nonce` writes it on the job row, and the tx hash + raw tx are written before the broadcast.

| Situation | Handling | Test |
|---|---|---|
| Broadcast definitively rejected | The nonce goes to `signer_nonce_gaps`, the job → failed. The next allocation takes the **lowest gap** (reuse). | `nonce gap, definitive broadcast rejection…` |
| Crash after reserving, before broadcasting | When the lease expires, the next allocation puts the job's nonce on the gap list and reuses it. If the job itself is claimed again first, it keeps its own nonce. | `nonce gap, crash after reserving…`, store contract `abandoned job…` / `expired lease…` |
| Tx dropped from the pool | Its waiter sends the **same raw tx** again (same hash, same nonce), once. | `dropped tx is re-broadcast once…` |
| Tx replaced (nonce used by another tx) | `resetAttempt` (compare-and-set on the tx hash, only one instance wins) → **one** new attempt with a new nonce. | `replaced tx … exactly one new attempt`, store `resetAttempt — one winner, capped` |
| Chain ahead (the key was used elsewhere) | `next = max(counter, chain pending)` → resync up. | `chain ahead of the store…` |
| Store ahead (chain reset, lost rows) | **Only after the counter has been idle for a lease**: the counter comes down to `max(chain pending, highest nonce a live job holds + 1)`, and nonces nobody holds become gaps. Within the idle window nothing is clamped, so jobless allocations (withdrawFor) are never handed out twice. | `stale counter…`, store `idle stale counter…`, `inside the idle window … NOT clamped`, `idle reconcile keeps held nonces…` |
| Tx stuck behind a missing nonce (`pending` ≤ our nonce) | After `dropGraceMs` the waiter looks up the holder of each missing nonce. An in-flight job → its raw tx is re-broadcast. A live reservation → left alone. Nobody → a 0-value self-transfer (21k gas) fills it. At most 16 nonces per check. | `orphaned dropped tx…`, `a hole nobody holds…` |

This design was not the first draft. The first full-Postgres run failed with 6× `TX_TIMEOUT`: each test file starts a new anvil at nonce 0, but the DB counter was ahead. That is the same as a real testnet re-genesis or an orphaned dropped tx. The two last rows above fix it.

## 2. Evidence

**Typecheck / lint** (repo root):
```
$ npx tsc --noEmit        → exit 0 (the baseline was also clean before this task)
$ npx eslint lib/monad    → exit 0
```

**Full suite, memory store** (`node --conditions=react-server --import ./lib/monad/test/register.mjs --test lib/monad/test/*.test.ts`):
```
✔ does not return before the receipt, and waits for the configured confirmations
✔ TX_TIMEOUT keeps the job; a new instance after a restart waits for the same tx (no second tx)
✔ lost race on the last slot: the tx that reverts on chain → TX_REVERTED with its hash; a retry is simulated, not sent
✔ front-run withdrawFor (G4 L-4) → TX_REVERTED 'NothingToWithdraw' (already paid), never retried
✔ dropped tx is re-broadcast once with the same bytes (same hash, same nonce)
✔ replaced tx (its nonce used by another tx) → detected, exactly one new attempt
✔ nonce gap, definitive broadcast rejection: the released nonce is reused by the next tx (no stuck tx)
✔ nonce gap, crash after reserving a nonce: an expired job's nonce is reused, the job resumes later
✔ stale counter (chain reset / lost rows): after an idle lease the counter comes down, no stuck tx
✔ orphaned dropped tx (its job timed out, nobody retries) is re-broadcast by the next waiter
✔ a hole nobody holds (lost jobless nonce) is filled with a 0-value self-transfer
✔ chain ahead of the store (key used outside the adapter) → resync upwards from the pending nonce
✔ settles after a successful receipt and credits the contributor (pull model: no MON moves)
✔ same key again → same result, no new tx (idempotent)
✔ already settled on chain but unknown to the store → Settled log answers, no tx
✔ same key, different contributor → INVALID_INPUT, nothing sent
✔ two concurrent calls for the same key on two instances → exactly one tx
✔ two instances (same store), different keys, in parallel → no nonce collision
✔ same hash in two missions → two separate settlements
✔ paused Vault → CONTRACT_PAUSED without a tx; after unpause the same key settles
✔ contributor == Vault (G4 L-1) → INVALID_INPUT before any tx; the on-chain InvalidContributor maps the same way
✔ unknown mission → MISSION_NOT_FOUND without a tx
✔ getContributorBalance after settle and after withdrawForContributor; MON goes to the contributor
✔ withdrawForContributor with nothing to withdraw → TX_REVERTED (simulated), no tx
✔ logs and errors never contain the verifier key or a raw tx
✔ memory: … 14 store-contract tests …
﹣ postgres store contract (skipped: set MONAD_TEST_PG_URL and MONAD_TEST_PG_MODULE) # SKIP
✔ input validation · errors · config (key never in config/errors) · chain error mapping · broadcast error
  classification · gas caps · hand-written ABI matches the Foundry artifact · SupabaseSettlementStore parameter names
ℹ tests 48  ℹ pass 47  ℹ fail 0  ℹ skipped 1
```
The anvil tests (37 of them) deploy the G3b/89308fa contracts from `contracts/out` on a private anvil (Foundry 1.8.3).
The keys come from anvil's public test mnemonic and are derived in code; no key is in the repo.
"Two instances" = two separate `SettlementAdapter` objects on the same store: 12 parallel settlements →
12 distinct, contiguous nonces, chain nonce +12.

**SQL draft on a real Postgres 16.15** (my own Docker container `postgres:16-alpine`, `pg@8` installed only in the
scratchpad). The same suite, with **every** store (the anvil suites too) on the SQL functions through a
`supabase.rpc()`-shaped shim, run twice:
```
$ MONAD_TEST_STORE=postgres MONAD_TEST_PG_URL=… MONAD_TEST_PG_MODULE=… node … --test lib/monad/test/*.test.ts
ℹ tests 64  ℹ pass 64  ℹ fail 0  ℹ skipped 0          (2 runs, both 64/64)
```
This covers the store contract (17 Postgres tests: parallel claims → 1 winner, 40 parallel allocations over 10
connections → 40 distinct contiguous nonces, lease takeover, gaps, reconcile, `resetAttempt` one winner) and the
anvil suites on Postgres, including the two-instance test. The draft is applied **twice** (it can be re-run). Anon has
no `EXECUTE` (`has_function_privilege('anon', …) = false`), and a malformed key is rejected by the CHECK constraints.

**Mutation checks** (the tests fail when the mechanism is removed, then the code is restored):
```
gap reuse off                  → both "nonce gap" tests ✖ code: 'TX_TIMEOUT'
claim always grants the lock   → "restart" + "same key on two instances" ✖ (second tx sent)
hole repair off                → "orphaned dropped tx" + "hole nobody holds" ✖ code: 'TX_TIMEOUT'
```

**Live Monad testnet, read-only** (deployed Vault `0xcc10…e0b3`, a throwaway unfunded key, **no tx sent**; the file was deleted afterwards):
```
chainId 10143 block 65857065
paused false
mission 1 status 0
balance(random) {"credited":"0","withdrawn":"0","withdrawable":"0"}
prepare(non-verifier) → {"code":"TX_REVERTED",…,"reason":"VERIFIER_ROLE_MISSING"}
prepare(withdrawFor, nothing) → {"code":"TX_REVERTED",…,"reason":"NothingToWithdraw"}
```
The ABI, the reads and the custom-error mapping work through the real Monad RPC.

## 3. Changed files (all in `b921320`)

- `lib/monad/index.ts` (entry, `server-only`), `adapter.ts`, `chain.ts`, `receipts.ts`, `abi.ts`, `config.ts`, `errors.ts`,
  `validation.ts`, `log.ts`, `server-only.d.ts`
- `lib/monad/store/types.ts`, `store/memory.ts`, `store/supabase.ts`
- `lib/monad/sql/settlement.sql` (**draft for Developer 3**)
- `lib/monad/test/`: `register.mjs`, `anvil.ts`, `helpers.ts`, `pg.ts`, `store.contract.ts`, `unit.test.ts`,
  `store.memory.test.ts`, `store.postgres.test.ts`, `anvil.settle.test.ts`, `anvil.faults.test.ts`
- `lib/monad/README.md` (import, env, signatures, returns, errors, idempotency, nonce strategy, example, and the
  required "settled = …" sentence)
- This report (not committed: the task rule is `git commit -- lib/monad/`).

## For Developer 3

**Env (server only, suggested for `.env.example`; I did not change that file):**
```
MONAD_VERIFIER_PRIVATE_KEY=            # verifier hot wallet, VERIFIER_ROLE; never NEXT_PUBLIC_
MONAD_VAULT_ADDRESS=0xcc10787653F33fefA68a455bEe3daB964C22e0b3
MONAD_VAULT_DEPLOY_BLOCK=65855492
# optional: MONAD_RPC_URL (else NEXT_PUBLIC_MONAD_RPC_URL), MONAD_CHAIN_ID (else NEXT_PUBLIC_MONAD_CHAIN_ID / 10143),
# MONAD_TX_TIMEOUT_MS=60000, MONAD_TX_CONFIRMATIONS=1, MONAD_POLL_INTERVAL_MS=500, MONAD_LEASE_MS=30000,
# MONAD_DROP_GRACE_MS=10000, MONAD_LOG_CHUNK_BLOCKS=1000
```
**Migration:** copy `lib/monad/sql/settlement.sql` as it is into `supabase/migrations/<ts>_monad_settlement.sql`.
It creates 3 tables (RLS on, no policies) and 13 functions. Execute is only for `service_role`; `anon`/`authenticated`
are revoked. **Usage:** `createMonadSettlement({ store: createSupabaseSettlementStore(getSupabaseServiceClient()) })`.
Mark `submissions.status = "paid"` and `tx_hash` from the return value. `paid` here means **credited**
(see ARCHITECTURE §8). Also: `package.json` needs no change, and `server-only` does not need to be installed
(see the risk below).

## 4. Risks

- **Turbopack + `server-only`:** the webpack alias is checked in Next's source. Turbopack keeps its alias in the
  native next-swc binary, and I did not run `next build` with a route that imports `lib/monad`, because that needs a
  file under `app/`, which is out of scope. If the build says "Module not found: server-only", the fix is
  `npm i server-only` (package.json owner). No code change is needed.
- **Monad `pending` nonce:** the hole check uses the node's `pending` nonce (geth/anvil semantics: the next
  contiguous nonce). If Monad RPC returns `latest` for `pending`, the waiter checks every unmined nonce below its own.
  This is still correct, with at most one extra "already known" re-broadcast per check.
- **Jobless `withdrawFor` nonces** are not rows in the job table. If the counter is idle for a lease *and* such a
  tx is still unmined, reconcile may hand out its nonce again. The loser gets "nonce too low" and re-reserves (at
  most 3 times). No double payment is possible: the contract pays only `withdrawable`.
- A filler self-transfer (21k gas ≈ 0.002 MON) is spent only when a nonce hole has no holder.
- `findSettledTx` / `listWithdrawals` scan logs backwards in 1000-block chunks from `MONAD_VAULT_DEPLOY_BLOCK`. Set
  that variable, or the first "already settled but unknown to the DB" lookup scans from block 0.
- F6 (raw media hash on-chain) is still open (`TODO(F6)` in `validation.ts`).

## 5. Open questions

1. Should Developer 3 add the env variables above to `.env.example`, or does the lead do it?
2. Turbopack `server-only`: accept the risk above, or should Developer 3 add `server-only` to package.json now?

## 6. Next step

- Lead: review `b921320` and push. Developer 3: migration + env + wire `settleSubmission` into the accept flow.
- G7 (terminal end-to-end on testnet) can use `createMonadSettlement` directly with the deployed addresses.
- G9 (client helpers) is separate; `isSettlementPaused` is ready for the "Create mission" guard (L-2).

**Platform:** verified on **Windows 11 Pro 10.0.26200** (Git Bash + PowerShell), Node **v24.15.0**, Foundry/anvil
**1.8.3**, Docker 29.0.1 with Postgres 16.15. Code paths that depend on the platform: `test/anvil.ts` picks
`anvil.exe` on win32 and `anvil` elsewhere (`~/.foundry/bin`, `PATH` or `ANVIL_BIN`), spawns with `windowsHide`, and
stops **only its own** child process. Paths are built with `node:path` / `import.meta.dirname`. The adapter itself has
no file paths, shell calls or processes, so it behaves the same on macOS/Linux. **macOS/Linux were not run:** only
this Windows machine was available.
