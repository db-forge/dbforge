# Deploy to Monad Testnet

Owner: Developer 2. Wallets and roles: see [WALLETS.md](./WALLETS.md). Run everything from `contracts/` in Git Bash.

## 1. Addresses

```sh
export ADMIN_ADDRESS=0x9cffc21609F066f863E91e0290E9E31Fd45D4b28      # keystore dbforge-admin
export VERIFIER_ADDRESS=0xE83b50CA5b1b0D281789a1FD13976C449D22558B   # backend (Developer 3)
export GUARDIAN_ADDRESS=<guardian address>                          # optional; without it only the admin can pause
```

The admin needs about **0.7 MON** for the deploy (fork estimate: 3.26M gas, max 0.66 MON).

## 2. Dry run on a fork (no broadcast, no password)

```sh
forge script script/Deploy.s.sol --fork-url https://testnet-rpc.monad.xyz --sender $ADMIN_ADDRESS
```

The script deploys Vault → Factory → `setFactory` → Registry, grants `VERIFIER_ROLE` on both contracts and
`PAUSER_ROLE` to the guardian on both, then checks every wiring and role. A wrong setup reverts before broadcast.

## 3. Real deploy (asks for the keystore password)

```sh
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz \
  --account dbforge-admin --sender $ADMIN_ADDRESS --broadcast
```

Paste the printed `== Logs ==` block to the lead. Tx hashes are in `broadcast/Deploy.s.sol/10143/run-latest.json`
(git-ignored).

## 4. Verify on MonadVision (Sourcify, no API key)

```sh
forge verify-contract <VAULT> src/MissionVault.sol:MissionVault --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(cast abi-encode "constructor(address)" $ADMIN_ADDRESS)
forge verify-contract <FACTORY> src/MissionFactory.sol:MissionFactory --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(cast abi-encode "constructor(address)" <VAULT>)
forge verify-contract <REGISTRY> src/ProvenanceRegistry.sol:ProvenanceRegistry --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --constructor-args $(cast abi-encode "constructor(address,address)" $ADMIN_ADDRESS <VAULT>)
```

## 5. Record

Addresses, deploy tx hashes, block number and chain id go into `contracts/deployments/monad-testnet.json`
(public data, committed). `lib/monad` reads the addresses from config/env.
