"use client";

import { BadgeCheck, Check, Contrast, Download, FileQuestion, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CoverImage } from "@/components/CoverImage";
import { EmptyState } from "@/components/EmptyState";
import { useT } from "@/components/I18nProvider";
import { ProgressBar } from "@/components/ProgressBar";
import { BuyerShell } from "@/components/shell/BuyerShell";
import { useToast } from "@/components/Toaster";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, MonoLabel, Skeleton } from "@/components/ui/card";
import { getBuyerMission } from "@/lib/frontend/api";
import { cancelMissionTx } from "@/lib/frontend/chain";
import { useApi } from "@/lib/frontend/hooks";
import type { VerifyResult } from "@/lib/frontend/types";
import { addressUrl, cn, formatMon, shortAddr, txUrl } from "@/lib/frontend/utils";

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{children}</div>
    </Card>
  );
}

function RowStatus({ status, rewardMon }: { status: VerifyResult; rewardMon: number }) {
  const t = useT();
  if (status === "accepted")
    return (
      <span className="inline-flex items-center gap-1.5 font-bold text-money">
        <Check className="size-4" strokeWidth={3} /> {t.buyer.paid(formatMon(rewardMon))}
      </span>
    );
  if (status === "review")
    return (
      <span className="inline-flex items-center gap-1.5 font-bold text-warn">
        <Contrast className="size-4" /> {t.buyer.reviewing}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 font-bold text-danger">
      <X className="size-4" strokeWidth={3} /> {t.buyer.rejected}
    </span>
  );
}

