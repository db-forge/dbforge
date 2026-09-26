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
    <div className="space-y-4">
      {loading && !live
        ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
        : live?.map((m) => (
            <Link
              key={m.id}
              href={`/mission/${m.id}`}
              className="group flex items-center gap-4 rounded-2xl border-[1.5px] border-border bg-surface p-4 transition-transform hover:-translate-y-0.5 hover:border-primary"
            >
              <CoverImage src={m.coverUrl} className="size-18 shrink-0 rounded-xl border-[1.5px] border-border" />
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
    <dl className="mx-auto mt-10 grid max-w-3xl grid-cols-3 gap-2 rounded-2xl bg-bg px-4 py-4 text-center sm:rounded-full sm:px-10">
      {stats.map((s) => (
        <div key={s.label}>
          <dt className="sr-only">{s.label}</dt>
          <dd className={`text-xl font-bold tracking-tight tabular-nums sm:text-2xl ${s.color}`}>{s.value}</dd>
          <p className="text-xs text-muted sm:text-sm">{s.label}</p>
        </div>
      ))}
    </dl>
  );
}
