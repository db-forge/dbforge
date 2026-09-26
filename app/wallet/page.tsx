"use client";

import { AlertTriangle, Copy, ExternalLink, Receipt, Wallet } from "lucide-react";
import { useConnectWallet, useSwitchToMonad } from "@/components/ConnectWallet";
import { EmptyState } from "@/components/EmptyState";
import { useT } from "@/components/I18nProvider";
import { MonAmount } from "@/components/MonAmount";
import { NetworkPill } from "@/components/NetworkPill";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/Toaster";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, SectionTitle, Skeleton } from "@/components/ui/card";
import { getWallet } from "@/lib/frontend/api";
import { useApi, useDisplayBalance, useIsClient, useWalletStatus } from "@/lib/frontend/hooks";
import { addressUrl, formatMon, shortAddr, timeAgo, txUrl } from "@/lib/frontend/utils";

export default function WalletPage() {
  const isClient = useIsClient();
  const toast = useToast();
  const t = useT();
  const { address, isConnected, isConnecting, wrongNetwork, onchainBalance, connectorName } = useWalletStatus();
  const { connectWallet, isPending } = useConnectWallet();
  const { switchToMonad, isPending: switching } = useSwitchToMonad();
  const { data: wallet, loading } = useApi(getWallet);
  const balance = useDisplayBalance(wallet?.balanceMon);

  if (!isClient || isConnecting) {
    return (
      <AppShell title={t.wallet.title} actions={<NetworkPill />}>
        <Skeleton className="h-48 rounded-2xl" />
      </AppShell>
    );
  }

  if (!isConnected) {
    return (
      <AppShell title={t.wallet.title} actions={<NetworkPill />}>
        <Card className="mt-2 p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full border-[1.5px] border-border bg-surface">
            <Wallet className="size-6 text-primary" />
          </div>
          <p className="mt-4 text-xl font-bold">{t.wallet.connectTitle}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {t.wallet.connectDesc}
          </p>
          <Button size="lg" className="mt-6 h-14 w-full max-w-xs text-base font-bold" onClick={connectWallet} disabled={isPending}>
            <Wallet className="size-5" /> {isPending ? t.connect.connecting : t.wallet.connectMetamask}
          </Button>
          <p className="mt-3 font-mono text-[11px] text-muted">Monad Testnet · chainId 10143 · MON</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title={t.wallet.title} actions={<NetworkPill />}>
      <div className="space-y-4">
        {wrongNetwork && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[1.5px] border-warn bg-warn/15 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />
              <div>
                <p className="font-bold">{t.wallet.wrongNetwork}</p>
                <p className="text-sm text-muted">{t.wallet.wrongNetworkDesc}</p>
              </div>
            </div>
            <Button onClick={switchToMonad} disabled={switching}>
              {t.connect.switchToMonad}
            </Button>
          </div>
        )}

        <Card className="border border-primary p-5 sm:p-6">
          <div className="flex items-center gap-1">
            <p className="min-w-0 truncate font-mono text-sm text-muted">
              {shortAddr(address, 4, 4)} · {connectorName ?? t.wallet.title}
            </p>
            <button
              aria-label={t.wallet.copyAddress}
              onClick={() => {
                navigator.clipboard?.writeText(address ?? "");
                toast({ kind: "info", title: t.wallet.copied });
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-border/40"
            >
              <Copy className="size-3.5" />
            </button>
            <a
              href={addressUrl(address ?? "")}
              target="_blank"
              rel="noreferrer"
              aria-label={t.common.openOnExplorer}
              className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-border/40"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          {loading && !wallet ? (
            <Skeleton className="mt-2 h-14 w-48" />
          ) : (
            <MonAmount value={balance ?? 0} size="xl" className="mt-1 block text-6xl" />
          )}
          <p className="mt-2 text-muted">
            {t.wallet.earnedBefore}
            <b className="text-money">+{formatMon(wallet?.earnedWeekMon ?? 0)} MON</b>
            {t.wallet.earnedAfter}
          </p>
          {onchainBalance !== null && (
            <p className="mt-1 font-mono text-[11px] text-muted">{t.wallet.onchain(formatMon(onchainBalance, 4))}</p>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {[
              { label: t.wallet.stats.submitted, value: wallet?.submitted, className: "" },
              { label: t.wallet.stats.accepted, value: wallet?.accepted, className: "" },
              { label: t.wallet.stats.rejected, value: wallet?.rejected, className: "" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-bg px-2 py-3 text-center">
                <p className={`text-2xl font-bold tabular-nums ${s.className}`}>{s.value ?? "–"}</p>
                <p className="text-xs text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <SectionTitle>{t.wallet.recentPayments}</SectionTitle>
            {!!wallet?.reviewing && (
              <span className="font-mono text-xs text-warn">{t.wallet.pending(wallet.reviewing)}</span>
            )}
          </div>
          {loading && !wallet ? (
            <Skeleton className="h-32 rounded-2xl" />
          ) : !wallet?.payments.length ? (
            <EmptyState
              icon={Receipt}
              title={t.wallet.noPayments}
              description={t.wallet.noPaymentsDesc}
              action={<LinkButton href="/explore">{t.common.browseMissions}</LinkButton>}
            />
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {wallet.payments.map((p) => (
                  <li key={p.hash} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{p.missionTitle}</p>
                      <a
                        href={txUrl(p.hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-link underline underline-offset-2"
                      >
                        tx {shortAddr(p.hash, 4, 2)} · {timeAgo(p.createdAt, t.time)}
                      </a>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-money tabular-nums">
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
