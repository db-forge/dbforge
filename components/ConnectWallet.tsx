"use client";

import { AlertTriangle, ChevronDown, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { getWallet } from "@/lib/frontend/api";
import { useApi, useDisplayBalance, useIsClient, useWalletStatus } from "@/lib/frontend/hooks";
import { cn, formatMon, shortAddr } from "@/lib/frontend/utils";
import { monadTestnet } from "@/lib/frontend/wagmi";
import { useT } from "./I18nProvider";
import { Button } from "./ui/button";
import { useToast } from "./Toaster";

export function useConnectWallet() {
  const { connectors, mutate: connect, isPending } = useConnect();
  const toast = useToast();
  const t = useT();

  function connectWallet() {
    const hasInjected = typeof window !== "undefined" && "ethereum" in window;
    const connector = connectors.find((c) => (hasInjected ? c.type === "injected" : c.type === "mock"));
    if (!connector) return;
    if (!hasInjected) {
      toast({ kind: "info", title: t.connect.noMetamask, description: t.connect.demoWallet });
    }
    connect(
      { connector, chainId: monadTestnet.id },
      {
        onSuccess: () => toast({ kind: "success", title: t.connect.connected }),
        onError: (e) => toast({ kind: "error", title: t.connect.connectFailed, description: e.message.split("\n")[0] }),
      },
    );
  }

  return { connectWallet, isPending };
}

export function useSwitchToMonad() {
  const { mutate: switchChain, isPending } = useSwitchChain();
  const toast = useToast();
  const t = useT();
  return {
    isPending,
    switchToMonad: () =>
      switchChain(
        { chainId: monadTestnet.id },
        { onError: () => toast({ kind: "error", title: t.connect.switchFailed }) },
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
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!mounted) return <div className={cn("h-10 rounded-xl bg-border/40", compact ? "w-24" : "w-40")} />;

  if (!isConnected) {
    return (
      <button
        onClick={connectWallet}
        disabled={isPending}
        className={cn(
          "inline-flex h-10 shrink-0 items-center gap-2 border-[1.5px] border-border bg-surface px-4 text-sm font-bold hover:bg-border/40 disabled:opacity-50",
          compact ? "rounded-full" : "rounded-xl",
        )}
      >
        <Wallet className="size-4" />
        {isPending ? t.connect.connecting : compact ? t.connect.connectShort : t.connect.connect}
      </button>
    );
  }

  if (wrongNetwork) {
    return (
      <Button variant="danger" onClick={switchToMonad} disabled={switching} size={compact ? "sm" : "md"}>
        <AlertTriangle className="size-4" />
        {compact ? t.connect.switchShort : t.connect.switchToMonad}
      </Button>
    );
  }

  const balance = displayBalance !== null ? formatMon(displayBalance) : "…";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 items-center gap-1.5 border-[1.5px] border-border bg-surface px-3.5 font-mono text-sm hover:bg-border/40",
          compact ? "rounded-full" : "rounded-xl",
        )}
      >
        {!compact && (
          <>
            <span className="max-w-40 truncate">{label ?? shortAddr(address, 4, 4)}</span>
            <span className="text-muted">·</span>
          </>
        )}
        <span className="font-bold text-money tabular-nums">{balance}</span>
        <span className="text-xs font-bold text-money">MON</span>
        {!compact && <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border-[1.5px] border-border bg-surface p-1.5">
          <p className="px-3 pt-1.5 pb-2 font-mono text-[11px] text-muted">{shortAddr(address, 6, 6)}</p>
          <Link
            href="/wallet"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-border/40"
          >
            <Wallet className="size-4" /> {t.connect.myWallet}
          </Link>
          <button
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger hover:bg-danger/15"
          >
            <LogOut className="size-4" /> {t.connect.disconnect}
          </button>
        </div>
      )}
    </div>
  );
}
