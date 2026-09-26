// Type-only check (runs under `npx tsc --noEmit`): the clients wagmi hands out fit ClientContext unchanged.
import { createConfig, http } from "wagmi";
import { getPublicClient, getWalletClient } from "wagmi/actions";
import { monadTestnet } from "viem/chains";
import { loadClientConfig, readContributorBalance, withdraw, type ClientContext } from "../index";

const wagmiConfig = createConfig({ chains: [monadTestnet], transports: { [monadTestnet.id]: http() } });

export async function _typecheck(): Promise<void> {
  const ctx: ClientContext = {
    publicClient: getPublicClient(wagmiConfig),
    walletClient: await getWalletClient(wagmiConfig),
    config: loadClientConfig(),
  };
  await readContributorBalance(ctx, "0x0000000000000000000000000000000000000001");
  await withdraw(ctx);
}
