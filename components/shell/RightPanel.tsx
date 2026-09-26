"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getMissions, getMyRegistrations, getWallet } from "@/lib/frontend/api";
import { useApi, useDisplayBalance } from "@/lib/frontend/hooks";
import { formatMon } from "@/lib/frontend/utils";
import { MonAmount } from "../MonAmount";
import { NetworkPill } from "../NetworkPill";
import { ProgressBar } from "../ProgressBar";
import { useT } from "../I18nProvider";
import { Card, MonoLabel, Skeleton } from "../ui/card";

export function RightPanel() {
  const router = useRouter();
  const t = useT();
  const [q, setQ] = useState("");
  const wallet = useApi(getWallet);
  const balance = useDisplayBalance(wallet.data?.balanceMon);
  const regs = useApi(getMyRegistrations);
  const missions = useApi(() => getMissions());
  const topPaying = missions.data
    ?.filter((m) => m.status === "active")
    .sort((a, b) => b.rewardMon - a.rewardMon)
    .slice(0, 3);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 space-y-4 overflow-y-auto px-5 py-5 lg:block">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/explore?q=${encodeURIComponent(q.trim())}` : "/explore");
        }}
        className="flex h-11 items-center gap-2 rounded-full border-[1.5px] border-border bg-surface px-4 focus-within:border-primary"
      >
        <Search className="size-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.rightPanel.search}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </form>

      <Link href="/wallet" className="block">
        <Card className="border border-primary p-4 transition-colors hover:bg-border/40">
          <div className="flex items-center justify-between">
            <MonoLabel>{t.rightPanel.wallet}</MonoLabel>
            <NetworkPill />
          </div>
          {wallet.loading || !wallet.data ? (
            <Skeleton className="mt-3 h-9 w-40" />
          ) : (
            <>
              <MonAmount value={balance ?? 0} size="lg" className="mt-2 block" />
              <p className="mt-1 text-xs text-muted">
                {t.rightPanel.thisWeek(formatMon(wallet.data.earnedWeekMon), wallet.data.accepted)}
              </p>
            </>
          )}
        </Card>
      </Link>

      <Card className="p-4">
        <h3 className="mb-3 font-bold">{t.rightPanel.myRegistrations}</h3>
        {regs.loading || !regs.data ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : regs.data.active.length === 0 ? (
          <p className="text-sm text-muted">{t.rightPanel.noActive}</p>
        ) : (
          <ul className="space-y-3">
            {regs.data.active.slice(0, 4).map((m) => (
              <li key={m.id}>
                <Link href={`/mission/${m.id}`} className="group block">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-text group-hover:underline">{m.title}</span>
                    <span className="shrink-0 font-mono text-xs text-muted tabular-nums">
                      {m.myUploads}/{m.perUserLimit}
                    </span>
                  </div>
                  <ProgressBar value={m.myUploads} max={m.perUserLimit} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/registered" className="mt-3 inline-block text-sm font-bold text-link underline underline-offset-2">
          {t.common.seeAll}
        </Link>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-bold text-text">{t.rightPanel.topPaying}</h3>
        {!topPaying ? (
          <Skeleton className="h-20" />
        ) : (
          <ol className="space-y-2.5">
            {topPaying.map((m) => (
              <li key={m.id}>
                <Link href={`/mission/${m.id}`} className="group flex items-center justify-between gap-3">
                  <span className="truncate text-sm text-text group-hover:underline">{m.title}</span>
                  <MonAmount value={m.rewardMon} size="sm" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <p className="px-1 font-mono text-[10px] text-muted">DBForge · Monad Testnet · chainId 10143</p>
    </aside>
  );
}
