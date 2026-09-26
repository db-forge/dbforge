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
import { Card, MonoLabel, Skeleton } from "../ui/card";

export function RightPanel() {
  const router = useRouter();
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
        className="flex h-11 items-center gap-2 rounded-full border-[1.5px] border-line bg-surface px-4 focus-within:border-primary"
      >
        <Search className="size-4 text-ink/60" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Görev ara"
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink/45"
        />
      </form>

      <Link href="/wallet" className="block">
        <Card className="border-primary bg-primary p-4 text-white transition-colors hover:bg-[#a73ff0]">
          <div className="flex items-center justify-between">
            <MonoLabel className="text-white/75">Cüzdan</MonoLabel>
            <NetworkPill className="border-white/70 text-white" />
          </div>
          {wallet.loading || !wallet.data ? (
            <Skeleton className="mt-3 h-9 w-40 bg-white/20" />
          ) : (
            <>
              <MonAmount value={balance ?? 0} size="lg" className="mt-2 block" />
              <p className="mt-1 text-xs text-white/80">
                Bu hafta +{formatMon(wallet.data.earnedWeekMon)} · {wallet.data.accepted} kabul
              </p>
            </>
          )}
        </Card>
      </Link>

      <Card className="p-4">
        <h3 className="mb-3 font-bold">Kayıtlı işlemlerim</h3>
        {regs.loading || !regs.data ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : regs.data.active.length === 0 ? (
          <p className="text-sm text-ink/60">Henüz aktif kaydın yok. Akıştan bir göreve kayıt ol.</p>
        ) : (
          <ul className="space-y-3">
            {regs.data.active.slice(0, 4).map((m) => (
              <li key={m.id}>
                <Link href={`/mission/${m.id}`} className="group block">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium group-hover:text-accent">{m.title}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      {m.myUploads}/{m.perUserLimit}
                    </span>
                  </div>
                  <ProgressBar value={m.myUploads} max={m.perUserLimit} size="sm" tone="pink" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/registered" className="mt-3 inline-block text-sm font-bold text-pink underline underline-offset-2">
          Tümünü gör
        </Link>
      </Card>

      <Card className="border-lemon bg-lemon p-4 text-black">
        <h3 className="mb-3 font-bold">En çok ödeyenler</h3>
        {!topPaying ? (
          <Skeleton className="h-20 bg-black/10" />
        ) : (
          <ol className="space-y-2.5">
            {topPaying.map((m) => (
              <li key={m.id}>
                <Link href={`/mission/${m.id}`} className="group flex items-center justify-between gap-3">
                  <span className="truncate text-sm group-hover:underline">{m.title}</span>
                  <MonAmount value={m.rewardMon} size="sm" className="text-black" />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <p className="px-1 font-mono text-[10px] text-ink/45">DBForge · Monad Testnet · chainId 10143</p>
    </aside>
  );
}
