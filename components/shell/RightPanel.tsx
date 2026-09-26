"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getMyRegistrations, getTopPayers, getWallet } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { formatMon } from "@/lib/frontend/utils";
import { Avatar } from "../Avatar";
import { MonAmount } from "../MonAmount";
import { ProgressBar } from "../ProgressBar";
import { Card, MonoLabel, Skeleton } from "../ui/card";

export function RightPanel() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const wallet = useApi(getWallet);
  const regs = useApi(getMyRegistrations);
  const payers = useApi(getTopPayers);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[340px] shrink-0 space-y-4 overflow-y-auto px-5 py-5 lg:block">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/explore?q=${encodeURIComponent(q.trim())}` : "/explore");
        }}
        className="flex h-11 items-center gap-2 rounded-full border-[1.5px] border-ink bg-white px-4 focus-within:border-primary"
      >
        <Search className="size-4 text-ink/60" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Görev veya şirket ara"
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink/45"
        />
      </form>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <MonoLabel>Cüzdan</MonoLabel>
          <Link href="/wallet" className="text-xs font-medium text-primary hover:underline">
            Detay
          </Link>
        </div>
        {wallet.loading || !wallet.data ? (
          <Skeleton className="mt-3 h-9 w-40" />
        ) : (
          <>
            <MonAmount value={wallet.data.balanceMon} size="lg" className="mt-2 block" />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ["Kazanç", `${formatMon(wallet.data.earnedMon)}`],
                ["Kabul", wallet.data.accepted],
                ["Bekleyen", wallet.data.reviewing],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-ice px-2 py-2">
                  <p className="text-sm font-bold tabular-nums">{value}</p>
                  <p className="font-mono text-[10px] uppercase text-ink/60">{label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold">Kayıtlı işlemlerim</h3>
          <Link href="/registered" className="text-xs font-medium text-primary hover:underline">
            Tümü
          </Link>
        </div>
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
                    <span className="truncate font-medium group-hover:text-primary">{m.title}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums">
                      {m.myUploads}/{m.perUserLimit}
                    </span>
                  </div>
                  <ProgressBar value={m.myUploads} max={m.perUserLimit} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-bold">En çok ödeyenler</h3>
        {payers.loading || !payers.data ? (
          <Skeleton className="h-24" />
        ) : (
          <ol className="space-y-3">
            {payers.data.map((p, i) => (
              <li key={p.company.handle} className="flex items-center gap-3">
                <span className="w-4 font-mono text-xs text-ink/50">{i + 1}</span>
                <Avatar initials={p.company.initials} className="size-8 text-[11px]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.company.name}</p>
                  <p className="font-mono text-[11px] text-ink/55">{p.missions} görev</p>
                </div>
                <MonAmount value={p.paidMon} size="sm" digits={1} />
              </li>
            ))}
          </ol>
        )}
      </Card>

      <p className="px-1 font-mono text-[10px] text-ink/45">DBForge · Monad Testnet · chainId 10143</p>
    </aside>
  );
}
