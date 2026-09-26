"use client";

import Link from "next/link";
import { getMissions } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { formatMon } from "@/lib/frontend/utils";
import { CoverImage } from "../CoverImage";
import { useT } from "../I18nProvider";
import { MonAmount } from "../MonAmount";
import { ProgressBar } from "../ProgressBar";
import { Skeleton } from "../ui/card";

/** Compact horizontal cards: thumb · title + progress · reward. */
export function LiveMissions() {
  const { data, loading } = useApi(() => getMissions());
  const live = data?.filter((m) => m.status === "active").slice(0, 3);

  return (
    <div className="space-y-3">
      {loading && !live
        ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)
        : live?.map((m) => (
            <Link
              key={m.id}
              href={`/mission/${m.id}`}
              className="group flex items-center gap-4 rounded-lg border-[1.5px] border-border bg-surface p-4 transition-colors duration-200 hover:border-primary"
            >
              <CoverImage src={m.coverUrl} className="size-18 shrink-0 rounded-md border-[1.5px] border-border" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-text group-hover:underline">{m.title}</p>
                <ProgressBar value={m.acceptedCount} max={m.targetCount} className="mt-2" />
                <p className="mt-1.5 text-xs text-muted tabular-nums">
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
  const t = useT();
  const verified = data?.reduce((n, m) => n + m.acceptedCount, 0);
  const paid = data?.reduce((n, m) => n + m.acceptedCount * m.rewardMon, 0);
  const stats = [
    { value: verified?.toLocaleString("en-US") ?? "–", label: t.landing.stats.verified, color: "text-text" },
    { value: paid !== undefined ? `${formatMon(paid, 1)} MON` : "–", label: t.landing.stats.paid, color: "text-money" },
    { value: t.landing.stats.payoutValue, label: t.landing.stats.payoutTime, color: "text-link" },
  ];
  return (
    <dl className="mt-16 grid grid-cols-3 divide-x-[1.5px] divide-border border-t-[1.5px] border-border pt-6">
      {stats.map((s) => (
        <div key={s.label} className="px-3 first:pl-0 sm:px-6">
          <dt className="sr-only">{s.label}</dt>
          <dd className={`text-xl font-bold tracking-tight tabular-nums sm:text-3xl ${s.color}`}>{s.value}</dd>
          <p className="mt-1 text-xs text-muted sm:text-sm">{s.label}</p>
        </div>
      ))}
    </dl>
  );
}
