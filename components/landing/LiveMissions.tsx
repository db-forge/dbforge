"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getMissions } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { Avatar } from "../Avatar";
import { MonAmount } from "../MonAmount";
import { ProgressBar } from "../ProgressBar";
import { Card, Skeleton } from "../ui/card";

export function LiveMissions() {
  const { data, loading } = useApi(() => getMissions());
  const live = data?.filter((m) => m.status === "active").slice(0, 3);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {loading && !live
        ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-96 rounded-2xl" />)
        : live?.map((m) => (
            <Link key={m.id} href={`/mission/${m.id}`} className="group">
              <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-primary">
                <div className="relative">
                  <img src={m.coverUrl} alt="" className="aspect-[4/3] w-full border-b-[1.5px] border-ink object-cover" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-white px-2.5 py-0.5 font-mono text-[11px] font-bold">
                    <span className="size-1.5 animate-pulse rounded-full bg-success" /> CANLI
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center gap-2">
                    <Avatar initials={m.company.initials} className="size-7 text-[10px]" />
                    <span className="truncate text-sm font-medium">{m.company.name}</span>
                  </div>
                  <p className="mt-2 text-lg leading-snug font-bold group-hover:text-primary">{m.title}</p>
                  <div className="mt-auto pt-4">
                    <div className="flex items-baseline justify-between">
                      <MonAmount value={m.rewardMon} size="lg" />
                      <span className="font-mono text-xs text-ink/60 tabular-nums">
                        {m.acceptedCount}/{m.targetCount}
                      </span>
                    </div>
                    <ProgressBar value={m.acceptedCount} max={m.targetCount} size="sm" className="mt-2" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
    </div>
  );
}
