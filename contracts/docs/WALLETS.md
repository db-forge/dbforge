# DBForge — Wallets and keys (Monad Testnet)

Owner: Developer 2. Read this before G5 (deploy). Nothing here needs a private key in the repo.

## Why several wallets

- **Security (ARCHITECTURE §2, G4 F2):** the admin key must not be the buyer key, and the verifier key lives on the backend server.
- **Monad reserve balance (G1):** an EOA whose **value spend** would leave it below **10 MON** has that tx reverted
  (it still pays gas). Only the buyer sends value, so only the buyer needs the 10 MON cushion.
- **Gas is charged on the gas limit.** Wallets that only send txs (admin, verifier, guardian) need a few MON for gas.

## Plan for the 50 test MON

| Wallet | Who holds the key | Where the key lives | MON | Sends value? | Used for |
|---|---|---|---|---|---|
| **Buyer** | Developer 2 | MetaMask (your existing 50 MON wallet) | ~36 after transfers | Yes (`createMission`) | Demo buyer. Keep ≥ 10 MON after every funding tx. |
| **Admin** | Developer 2 | Foundry keystore `dbforge-admin` | 5 | No | Deploy, grant roles, `setFactory`, `unpause`. Not used day to day. |
| **Guardian** | Another team member (e.g. Developer 1) | Their own wallet | 1 | No | `PAUSER_ROLE` only — emergency brake. |
| **Verifier** | Developer 3 (backend) | Backend server env `MONAD_VERIFIER_PRIVATE_KEY` | 5 | No | `approveSubmission`, `anchorDataset`, `withdrawFor`. |
| **Contributor (demo)** | Demo phone | MetaMask mobile | 0 | No | Shows that a gas-less contributor gets paid via `withdrawFor`. |
| **Contributor 2 (optional)** | Developer 2 | MetaMask | 1 | No | Shows self-service `withdraw()`. |

Total sent out: 5 + 1 + 5 + 1 = 12 MON. Buyer keeps ~38 MON, enough for several 2 MON demo missions.

## Setup steps

### 1. Admin keystore (Developer 2, your machine, Git Bash)

```sh
cast wallet new                                  # prints a new address + private key — do not paste it anywhere
cast wallet import dbforge-admin --interactive   # paste the private key, choose a password
cast wallet address --account dbforge-admin      # note the address
```

The keystore file is in `~/.foundry/keystores/`. It is encrypted and never goes into the repo.
Deploy commands use `--account dbforge-admin` and ask for the password.

### 2. Verifier key (Developer 3 creates it — the key never leaves the backend)

Developer 3 runs `cast wallet new` (or any wallet tool) on the backend machine, stores the private key only in
the server env as `MONAD_VERIFIER_PRIVATE_KEY`, and sends **only the address** to Developer 2.
The deploy script grants `VERIFIER_ROLE` to that address on the Vault **and** the Registry.

### 3. Guardian address

The guardian sends Developer 2 **only the address**. The deploy script grants `PAUSER_ROLE` on both contracts
to the guardian and to the admin.

### 4. Fund the wallets from the buyer wallet (MetaMask)

Send 5 MON → admin, 5 MON → verifier, 1 MON → guardian, (optional) 1 MON → contributor 2.
Each send is a value spend: the buyer wallet stays far above 10 MON, so no revert.

Check balances:

```sh
cast balance <address> --rpc-url https://testnet-rpc.monad.xyz --ether
```

### 5. Values the deploy (G5) needs

```
ADMIN      = <dbforge-admin address>
VERIFIER   = <address from Developer 3>
GUARDIAN   = <address from the guardian>
```

Addresses are public; they can go into `contracts/deployments/monad-testnet.json` after deploy.

## Rules

- Never paste a private key into chat, an issue, a commit, a screenshot or an AI prompt.
- Never commit `.env`, `.env.local` or keystore files (`contracts/.gitignore` already ignores `.env`).
- If the verifier key may have leaked: guardian or admin calls `pause()` on Vault and Registry →
  admin revokes `VERIFIER_ROLE` on both → Developer 3 creates a new key → admin grants the new address → `unpause()`.
