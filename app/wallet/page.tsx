"use client";

import { AlertTriangle, Copy, ExternalLink, Receipt, Wallet } from "lucide-react";
import { useConnectWallet, useSwitchToMonad } from "@/components/ConnectWallet";
import { EmptyState } from "@/components/EmptyState";
import { MonAmount } from "@/components/MonAmount";
import { NetworkPill } from "@/components/NetworkPill";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/Toaster";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, SectionTitle, Skeleton } from "@/components/ui/card";
import { getWallet } from "@/lib/frontend/api";
import { useApi, useIsClient, useWalletStatus } from "@/lib/frontend/hooks";
import { addressUrl, formatMon, shortAddr, timeAgo, txUrl } from "@/lib/frontend/utils";

export default function WalletPage() {
  const isClient = useIsClient();
  const toast = useToast();
  const { address, isConnected, isConnecting, wrongNetwork, onchainBalance, connectorName } = useWalletStatus();
  const { connectWallet, isPending } = useConnectWallet();
  const { switchToMonad, isPending: switching } = useSwitchToMonad();
  const { data: wallet, loading } = useApi(getWallet);

  if (!isClient || isConnecting) {
    return (
      <AppShell title="Cüzdan" actions={<NetworkPill />}>
        <Skeleton className="h-48 rounded-2xl" />
      </AppShell>
    );
  }

  if (!isConnected) {
    return (
      <AppShell title="Cüzdan" actions={<NetworkPill />}>
        <Card className="mt-2 p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full border-[1.5px] border-line bg-ice">
            <Wallet className="size-6 text-accent" />
          </div>
          <p className="mt-4 text-xl font-bold">Cüzdanını bağla</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink/70">
            Kabul edilen her video için ödemeler Monad Testnet üzerinden doğrudan bu cüzdana gönderilir.
          </p>
          <Button size="lg" className="mt-6 h-14 w-full max-w-xs text-base font-bold" onClick={connectWallet} disabled={isPending}>
            <Wallet className="size-5" /> {isPending ? "Bağlanıyor…" : "MetaMask'ı bağla"}
          </Button>
          <p className="mt-3 font-mono text-[11px] text-ink/50">Monad Testnet · chainId 10143 · MON</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Cüzdan" actions={<NetworkPill />}>
      <div className="space-y-4">
        {wrongNetwork && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[1.5px] border-warning bg-warning/15 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
              <div>
                <p className="font-bold">Yanlış ağdasın</p>
                <p className="text-sm text-ink/70">Ödemeleri almak için Monad Testnet&apos;e geç.</p>
              </div>
            </div>
            <Button onClick={switchToMonad} disabled={switching}>
              Monad Testnet&apos;e geç
            </Button>
          </div>
        )}

        <Card className="border-primary bg-primary p-5 text-white sm:p-6">
          <div className="flex items-center gap-1">
            <p className="min-w-0 truncate font-mono text-sm text-white/80">
              {shortAddr(address, 4, 4)} · {connectorName ?? "Cüzdan"}
            </p>
            <button
              aria-label="Adresi kopyala"
              onClick={() => {
                navigator.clipboard?.writeText(address ?? "");
                toast({ kind: "info", title: "Adres kopyalandı" });
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/20"
            >
              <Copy className="size-3.5" />
            </button>
            <a
              href={addressUrl(address ?? "")}
              target="_blank"
              rel="noreferrer"
              aria-label="Explorer'da aç"
              className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/20"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          {loading && !wallet ? (
            <Skeleton className="mt-2 h-14 w-48 bg-white/20" />
          ) : (
            <MonAmount value={wallet?.balanceMon ?? 0} size="xl" className="mt-1 block text-6xl text-white" />
          )}
          <p className="mt-2 text-white/85">
            Bu hafta <b className="text-white">+{formatMon(wallet?.earnedWeekMon ?? 0)} MON</b> kazandın
          </p>
          {onchainBalance !== null && (
            <p className="mt-1 font-mono text-[11px] text-white/60">zincir bakiyesi {formatMon(onchainBalance, 4)} MON</p>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {[
              { label: "gönderim", value: wallet?.submitted, className: "" },
              { label: "kabul", value: wallet?.accepted, className: "" },
              { label: "red", value: wallet?.rejected, className: "" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-black/25 px-2 py-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${s.className}`}>{s.value ?? "–"}</p>
                <p className="text-xs text-white/75">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <SectionTitle>Son ödemeler</SectionTitle>
            {!!wallet?.reviewing && (
              <span className="font-mono text-xs text-warning">{wallet.reviewing} ödeme bekliyor</span>
            )}
          </div>
          {loading && !wallet ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : !wallet?.payments.length ? (
            <EmptyState
              icon={Receipt}
              title="Henüz ödeme yok"
              description="İlk videon kabul edildiğinde ödeme burada görünür."
              action={<LinkButton href="/explore">Görevlere göz at</LinkButton>}
            />
          ) : (
            <Card>
              <ul className="divide-y divide-sky">
                {wallet.payments.map((p) => (
                  <li key={p.hash} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{p.missionTitle}</p>
                      <a
                        href={txUrl(p.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-accent underline underline-offset-2"
                      >
                        tx {shortAddr(p.hash, 4, 2)} · {timeAgo(p.createdAt)}
                      </a>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-accent tabular-nums">
                      +{formatMon(p.amountMon)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
