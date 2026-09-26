"use client";

import { AlertTriangle, ChevronDown, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { getWallet } from "@/lib/frontend/api";
import { useApi, useWalletStatus } from "@/lib/frontend/hooks";
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

export function ConnectWallet({ compact = false }: { compact?: boolean }) {
  const { address, isConnected, wrongNetwork } = useWalletStatus();
  const { connectWallet, isPending } = useConnectWallet();
  const { switchToMonad, isPending: switching } = useSwitchToMonad();
  const { mutate: disconnect } = useDisconnect();
  const { data: wallet } = useApi(getWallet);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!mounted) return <div className="h-10 w-36 rounded-full bg-sky/40" />;

  if (!isConnected) {
    return (
      <Button onClick={connectWallet} disabled={isPending} size={compact ? "sm" : "md"}>
        <Wallet className="size-4" />
        {isPending ? "Bağlanıyor…" : "Cüzdan bağla"}
      </Button>
    );
  }

  if (wrongNetwork) {
    return (
      <Button variant="danger" onClick={switchToMonad} disabled={switching} size={compact ? "sm" : "md"}>
        <AlertTriangle className="size-4" />
        Monad Testnet&apos;e geç
      </Button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-full border-[1.5px] border-ink bg-white pl-1.5 pr-3 text-sm hover:bg-ice"
      >
        {!compact && (
          <span className="hidden items-center gap-1.5 rounded-full bg-ice px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider sm:flex">
            <span className="size-1.5 rounded-full bg-success" />
            Monad Testnet
          </span>
        )}
        {wallet && (
          <span className="font-bold text-primary tabular-nums">
            {formatMon(wallet.balanceMon)} <span className="text-xs">MON</span>
          </span>
        )}
        <span className="font-mono text-xs">{shortAddr(address, 5, 4)}</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white p-1.5">
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
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger hover:bg-red-50"
          >
            <LogOut className="size-4" /> Bağlantıyı kes
          </button>
        </div>
      )}
    </div>
  );
}
