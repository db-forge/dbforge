"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBalance, useChainId, useConnection } from "wagmi";
import { onDataChange } from "./api";
import { IS_LIVE } from "./config";
import { monadTestnet } from "./wagmi";

/**
 * Runs an async api.ts call, refetching silently whenever mock data changes.
 * `loading` is true until the first result for the current deps arrives
 * (skeleton state); background refetches keep showing the previous data.
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const key = JSON.stringify(deps);
  const [result, setResult] = useState<{ key: string; data: T | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });
  const fnRef = useRef(fn);
  const keyRef = useRef(key);

  useEffect(() => {
    fnRef.current = fn;
    keyRef.current = key;
  });

  const refetch = useCallback(async () => {
    const k = keyRef.current;
    try {
      const data = await fnRef.current();
      if (k === keyRef.current) setResult({ key: k, data, error: null });
    } catch (e) {
      if (k === keyRef.current)
        setResult((prev) => ({ ...prev, key: k, error: e instanceof Error ? e.message : "Bir hata oluştu" }));
    }
  }, []);

  useEffect(() => {
    keyRef.current = key;
    refetch();
    return onDataChange(() => {
      refetch();
    });
  }, [key, refetch]);

  return {
    data: result.data,
    loading: result.key !== key,
    error: result.error,
    refetch,
  };
}

const noopSubscribe = () => () => {};

/** False during SSR/hydration, true after — avoids wallet UI hydration mismatches. */
export function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Wallet connection state from wagmi, normalized for the UI. */
export function useWalletStatus() {
  const { address, isConnected, status, chainId: connectedChainId, connector } = useConnection();
  const chainId = useChainId();
  const balance = useBalance({ address, chainId: monadTestnet.id, query: { enabled: !!address } });
  return {
    address,
    isConnected,
    connectorName: connector?.name,
    isConnecting: status === "connecting" || status === "reconnecting",
    wrongNetwork: isConnected && (connectedChainId ?? chainId) !== monadTestnet.id,
    onchainBalance: balance.data ? Number(balance.data.value) / 1e18 : null,
  };
}

/**
 * Balance to show in the UI. Mock mode: the mock wallet balance. Live mode:
 * the real on-chain MON balance of the connected wallet (falls back to mock).
 */
export function useDisplayBalance(mockBalance: number | null | undefined) {
  const { onchainBalance } = useWalletStatus();
  if (IS_LIVE && onchainBalance !== null) return onchainBalance;
  return mockBalance ?? null;
}
