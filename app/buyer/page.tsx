"use client";

/* eslint-disable @next/next/no-img-element */
import { Plus } from "lucide-react";
import Link from "next/link";
import { MonAmount } from "@/components/MonAmount";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { BuyerShell } from "@/components/shell/BuyerShell";
import { LinkButton } from "@/components/ui/button";
import { Card, MonoLabel, Skeleton } from "@/components/ui/card";
import { getBuyerMissions } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";

export default function BuyerDashboardPage() {
  const { data: missions, loading } = useApi(getBuyerMissions);

  return (
    <BuyerShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <MonoLabel>Şirket paneli</MonoLabel>
          <h1 className="text-3xl font-bold tracking-tight">Görevlerim</h1>
        </div>
        <LinkButton href="/buyer/new" size="lg">
          <Plus className="size-5" /> Görev oluştur
        </LinkButton>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading && !missions
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)
          : missions?.map((m) => {
              const complete = m.acceptedCount >= m.targetCount;
              return (
                <Link key={m.id} href={`/buyer/missions/${m.id}`} className="group">
                  <Card className="overflow-hidden transition-colors group-hover:border-primary">
                    <img src={m.coverUrl} alt="" className="aspect-[16/9] w-full border-b-[1.5px] border-ink object-cover" />
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-ink/60">{m.company.name}</span>
                        <StatusBadge status={complete ? "completed" : "active"} />
                      </div>
                      <p className="mt-1 truncate text-lg font-bold group-hover:text-primary">{m.title}</p>
                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="font-bold tabular-nums">
                          {m.acceptedCount}
                          <span className="text-ink/40">/{m.targetCount}</span>
                        </span>
                        <MonAmount value={m.acceptedCount * m.rewardMon} size="sm" />
                      </div>
                      <ProgressBar
                        value={m.acceptedCount}
                        max={m.targetCount}
                        size="sm"
                        tone={complete ? "success" : "primary"}
                        className="mt-2"
                      />
                    </div>
                  </Card>
                </Link>
              );
            })}
      </div>
    </BuyerShell>
  );
}
