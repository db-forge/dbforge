# lib/monad/client/

Owner: **Developer 2** (G9). For: **Developer 1** (frontend). Contract spec: `contracts/docs/ARCHITECTURE.md` v2.

Browser-side helpers for the three DBForge contracts: the buyer creates and cancels missions and accepts datasets;
a contributor (or anyone, for them) withdraws. They work with the viem clients that wagmi gives you.
This folder never imports the server adapter (`@/lib/monad`): no key, no store, no `server-only`.
Settlement and anchoring stay on the server (`lib/monad`, G6).

> **settled = credited to the contributor's on-chain balance.** MON leaves the Vault only on `withdraw()` /
> `withdrawFor(contributor)`. Show `readContributorBalance` → `{ credited, withdrawn, withdrawable }`.

## Use (client components)

```tsx
"use client";
import { usePublicClient, useWalletClient } from "wagmi";
import {
  createMission, finalizeDataset, isDbforgeClientError, loadClientConfig, parseMonAmount,
  prepareCreateMission, readContributorBalance, withdraw, type ClientContext,
} from "@/lib/monad/client";

const config = loadClientConfig(); // once, at module level

function useDbforge(): ClientContext | undefined {
  const publicClient = usePublicClient({ chainId: config.chainId });
  const { data: walletClient } = useWalletClient();
  return publicClient ? { publicClient, walletClient, config } : undefined;
}

// Buyer: create a mission. Chain first, then POST /api/missions with missionId + txHash (ARCHITECTURE §8).
const input = { metadataHash, rewardPerSubmission: parseMonAmount("0.5"), targetCount: 20 };
const dry = await prepareCreateMission(ctx, input);   // no popup: simulation + gas + 10 MON reserve check
const { missionId, txHash } = await createMission(ctx, input);

// Buyer: accept the dataset with the root the buyer REVIEWED (the one on screen, not a fresh read).
await finalizeDataset(ctx, { missionId, expectedRoot: shownDataset.merkleRoot });

// Contributor: balance + withdraw.
const { withdrawable } = await readContributorBalance(ctx, address);
const { amount } = await withdraw(ctx);

// Errors: every helper throws DbforgeClientError.
try { /* … */ } catch (e) {
  if (isDbforgeClientError(e)) toast(e.localized("tr")); // or t(e.messageKey) with your own dictionary
}
```

`metadataHash` is a `bytes32`: use the shared `metadataHash({ title, description, requirements })` of
`lib/monad/mission.ts` (G6c, keccak256 of the sorted-key JSON). The server must compute the same value, so do not
build your own. Never import the `@/lib/monad` index in a client component (it is `server-only`); either let an API
route return the hash, or import `@/lib/monad/mission` directly only while that file stays free of server-only code.

## Config (`NEXT_PUBLIC_` only, nothing secret)

| Variable | Default on chain 10143 | Meaning |
|---|---|---|
| `NEXT_PUBLIC_MONAD_CHAIN_ID` | `10143` | The wallet must be on this chain (`WRONG_NETWORK` otherwise). |
| `NEXT_PUBLIC_MISSION_FACTORY_ADDRESS` | `0xC462…4c73` | MissionFactory (`createMission`) |
| `NEXT_PUBLIC_MISSION_VAULT_ADDRESS` | `0xcc10…0b3` | MissionVault (balance, withdraw, cancel) |
| `NEXT_PUBLIC_PROVENANCE_REGISTRY_ADDRESS` | `0x4e9D…99Ec` | ProvenanceRegistry (dataset, finalize) |
| `NEXT_PUBLIC_MONAD_DEPLOY_BLOCK` | `65855492` | Lower bound for log scans |

The defaults are `MONAD_TESTNET_DEPLOYMENT`, a copy of `contracts/deployments/monad-testnet.json` (a test keeps them
equal). On any other chain id all three addresses are required. `.env.example` still has only
`NEXT_PUBLIC_MISSION_CONTRACT_ADDRESS`; add the three names above there (not done here: outside this folder).
For the wagmi config, use `monadTestnet` from `viem/chains`.

## API

