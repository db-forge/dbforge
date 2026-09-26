"use client";

import { AlertTriangle, Copy, ExternalLink, Receipt, Wallet } from "lucide-react";
import { useConnectWallet, useSwitchToMonad } from "@/components/ConnectWallet";
import { EmptyState } from "@/components/EmptyState";
import { MonAmount } from "@/components/MonAmount";
import { StatusBadge } from "@/components/StatusBadge";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/Toaster";
import { TxHash } from "@/components/TxHash";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, MonoLabel, SectionTitle, Skeleton } from "@/components/ui/card";
import { getWallet } from "@/lib/frontend/api";
import { useApi, useIsClient, useWalletStatus } from "@/lib/frontend/hooks";
import { addressUrl, formatMon, timeAgo } from "@/lib/frontend/utils";

export default function WalletPage() {
  const isClient = useIsClient();
  const toast = useToast();
  const { address, isConnected, isConnecting, wrongNetwork, onchainBalance } = useWalletStatus();
  const { connectWallet, isPending } = useConnectWallet();
  const { switchToMonad, isPending: switching } = useSwitchToMonad();
  const { data: wallet, loading } = useApi(getWallet);

  if (!isClient || isConnecting) {
    return (
      <AppShell title="Cüzdan">
        <Skeleton className="h-48 rounded-2xl" />
      </AppShell>
    );
  }

  if (!isConnected) {
    return (
      <AppShell title="Cüzdan">
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full border-[1.5px] border-ink bg-ice">
            <Wallet className="size-6 text-primary" />
          </div>
          <p className="mt-4 text-xl font-bold">Cüzdanını bağla</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink/70">
            Kabul edilen her video için ödemeler Monad Testnet üzerinden doğrudan bu cüzdana gönderilir.
          </p>
          <Button size="lg" className="mt-6" onClick={connectWallet} disabled={isPending}>
            <Wallet className="size-5" /> {isPending ? "Bağlanıyor…" : "MetaMask'ı bağla"}
          </Button>
          <p className="mt-3 font-mono text-[11px] text-ink/50">Monad Testnet · chainId 10143 · MON</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Cüzdan">
      <div className="space-y-4">
        {wrongNetwork && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[1.5px] border-warning bg-amber-50 p-4">
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

        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <MonoLabel>Adres</MonoLabel>
            <StatusBadge status="network" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 font-mono text-sm break-all">{address}</p>
            <button
              aria-label="Adresi kopyala"
              onClick={() => {
                navigator.clipboard?.writeText(address ?? "");
                toast({ kind: "info", title: "Adres kopyalandı" });
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ice"
            >
              <Copy className="size-4" />
            </button>
            <a
              href={addressUrl(address ?? "")}
              target="_blank"
              rel="noreferrer"
              aria-label="Explorer'da aç"
              className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-ice"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>

          <div className="mt-6">
            <MonoLabel>Bakiye</MonoLabel>
            {loading && !wallet ? (
              <Skeleton className="mt-1 h-12 w-48" />
            ) : (
              <MonAmount value={wallet?.balanceMon ?? 0} size="xl" className="block" />
            )}
            <p className="mt-1 font-mono text-xs text-ink/55">
              Toplam kazanç {formatMon(wallet?.earnedMon ?? 0)} MON
              {onchainBalance !== null && ` · zincir bakiyesi ${formatMon(onchainBalance, 4)} MON`}
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Gönderim", value: wallet?.submitted, className: "" },
            { label: "Kabul", value: wallet?.accepted, className: "text-success" },
            { label: "Red", value: wallet?.rejected, className: "text-danger" },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <MonoLabel>{s.label}</MonoLabel>
              <p className={`text-3xl font-bold tabular-nums ${s.className}`}>{s.value ?? "–"}</p>
            </Card>
          ))}
        </div>

        <Card className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>Son ödemeler</SectionTitle>
            {!!wallet?.reviewing && (
              <span className="font-mono text-xs text-warning">{wallet.reviewing} ödeme bekliyor</span>
            )}
          </div>
          {loading && !wallet ? (
            <Skeleton className="h-32" />
          ) : !wallet?.payments.length ? (
            <EmptyState
              icon={Receipt}
              title="Henüz ödeme yok"
              description="İlk videon kabul edildiğinde ödeme burada görünür."
              action={<LinkButton href="/explore">Görevlere göz at</LinkButton>}
              className="border-0 py-8"
            />
          ) : (
            <ul className="divide-y divide-sky">
              {wallet.payments.map((p) => (
                <li key={p.hash} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.missionTitle}</p>
                    <div className="flex items-center gap-2">
                      <TxHash hash={p.hash} />
                      <span className="font-mono text-[11px] text-ink/50">{timeAgo(p.createdAt)}</span>
                    </div>
                  </div>
                  <MonAmount value={p.amountMon} sign size="md" className="shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
