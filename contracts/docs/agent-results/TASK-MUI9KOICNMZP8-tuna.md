# TASK-MUI9KOICNMZP8 (G1) — Monad Testnet + Foundry research · tuna

The researcher (kira) pane crashed on startup twice (exit code 1, no output), so the lead did this task.

## 1. What was done
Read the official Monad docs (docs.monad.xyz, fetched 2026-09-26), called the public testnet RPC,
checked the local toolchain and checked viem's built-in chain definition.

### Network (source: https://docs.monad.xyz/developer-essentials/testnet , /ai/current-facts)
| Field | Value |
|---|---|
| Chain ID | `10143` |
| Currency | `MON` (18 decimals) |
| Public RPC | `https://testnet-rpc.monad.xyz` (QuickNode, 50 rps; 25 rps for `eth_call`/`eth_estimateGas`) |
| Other RPCs | `https://rpc.ankr.com/monad_testnet` (no archive), `https://rpc-testnet.monadinfra.com` (20 rps, no batch) |
| Explorers | https://testnet.monadvision.com , https://testnet.monadscan.com |
| Faucet | https://faucet.monad.xyz |
| Version | v0.16.2 / revision `MONAD_TEN`. Testnet was re-genesised on 2025-12-16. |
| Block time / finality (mainnet figures) | ~300 ms blocks; speculative finality 1 slot, full finality 2 slots (~600 ms) |
| Per-tx gas limit | 30M |

### Gas model (source: /developer-essentials/gas-pricing, /developer-essentials/differences)
- **Gas is charged on the gas LIMIT, not on gas used:** "The gas charged for a transaction is the gas limit set in the transaction".
  Total debit = `value + gas_bid * gas_limit`.
- Minimum base fee: **100 MON-gwei**. Observed `eth_gasPrice` = `0x17bfac7c00` = **102 gwei**.
- Consequence for `lib/monad`: always estimate gas and send an explicit, tight `gas` value
  (e.g. estimate × 1.15), never a large fixed limit.
- Rough cost at 102 gwei: a 150k-gas-limit `approveSubmission` ≈ 0.015 MON; a 3–4M-gas deploy ≈ 0.3–0.4 MON.
  50 MON is more than enough.

### Reserve Balance — IMPORTANT (source: /developer-essentials/reserve-balance)
- `user_reserve_balance = 10 MON` per EOA.
- An EOA transaction **reverts at execution** if its **value spend** leaves the EOA's balance below 10 MON
  (it still pays gas). Exception: an undelegated EOA may "empty" below the reserve once every k=3 blocks.
- Only EOAs are affected. Contract → contributor transfers from the Vault are not "value spend" of an EOA.
- Impact on us:
  - **Buyer wallet:** `createMission{value}` is a value spend. Keep ≥ 10 MON left after funding
    (demo: buyer holds ~30 MON, funds 2 MON).
  - **Verifier wallet:** value = 0, spends gas only → fine even with a small balance.
  - **Contributor:** only receives → not affected.
  - Consensus-time gas budget for in-flight txs is `min(10 MON, balance)`; a verifier sending many
    approvals quickly should keep a few MON so rapid txs are not delayed.

### Other EVM differences (source: /developer-essentials/differences)
- Max contract size 128 KB (initcode 256 KB) — no size concern for us.
- Linear memory pricing, page-based storage warming (128 slots per page), repriced opcodes.
- No EIP-4844 blob txs. EIP-7702 delegated EOAs have a 10 MON floor.

### Foundry (source: /tooling-and-infra/toolkits/foundry, /guides/deploy-smart-contract/foundry, getfoundry.sh)
- **Foundry v1.8.0 or later is required** ("releases before v1.8 do not include Monad execution support").
- `foundry.toml`: `network = "monad"`, `eth-rpc-url = "https://testnet-rpc.monad.xyz"`, `chain_id = 10143`.
  Local tests then use Monad's gas model and opcode pricing. Forking testnet auto-selects the hardfork.
- Template option: `forge init --template monad-developers/foundry-monad`.
- Deploy with a **keystore**, not a raw private key: `cast wallet import monad-deployer --interactive`
  then `forge script ... --account monad-deployer --broadcast`.
- Verify on MonadVision (Sourcify, no API key):
  `forge verify-contract <addr> <Name> --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/`
  Monadscan alternative: `--verifier etherscan --etherscan-api-key <KEY> --watch`.
- **Windows:** foundryup needs **Git Bash or WSL** (PowerShell/cmd not supported); or download
  precompiled binaries from https://github.com/foundry-rs/foundry/releases and add them to PATH.

### viem
- viem **2.56.9** (repo version = npm latest) exports `monadTestnet` (`id: 10_143`, RPC `https://testnet-rpc.monad.xyz`).
- Its `blockExplorers` points to the old `testnet.monadexplorer.com`, and `multicall3.blockCreated: 251449`
  predates the 2025-12-16 re-genesis. Recommendation: spread it and override the explorer:
  `{ ...monadTestnet, blockExplorers: { default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' } } }`.

### Solidity / EVM target (recommendation, confirmed in G3)
- Pin `solc = "0.8.28"` (no floating pragma), `evm_version = "cancun"`.
- Gate: G3 must run the test suite with `network = "monad"` **and** a fork test against the testnet RPC.
  If the fork test fails on an opcode, drop to `evm_version = "paris"`.

### OpenZeppelin without a root `.gitmodules`
- Not verified yet (Foundry is not installed). Two options for G3, checked with `forge install --help` after install:
  1. **Soldeer (built into forge):** `forge soldeer install @openzeppelin-contracts~5.x` → deps in
     `contracts/dependencies/`, pinned by `contracts/soldeer.lock`; `dependencies/` goes to `contracts/.gitignore`.
  2. `forge install --no-git OpenZeppelin/openzeppelin-contracts` (vendored copy, must be committed).
- Preference: Soldeer (lockfile, small diff, nothing outside `contracts/`).

## 2. Evidence
```
$ curl -X POST https://testnet-rpc.monad.xyz -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
{"jsonrpc":"2.0","id":1,"result":"0x279f"}          # 0x279f = 10143
$ ... "method":"eth_gasPrice" ...
{"jsonrpc":"2.0","result":"0x17bfac7c00","id":2}    # 102,000,000,000 wei = 102 gwei
$ forge --version
bash: forge: command not found                        # Foundry NOT installed
$ node --version
v24.15.0
$ unpkg viem@2.56.9/_esm/chains/definitions/monadTestnet.js
export const monadTestnet = defineChain({ id: 10_143, name: 'Monad Testnet', ... })
```

## 3. Changed files
- `contracts/docs/agent-results/TASK-MUI9KOICNMZP8-tuna.md` (this report). No code.

## 4. Risks
- Foundry is missing on this machine; G3 is blocked until it is installed (needs the boss's OK).
- Reserve balance can make a buyer's funding tx revert if the buyer wallet goes below 10 MON.
- Public RPC rate limit (25 rps for estimateGas) — fine for the demo, not for load tests.

## 5. Open questions
- Install Foundry now (Git Bash `curl -L https://foundry.paradigm.xyz | bash && foundryup`)? Needs approval.
- How to split the 50 MON: suggestion — deployer/buyer 35, verifier 5, second buyer/test 10.

## 6. Next step
- Fold the network, gas and reserve-balance notes into ARCHITECTURE.md (§0).
- After Foundry is installed and ARCHITECTURE.md is approved → G3.

**Platform:** checked on Windows 11 (Git Bash). Docs findings are platform-independent.