export default function BuyerMissionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const t = useT();
  const { data, loading } = useApi(() => getBuyerMission(id), [id]);
  const [cancelling, setCancelling] = useState(false);

  if (loading && !data) {
    return (
      <BuyerShell crumb={<Link href="/buyer" className="hover:text-link">{t.common.myMissions}</Link>}>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-72 w-full rounded-2xl" />
      </BuyerShell>
    );
  }

  if (!data) {
    return (
      <BuyerShell crumb={<Link href="/buyer" className="hover:text-link">{t.common.myMissions}</Link>}>
        <EmptyState
          icon={FileQuestion}
          title={t.common.missionNotFound}
          action={<LinkButton href="/buyer">{t.buyer.backToList}</LinkButton>}
        />
      </BuyerShell>
    );
  }

  const { mission } = data;
  const complete = mission.acceptedCount >= mission.targetCount;
  const remaining = mission.targetCount - mission.acceptedCount;

  async function cancel() {
    if (!data) return;
    setCancelling(true);
    const refund = data.budgetMon - data.spentMon;
    const res = await cancelMissionTx({ missionId: mission.id }, () => {});
    setCancelling(false);
    if (res.stage === "success")
      toast({ kind: "success", title: t.buyer.refunded(formatMon(refund)), description: `tx ${shortAddr(res.hash)}` });
    else toast({ kind: "error", title: t.buyer.cancelFailed, description: res.error });
  }

  return (
    <BuyerShell crumb={<Link href="/buyer" className="hover:text-link">{t.common.myMissions}</Link>}>
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <MonoLabel className="text-sm">{t.buyer.missionNo(mission.chainMissionId)}</MonoLabel>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{mission.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {complete ? (
            <span className="inline-flex h-9 animate-pop items-center gap-1.5 rounded-full border-[1.5px] border-money bg-transparent px-3.5 font-mono text-xs font-bold tracking-wider text-money">
              <BadgeCheck className="size-4" /> DATASET COMPLETE
            </span>
          ) : (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-primary bg-surface px-3.5 text-sm font-bold text-text">
              <span className="size-2 animate-pulse rounded-full bg-primary" /> {t.status.active}
            </span>
          )}
          <Button variant="outline" onClick={cancel} disabled={cancelling || complete} className="h-10 rounded-xl">
            {cancelling && <Loader2 className="size-4 animate-spin" />}
            {t.buyer.cancelRefund}
          </Button>
        </div>
      </div>

      {/* Progress */}
      <Card className={cn("mt-5 p-5", complete && "border-money")}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-bold">
            <span className="text-2xl tabular-nums">
              {mission.acceptedCount} / {mission.targetCount}
            </span>{" "}
            {t.buyer.accepted}
          </p>
          <p className="text-sm text-muted">
            {complete ? t.buyer.targetReached : t.buyer.remainingReviewing(remaining, data.reviewing)}
          </p>
        </div>
        <ProgressBar
          value={mission.acceptedCount}
          max={mission.targetCount}
          className="mt-3 h-3"
        />
      </Card>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t.buyer.stats.spent}>
          <span className="text-money">
            {formatMon(data.spentMon, 1)} / {formatMon(data.budgetMon, 0)} MON
          </span>
        </Stat>
        <Stat label={t.buyer.stats.accepted}>{data.accepted}</Stat>
        <Stat label={t.buyer.stats.rejected}>{data.rejected}</Stat>
        <Stat label={t.buyer.stats.quality}>
          <span className="text-text">{Math.round(data.avgQuality * 100)}%</span>
        </Stat>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Submissions table */}
        <Card className="min-w-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b-[1.5px] border-border text-left font-mono text-[11px] tracking-wider text-muted uppercase">
                  <th className="px-5 py-3 font-medium">{t.buyer.table.clip}</th>
                  <th className="px-3 py-3 font-medium">{t.buyer.table.contributor}</th>
                  <th className="px-3 py-3 font-medium">{t.buyer.table.aiScore}</th>
                  <th className="px-3 py-3 font-medium">{t.buyer.table.status}</th>
                  <th className="px-5 py-3 font-medium">{t.buyer.table.tx}</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s) => (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-border/40">
                    <td className="px-5 py-2.5">
                      <CoverImage src={s.previewUrl} label={t.cover.clip} className="h-9 w-14 rounded-lg border border-border" />
                    </td>
                    <td className="px-3 py-2.5">
                      <a
                        href={addressUrl(s.contributorAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[13px] hover:text-link"
                      >
                        {shortAddr(s.contributorAddress, 4, 4)}
                      </a>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{Math.round(s.aiScore * 100)}%</td>
                    <td className="px-3 py-2.5">
                      <RowStatus status={s.status} rewardMon={mission.rewardMon} />
                    </td>
                    <td className="px-5 py-2.5">
                      {s.txHash ? (
                        <a
                          href={txUrl(s.txHash)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[13px] text-link underline underline-offset-2"
                        >
                          {shortAddr(s.txHash, 5, 2)}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.submissions.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted">{t.buyer.noSubmissions}</p>
          )}
        </Card>

        {/* Integrity */}
        <Card className="flex flex-col border border-primary p-5 lg:self-start">
          <MonoLabel>{t.buyer.integrity}</MonoLabel>
          <p className="mt-2 text-3xl font-bold tracking-tight text-money">{data.merkleRoot ? t.buyer.verified : t.buyer.waiting}</p>
          <p className="mt-2 text-sm text-muted">
            {data.merkleRoot
              ? t.buyer.integrityDone
              : t.buyer.integrityPending}
          </p>
          <div className="mt-4 rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-xs break-all">
            merkle root {data.merkleRoot || "—"}
          </div>
          <Button
            size="lg"
            className="mt-4 w-full rounded-xl font-bold"
            onClick={() =>
              toast({
                kind: "info",
                title: t.buyer.preparing,
                description: t.buyer.preparingDesc(data.accepted),
              })
            }
          >
            <Download className="size-4" /> {t.buyer.download}
          </Button>
          {complete ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-money">
              <BadgeCheck className="size-4" /> DATASET COMPLETE · {mission.targetCount}/{mission.targetCount}
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted">
              {t.buyer.completeHint(mission.targetCount)}
            </p>
          )}
          <div className="mt-4 flex justify-between border-t border-border pt-3 text-xs">
            <Link href={`/mission/${mission.id}`} className="font-bold text-link hover:underline">
              {t.buyer.postInFeed}
            </Link>
            <Link href="/buyer/new" className="font-bold text-link hover:underline">
              {t.buyer.newMission}
            </Link>
          </div>
        </Card>
      </div>
    </BuyerShell>
  );
}