| Function | Wallet? | Returns |
|---|---|---|
| `prepareCreateMission(ctx, input)` | account only | `{ gas, maxFeePerGas, reserve: { ok, required, shortfall, reserveOnly }, value }`. No popup. |
| `createMission(ctx, { metadataHash, rewardPerSubmission, targetCount })` | yes | `{ missionId, buyer, rewardPerSubmission, targetCount, metadataHash, txHash }`. `value = reward × target`. |
| `parseMissionCreated(logs, factory)` | — | The single `MissionCreated` event of these receipt logs. |
| `readMission(ctx, missionId)` | — | `{ buyer, rewardPerSubmission, targetCount, acceptedCount, remainingBudget, metadataHash, status }`, `status` ∈ `None · Active · Completed · Cancelled` |
| `cancelMission(ctx, missionId)` | buyer | `{ txHash, refunded }` |
| `readContributorBalance(ctx, address)` | — | `{ credited, withdrawn, withdrawable }` (wei) |
| `withdraw(ctx)` | contributor | `{ txHash, amount }`. MON goes to the connected wallet. |
| `withdrawFor(ctx, contributor)` | anyone | `{ txHash, amount }`. The caller pays gas, MON goes **only** to `contributor`. 50k gas stipend: a contract wallet with a heavy `receive()` must use `withdraw()`. |
| `readDataset(ctx, missionId)` | — | `{ merkleRoot, metadataHash, sampleCount, anchoredAt, finalized }` (`anchoredAt = 0` → not anchored) |
| `finalizeDataset(ctx, { missionId, expectedRoot })` | buyer | `{ txHash }`. Pre-checks `NOT_ANCHORED`, `ALREADY_FINALIZED`, `ROOT_MISMATCH` before the popup; the contract enforces `RootMismatch` too. On `ROOT_MISMATCH`, reload the dataset and ask for a new review. |
| `parseMonAmount("0.5")` | — | wei `bigint`. Rejects empty, 0, negative, > 18 decimals. |
| `checkReserveBalance({ balance, value, gas, maxFeePerGas })` | — | Pure version of the reserve rule. |

Amounts are `bigint` wei; use viem `formatEther` for display. ABIs are exported too (`missionFactoryAbi`,
`missionVaultAbi`, `provenanceRegistryAbi`) for `useReadContract` / `useWatchContractEvent`.

## Every write does this (Monad charges the gas LIMIT, also for reverts)

1. Wallet connected (`WALLET_NOT_CONNECTED`) and on `config.chainId` (`WRONG_NETWORK`).
2. `simulateContract`: a revert stops here with its mapped code, and **nothing is sent**.
3. Gas limit = estimate × 1.15, hard cap per function (`CLIENT_GAS_CAP`: create 240k, cancel 90k, withdraw 110k,
   withdrawFor 160k, finalize 90k, from the G3b gas report). Estimate above the cap → `GAS_CAP_EXCEEDED`.
4. **Reserve balance:** with `value > 0`, `balance − value − gas × maxFeePerGas` must stay **≥ 10 MON**
   (`RESERVE_BALANCE`); otherwise the tx would revert on Monad and still burn gas. Value-0 calls need the gas only
   (`INSUFFICIENT_FUNDS`).
5. Send with the explicit gas and fees, then wait for a successful receipt (60 s → `TX_TIMEOUT` with `txHash`).
   A mined revert → `TX_REVERTED` / `REVERTED_ON_CHAIN`. Nothing is retried automatically.

## Errors

`DbforgeClientError { code, messageKey: "monad.errors.<CODE>", reason?, txHash?, localized("tr" | "en") }`.
`message` is always the fixed English text; wallet/RPC text is never copied. Texts: `clientErrorMessages.tr / .en`.

| `code` | When |
|---|---|
| `CONFIG_MISSING` | Bad or missing `NEXT_PUBLIC_` address / chain id (`reason` = variable name) |
| `WALLET_NOT_CONNECTED` · `WRONG_NETWORK` · `USER_REJECTED` | Wallet state / the user said no |
| `INVALID_INPUT` | Bad hash, amount, target, id or contributor (zero address or the Vault), or the contract's `InvalidReward`, `InvalidTarget`, `InvalidMetadata`, `IncorrectFunding`, `ZeroAddress`, `InvalidContributor` |
| `RESERVE_BALANCE` | The 10 MON rule would fail (`reason` = `shortfall=<wei>`) |
| `INSUFFICIENT_FUNDS` | Balance does not cover value + gas |
| `CONTRACT_PAUSED` · `NOT_BUYER` · `MISSION_NOT_ACTIVE` · `NOTHING_TO_WITHDRAW` · `NOT_ANCHORED` · `ALREADY_FINALIZED` · `ROOT_MISMATCH` | The matching contract error |
| `GAS_CAP_EXCEEDED` | Estimate above the cap: not sent |
| `TX_REVERTED` | Any other contract error (`reason` = its name) or a mined revert (`REVERTED_ON_CHAIN`) |
| `TX_TIMEOUT` · `EVENT_NOT_FOUND` | Sent (`txHash` set), but no receipt in time / the expected event is missing |
| `RPC_ERROR` | Network or unknown failure |

## Tests

```bash
cd contracts && forge build && cd ..     # the anvil tests deploy contracts/out
node --import ./lib/monad/client/test/register.mjs --test lib/monad/client/test/*.test.ts
npx tsc --noEmit                          # includes test/wagmi-types.ts (wagmi clients fit ClientContext)
```

`anvil.flow.test.ts` runs on a private anvil (`~/.foundry/bin` or `ANVIL_BIN`): create → parse → read → cancel,
withdrawFor + withdraw, finalize with a re-anchor (`ROOT_MISMATCH`), the reserve rule (anvil does not enforce it, so
the test shows that the helper stops the tx before sending), and the wallet/network/input guards.
`unit.test.ts` checks every ABI entry against `contracts/out`, the deployment copy, the error map and the TR/EN texts.
