"use client";

import Link from "next/link";
import { getMissions } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { formatMon } from "@/lib/frontend/utils";
import { CoverImage } from "../CoverImage";
import { MonAmount } from "../MonAmount";
import { ProgressBar } from "../ProgressBar";
import { Skeleton } from "../ui/card";

/** Compact horizontal cards: thumb · title + progress · reward. */
export function LiveMissions() {
  const { data, loading } = useApi(() => getMissions());
  const live = data?.filter((m) => m.status === "active").slice(0, 3);

  return (
    <div className="space-y-4">
      {loading && !live
        ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
        : live?.map((m) => (
            <Link
              key={m.id}
              href={`/mission/${m.id}`}
              className="group flex items-center gap-4 rounded-2xl border-[1.5px] border-line bg-surface p-4 transition-colors hover:border-primary"
            >
              <CoverImage src={m.coverUrl} className="size-18 shrink-0 rounded-xl border-[1.5px] border-sky" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold group-hover:text-accent">{m.title}</p>
                <ProgressBar value={m.acceptedCount} max={m.targetCount} className="mt-2" />
                <p className="mt-1.5 text-xs text-ink/60 tabular-nums">
                  {m.acceptedCount} / {m.targetCount}
                </p>
              </div>
              <MonAmount value={m.rewardMon} size="lg" className="shrink-0 text-2xl" />
            </Link>
          ))}
    </div>
  );
}

/** Hero stats computed from the mission data. */
export function LandingStats() {
  const { data } = useApi(() => getMissions());
  const verified = data?.reduce((n, m) => n + m.acceptedCount, 0);
  const paid = data?.reduce((n, m) => n + m.acceptedCount * m.rewardMon, 0);
  const stats = [
    { value: verified?.toLocaleString("en-US") ?? "–", label: "doğrulanan örnek" },
    { value: paid !== undefined ? `${formatMon(paid, 1)} MON` : "–", label: "katkıcılara ödendi" },
    { value: "~1 sn", label: "ödeme süresi" },
  ];
  return (
    <dl className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-2 rounded-2xl bg-canvas px-4 py-4 text-center sm:rounded-full sm:px-10">
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="sr-only">{s.label}</dt>
          <dd className="text-xl font-bold tracking-tight text-ink tabular-nums sm:text-2xl">{s.value}</dd>
          <p className="text-xs text-accent sm:text-sm">{s.label}</p>
        </div>
      ))}
    </dl>
  );
}
