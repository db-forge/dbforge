# TASK-MUICDYI9ETGHQ (G9): lib/monad client (wagmi/viem) helpers, by kaan

Branch `feat/contracts`, commit `746ebf8` (only `lib/monad/client/`, not pushed).

## 1. What was done

Browser-side helpers for Developer 1 in `lib/monad/client/` (they take the viem clients that wagmi gives you):

- `abi.ts`: ABI subset taken from `contracts/out/*.json` (factory `createMission` + `MissionCreated`; vault `withdraw`,
  `withdrawFor`, `cancelMission`, `getMission`, `getSettlement`, `getContributorBalance`, `paused`, events; registry
  `finalizeDataset(uint256,bytes32 expectedRoot)`, `getDataset`, `verifySample`, events). All custom errors of the three
  contracts go into each ABI, because the Factory bubbles up Vault reverts.
- `config.ts`: `NEXT_PUBLIC_MONAD_CHAIN_ID`, `NEXT_PUBLIC_MISSION_FACTORY_ADDRESS`, `NEXT_PUBLIC_MISSION_VAULT_ADDRESS`,
  `NEXT_PUBLIC_PROVENANCE_REGISTRY_ADDRESS`, `NEXT_PUBLIC_MONAD_DEPLOY_BLOCK` (literal reads so Next can inline them).
  On chain 10143 it falls back to `MONAD_TESTNET_DEPLOYMENT`, a copy of `deployments/monad-testnet.json` that a test
  keeps equal to the JSON.
- `tx.ts`: one write path. It checks the wallet and the network, simulates, sets gas to estimate × 1.15 under a hard
  cap per function (from the G3b gas report), checks the fee and balance plus the **10 MON reserve** (value > 0), sends
  with explicit gas, and waits for the receipt. It never retries automatically.
- `mission.ts`: `prepareCreateMission` (dry run for the form), `createMission`, `parseMissionCreated`, `readMission`,
  `cancelMission`, `parseMonAmount`.
- `payouts.ts`: `readContributorBalance` → `(credited, withdrawn, withdrawable)`, `withdraw()`, `withdrawFor(contributor)`.
- `dataset.ts`: `readDataset` and `finalizeDataset({ missionId, expectedRoot })`. Before the wallet popup it checks
  NOT_ANCHORED, ALREADY_FINALIZED and ROOT_MISMATCH; the contract's `RootMismatch` is also mapped.
- `errors.ts`: `DbforgeClientError { code, messageKey: "monad.errors.<CODE>", reason, txHash, localized("tr"|"en") }`.
  Turkish and English texts for 19 codes. Raw RPC and wallet text is never copied.
- `README.md`: wagmi usage, env table, API, the write steps, the error table, how to run the tests.

## 2. Evidence

```
$ node --import ./lib/monad/client/test/register.mjs --test lib/monad/client/test/*.test.ts
✔ create → parse → read → cancel (882.9617ms)
✔ pull payments: balance triple, withdrawFor by a helper, withdraw by the contributor (503.2635ms)
✔ finalizeDataset sends the reviewed root; a re-anchor makes it ROOT_MISMATCH (394.4727ms)
✔ reserve balance: a funding tx that would leave < 10 MON is stopped before the wallet sends (64.658ms)
✔ guards: no wallet, wrong network, bad input, zero-value reads (51.8951ms)
✔ every client ABI entry matches the Foundry artifact exactly (14.4226ms)
✔ MONAD_TESTNET_DEPLOYMENT mirrors contracts/deployments/monad-testnet.json (0.6905ms)
✔ loadClientConfig: env wins, testnet falls back to the deployment, other chains need all addresses (2.2636ms)
✔ reserve check: value spend must leave 10 MON; value 0 needs gas only (0.6731ms)
✔ parseMonAmount accepts decimal MON and rejects junk (0.8526ms)
✔ toClientError maps contract reverts, rejection and unknowns without copying raw text (10.3506ms)
✔ every error code has a Turkish and an English message and an i18n key (0.9595ms)
✔ client folder never imports the server adapter or server-only code (3.1327ms)
ℹ tests 13 · pass 13 · fail 0

$ npx tsc --noEmit -p .        → exit 0 (includes test/wagmi-types.ts: wagmi getPublicClient/getWalletClient fit ClientContext)
$ npx eslint lib/monad/client  → no output (clean)
```

The anvil tests run on real txs (private anvil, all three contracts deployed as in `Deploy.s.sol`). They check:
- the MissionCreated fields and that `tx.value = reward × target`, with an explicit gas limit ≤ 240k;
- NOT_BUYER and MISSION_NOT_ACTIVE, both caught by the simulation;
- `withdrawFor` sends the MON to the contributor (balance delta checked);
- NOTHING_TO_WITHDRAW with an unchanged nonce;
- a re-anchor causes ROOT_MISMATCH with an unchanged nonce, then finalize with the new root succeeds;
- a 10.5 MON balance funding 1 MON gives RESERVE_BALANCE with nonce 0, and 0.5 MON gives INSUFFICIENT_FUNDS;
- WRONG_NETWORK and WALLET_NOT_CONNECTED.

## 3. Changed files

`lib/monad/client/{abi,config,errors,tx,mission,payouts,dataset,index}.ts`, `lib/monad/client/README.md`,
`lib/monad/client/test/{anvil.ts,register.mjs,unit.test.ts,anvil.flow.test.ts,wagmi-types.ts}`.
I did not touch `lib/monad/index.ts` or any other server file. Nil's uncommitted changes (`lib/monad/{abi,chain,config,log,validation}.ts`) were left alone.

## 4. Risks

- Anvil does not enforce Monad's reserve rule. The test proves that the helper stops the tx **before** sending. It does
  not prove that Monad itself reverts. The rule follows G1/G4 F12: `balance − value − gas × maxFee ≥ 10 MON`.
- The gas caps come from the Foundry gas report. If real Monad estimates are higher (Monad has different cold-access
  pricing), the helpers throw `GAS_CAP_EXCEEDED` and send nothing. This fails safe, but check it once on testnet.
- `withdraw()` has a 110k cap. A smart-contract wallet with a heavy `receive()` may go above it.
- The `finalizeDataset` pre-check reads the root and then sends. A re-anchor between these two steps is still caught
  on-chain (`RootMismatch`), but that tx costs gas.

## 5. Open questions

- `.env.example` has only `NEXT_PUBLIC_MISSION_CONTRACT_ADDRESS`. The three new `NEXT_PUBLIC_*_ADDRESS` names must be
  added there. This is outside my scope, so I did not add them.
- `metadataHash()` is in `lib/monad/mission.ts` (G6c). A client component can import it only while that file stays free
  of server-only code. Otherwise an API route must return the hash. Decide this with Developer 1.

## 6. Next step

G7 (zeki) / Developer 1: wire `useDbforge()` from the README into `app/create` (prepare → create → POST /api/missions)
and into the contributor balance page. Then run one testnet check (real gas values against the caps).

PLATFORM: verified on **Windows 11** (Node 24.15, anvil.exe from `~/.foundry/bin`). The browser code has no
platform-specific path. The test harness picks `anvil.exe` on win32 and `anvil` elsewhere, or uses `ANVIL_BIN`
(the same logic as the server harness). I did not run the tests on macOS or Linux because no machine was available;
the code path is the same there.
