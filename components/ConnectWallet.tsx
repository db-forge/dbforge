"use client";

import { AlertTriangle, ChevronDown, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { getWallet } from "@/lib/frontend/api";
import { useApi, useDisplayBalance, useIsClient, useWalletStatus } from "@/lib/frontend/hooks";
import { cn, formatMon, shortAddr } from "@/lib/frontend/utils";
import { monadTestnet } from "@/lib/frontend/wagmi";
import { Button } from "./ui/button";
import { useToast } from "./Toaster";

export function useConnectWallet() {
  const { connectors, mutate: connect, isPending } = useConnect();
  const toast = useToast();

  function connectWallet() {
    const hasInjected = typeof window !== "undefined" && "ethereum" in window;
    const connector = connectors.find((c) => (hasInjected ? c.type === "injected" : c.type === "mock"));
    if (!connector) return;
    if (!hasInjected) {
      toast({ kind: "info", title: "MetaMask bulunamadı", description: "Demo cüzdan ile bağlanıldı." });
    }
    connect(
      { connector, chainId: monadTestnet.id },
      {
        onSuccess: () => toast({ kind: "success", title: "Cüzdan bağlandı" }),
        onError: (e) => toast({ kind: "error", title: "Bağlanamadı", description: e.message.split("\n")[0] }),
      },
    );
  }

  return { connectWallet, isPending };
}

export function useSwitchToMonad() {
  const { mutate: switchChain, isPending } = useSwitchChain();
  const toast = useToast();
  return {
    isPending,
    switchToMonad: () =>
      switchChain(
        { chainId: monadTestnet.id },
        { onError: () => toast({ kind: "error", title: "Ağ değiştirilemedi" }) },
      ),
  };
}

/**
 * Header wallet chip. Connected: "0x3f…a91c · 39.00 MON" (or `label` instead of
 * the address, e.g. the company name on buyer pages). `compact` shows balance only.
 */
export function ConnectWallet({ compact = false, label }: { compact?: boolean; label?: string }) {
  const { address, isConnected, wrongNetwork } = useWalletStatus();
  const { connectWallet, isPending } = useConnectWallet();
  const { switchToMonad, isPending: switching } = useSwitchToMonad();
  const { mutate: disconnect } = useDisconnect();
  const { data: wallet } = useApi(getWallet);
  const displayBalance = useDisplayBalance(wallet?.balanceMon);
  const [open, setOpen] = useState(false);
  const mounted = useIsClient();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!mounted) return <div className={cn("h-10 rounded-xl bg-sky/40", compact ? "w-24" : "w-40")} />;

  if (!isConnected) {
    return (
      <button
        onClick={connectWallet}
        disabled={isPending}
        className={cn(
          "inline-flex h-10 shrink-0 items-center gap-2 border-[1.5px] border-line bg-surface px-4 text-sm font-bold hover:bg-ice disabled:opacity-50",
          compact ? "rounded-full" : "rounded-xl",
        )}
      >
        <Wallet className="size-4" />
        {isPending ? "Bağlanıyor…" : compact ? "Bağla" : "Cüzdan bağla"}
      </button>
    );
  }

  if (wrongNetwork) {
    return (
      <Button variant="danger" onClick={switchToMonad} disabled={switching} size={compact ? "sm" : "md"}>
        <AlertTriangle className="size-4" />
        {compact ? "Ağı değiştir" : "Monad Testnet'e geç"}
      </Button>
    );
  }

  const balance = displayBalance !== null ? formatMon(displayBalance) : "…";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 items-center gap-1.5 border-[1.5px] border-line bg-surface px-3.5 font-mono text-sm hover:bg-ice",
          compact ? "rounded-full" : "rounded-xl",
        )}
      >
        {!compact && (
          <>
            <span className="max-w-40 truncate">{label ?? shortAddr(address, 4, 4)}</span>
            <span className="text-ink/40">·</span>
          </>
        )}
        <span className="font-bold text-accent tabular-nums">{balance}</span>
        <span className="text-xs font-bold text-accent">MON</span>
        {!compact && <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border-[1.5px] border-line bg-surface p-1.5">
          <p className="px-3 pt-1.5 pb-2 font-mono text-[11px] text-ink/60">{shortAddr(address, 6, 6)}</p>
          <Link
            href="/wallet"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-ice"
          >
            <Wallet className="size-4" /> Cüzdanım
          </Link>
          <button
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger hover:bg-danger/15"
          >
            <LogOut className="size-4" /> Bağlantıyı kes
          </button>
        </div>
      )}
    </div>
  );
}
