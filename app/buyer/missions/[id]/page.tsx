"use client";

import { BadgeCheck, Check, Contrast, Download, FileQuestion, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CoverImage } from "@/components/CoverImage";
import { EmptyState } from "@/components/EmptyState";
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
      <p className="text-sm text-ink/65">{label}</p>
      <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{children}</div>
    </Card>
  );
}

function RowStatus({ status, rewardMon }: { status: VerifyResult; rewardMon: number }) {
  if (status === "accepted")
    return (
      <span className="inline-flex items-center gap-1.5 font-bold text-success">
        <Check className="size-4" strokeWidth={3} /> Ödendi {formatMon(rewardMon)}
      </span>
    );
  if (status === "review")
    return (
      <span className="inline-flex items-center gap-1.5 font-bold text-warning">
        <Contrast className="size-4" /> İnceleniyor
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 font-bold text-danger">
      <X className="size-4" strokeWidth={3} /> Reddedildi
    </span>
  );
}

export default function BuyerMissionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, loading } = useApi(() => getBuyerMission(id), [id]);
  const [cancelling, setCancelling] = useState(false);

  if (loading && !data) {
    return (
      <BuyerShell crumb={<Link href="/buyer" className="hover:text-accent">Görevlerim</Link>}>
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
      <BuyerShell crumb={<Link href="/buyer" className="hover:text-accent">Görevlerim</Link>}>
        <EmptyState
          icon={FileQuestion}
          title="Görev bulunamadı"
          action={<LinkButton href="/buyer">Görevlerime dön</LinkButton>}
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
      toast({ kind: "success", title: `${formatMon(refund)} MON iade edildi`, description: `tx ${shortAddr(res.hash)}` });
    else toast({ kind: "error", title: "İptal başarısız", description: res.error });
  }

  return (
    <BuyerShell crumb={<Link href="/buyer" className="hover:text-accent">Görevlerim</Link>}>
      {/* Title row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <MonoLabel className="text-sm">Görev #{mission.chainMissionId}</MonoLabel>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{mission.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {complete ? (
            <span className="inline-flex h-9 animate-pop items-center gap-1.5 rounded-full border-[1.5px] border-success bg-success px-3.5 font-mono text-xs font-bold tracking-wider text-white">
              <BadgeCheck className="size-4" /> DATASET COMPLETE
            </span>
          ) : (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-pink bg-surface px-3.5 text-sm font-bold text-pink">
              <span className="size-2 animate-pulse rounded-full bg-pink" /> Aktif
            </span>
          )}
          <Button variant="outline" onClick={cancel} disabled={cancelling || complete} className="h-10 rounded-xl">
            {cancelling && <Loader2 className="size-4 animate-spin" />}
            İptal et &amp; iade
          </Button>
        </div>
      </div>

      {/* Progress */}
      <Card className={cn("mt-5 p-5", complete && "border-success")}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-bold">
            <span className="text-2xl tabular-nums">
              {mission.acceptedCount} / {mission.targetCount}
            </span>{" "}
            kabul
          </p>
          <p className="text-sm text-ink/65">
            {complete ? "Hedefe ulaşıldı" : `${remaining} kaldı · ${data.reviewing} incelemede`}
          </p>
        </div>
        <ProgressBar
          value={mission.acceptedCount}
          max={mission.targetCount}
          tone={complete ? "success" : "lemon"}
          className="mt-3 h-3"
        />
      </Card>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Harcanan bütçe">
          <span className="text-lemon">
            {formatMon(data.spentMon, 1)} / {formatMon(data.budgetMon, 0)} MON
          </span>
        </Stat>
        <Stat label="Kabul">{data.accepted}</Stat>
        <Stat label="Red">{data.rejected}</Stat>
        <Stat label="Ort. kalite">
          <span className="text-pink">{Math.round(data.avgQuality * 100)}%</span>
        </Stat>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Submissions table */}
        <Card className="min-w-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b-[1.5px] border-line text-left font-mono text-[11px] tracking-wider text-ink/60 uppercase">
                  <th className="px-5 py-3 font-medium">Klip</th>
                  <th className="px-3 py-3 font-medium">Katkıcı</th>
                  <th className="px-3 py-3 font-medium">AI skoru</th>
                  <th className="px-3 py-3 font-medium">Durum</th>
                  <th className="px-5 py-3 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s) => (
                  <tr key={s.id} className="border-b border-sky last:border-0 hover:bg-ice/40">
                    <td className="px-5 py-2.5">
                      <CoverImage src={s.previewUrl} label="klip" className="h-9 w-14 rounded-lg border border-sky" />
                    </td>
                    <td className="px-3 py-2.5">
                      <a
                        href={addressUrl(s.contributorAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[13px] hover:text-accent"
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
                          className="font-mono text-[13px] text-accent underline underline-offset-2"
                        >
                          {shortAddr(s.txHash, 5, 2)}
                        </a>
                      ) : (
                        <span className="text-ink/35">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.submissions.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-ink/60">Henüz gönderim yok.</p>
          )}
        </Card>

        {/* Integrity */}
        <Card className="flex flex-col border-primary bg-primary p-5 text-white lg:self-start">
          <MonoLabel className="text-white/70">Dataset integrity</MonoLabel>
          <p className="mt-2 text-3xl font-bold tracking-tight text-lemon">{data.merkleRoot ? "VERIFIED" : "BEKLİYOR"}</p>
          <p className="mt-2 text-sm text-white/80">
            {data.merkleRoot
              ? "Kabul edilen her klibin hash'i Monad'a yazılır. Ham videolar zincir dışında kalır."
              : "Ödenen klipler birikince dataset manifesti ve merkle root oluşturulur."}
          </p>
          <div className="mt-4 rounded-xl bg-black/30 px-3 py-2.5 font-mono text-xs break-all">
            merkle root {data.merkleRoot || "—"}
          </div>
          <Button
            variant="lemon"
            size="lg"
            className="mt-4 w-full rounded-xl font-bold"
            onClick={() =>
              toast({
                kind: "info",
                title: "Dataset hazırlanıyor",
                description: `${data.accepted} klip + manifest.json indirilecek.`,
              })
            }
          >
            <Download className="size-4" /> Dataset indir
          </Button>
          {complete ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-lemon">
              <BadgeCheck className="size-4" /> DATASET COMPLETE · {mission.targetCount}/{mission.targetCount}
            </p>
          ) : (
            <p className="mt-3 text-xs text-white/70">
              {mission.targetCount}/{mission.targetCount} olduğunda &ldquo;DATASET COMPLETE&rdquo; olarak işaretlenir.
            </p>
          )}
          <div className="mt-4 flex justify-between border-t border-white/20 pt-3 text-xs">
            <Link href={`/mission/${mission.id}`} className="font-bold hover:underline">
              Akıştaki post →
            </Link>
            <Link href="/buyer/new" className="font-bold hover:underline">
              Yeni görev aç →
            </Link>
          </div>
        </Card>
      </div>
    </BuyerShell>
  );
}
