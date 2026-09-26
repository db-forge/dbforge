// Frontend-side wagmi config. Contract helpers live in lib/monad (teammate);
// this file only handles wallet connection for the UI.
import { createConfig, http } from "wagmi";
import { injected, mock } from "wagmi/connectors";
import { defineChain } from "viem";
import { DEMO_USER_ADDRESS } from "@/lib/mock/store";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://testnet.monadscan.com" },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [
    injected({ shimDisconnect: true }),
    // Fallback for demos on machines without MetaMask.
    mock({ accounts: [DEMO_USER_ADDRESS as `0x${string}`], features: { reconnect: true } }),
  ],
  transports: { [monadTestnet.id]: http("https://testnet-rpc.monad.xyz") },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
