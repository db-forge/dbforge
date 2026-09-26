"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBalance, useChainId, useConnection } from "wagmi";
import { onDataChange } from "./api";
import { monadTestnet } from "./wagmi";

/**
 * Runs an async api.ts call, refetching silently whenever mock data changes.
 * `loading` is only true for the very first load (skeleton state).
 */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refetch = useCallback(async () => {
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refetch();
    return onDataChange(() => {
      refetch();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch, setData };
}

/** Wallet connection state from wagmi, normalized for the UI. */
export function useWalletStatus() {
  const { address, isConnected, status, chainId: connectedChainId } = useConnection();
  const chainId = useChainId();
  const balance = useBalance({ address, chainId: monadTestnet.id, query: { enabled: !!address } });
  return {
    address,
    isConnected,
    isConnecting: status === "connecting" || status === "reconnecting",
    wrongNetwork: isConnected && (connectedChainId ?? chainId) !== monadTestnet.id,
    onchainBalance: balance.data ? Number(balance.data.value) / 1e18 : null,
  };
}
