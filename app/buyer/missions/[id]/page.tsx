"use client";

/* eslint-disable @next/next/no-img-element */
import { BadgeCheck, Download, ExternalLink, FileQuestion, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MonAmount } from "@/components/MonAmount";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { BuyerShell } from "@/components/shell/BuyerShell";
import { useToast } from "@/components/Toaster";
import { TxHash } from "@/components/TxHash";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, MonoLabel, SectionTitle, Skeleton } from "@/components/ui/card";
import { getBuyerMission } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { CATEGORY_LABELS } from "@/lib/frontend/types";
import { addressUrl, cn, formatMon, shortAddr, timeAgo } from "@/lib/frontend/utils";

function Stat({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <MonoLabel>{label}</MonoLabel>
      <div className="mt-1">{children}</div>
      {sub && <p className="mt-1 font-mono text-xs text-ink/55">{sub}</p>}
    </Card>
  );
}

export default function BuyerMissionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, loading } = useApi(() => getBuyerMission(id), [id]);

  if (loading && !data) {
    return (
      <BuyerShell>
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
      <BuyerShell>
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
  const pct = Math.round((mission.acceptedCount / mission.targetCount) * 100);

  return (
    <BuyerShell>
      {/* Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MonoLabel>
              Görev #{mission.chainMissionId} · #{CATEGORY_LABELS[mission.category].toLocaleLowerCase("tr")}
            </MonoLabel>
            <StatusBadge status={complete ? "completed" : "active"} />
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{mission.title}</h1>
          <p className="mt-1 text-sm text-ink/65">
            {mission.company.name} · {timeAgo(mission.createdAt)} önce yayınlandı · {mission.registeredCount} kişi kayıtlı
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href={`/mission/${mission.id}`} variant="outline">
            Akıştaki post
          </LinkButton>
          <Button
            variant={complete ? "primary" : "outline"}
            disabled={!complete}
            onClick={() => toast({ kind: "info", title: "Dataset hazırlanıyor", description: "İndirme bağlantısı e-postana gönderilecek." })}
          >
            <Download className="size-4" /> Dataset indir
          </Button>
        </div>
      </div>

      {/* Big progress */}
      <Card className={cn("relative mt-6 overflow-hidden p-6 sm:p-8", complete && "border-success")}>
        {complete && (
          <span className="absolute top-5 right-5 inline-flex animate-pop items-center gap-1.5 rounded-full border-[1.5px] border-success bg-success px-3 py-1 font-mono text-xs font-bold tracking-wider text-white">
            <BadgeCheck className="size-4" /> DATASET COMPLETE
          </span>
        )}
        <MonoLabel>Toplanan veri</MonoLabel>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4">
          <p className="text-6xl font-bold tracking-tight tabular-nums sm:text-7xl">
            {mission.acceptedCount}
            <span className="text-ink/30">/{mission.targetCount}</span>
          </p>
          <p className={cn("font-mono text-lg font-bold", complete ? "text-success" : "text-primary")}>%{pct}</p>
        </div>
        <ProgressBar
          value={mission.acceptedCount}
          max={mission.targetCount}
          size="lg"
          tone={complete ? "success" : "primary"}
          className="mt-5 h-5"
        />
        <p className="mt-2 font-mono text-xs text-ink/55">
          {complete
            ? "Hedefe ulaşıldı. Kalan bütçe iade edilebilir."
            : `${mission.targetCount - mission.acceptedCount} video kaldı · ${data.reviewing} video incelemede`}
        </p>
      </Card>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Harcanan bütçe" sub={`/ ${formatMon(data.budgetMon)} MON kilitli`}>
          <MonAmount value={data.spentMon} size="lg" />
        </Stat>
        <Stat label="Kabul" sub={`${formatMon(mission.rewardMon)} MON / video`}>
          <p className="text-3xl font-bold text-success tabular-nums">{data.accepted}</p>
        </Stat>
        <Stat label="Red" sub="ödeme yapılmadı">
          <p className="text-3xl font-bold text-danger tabular-nums">{data.rejected}</p>
        </Stat>
        <Stat label="Ort. kalite" sub="AI skoru">
          <p className="text-3xl font-bold tabular-nums">%{Math.round(data.avgQuality * 100)}</p>
        </Stat>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Submissions table */}
        <Card className="min-w-0 p-0">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <SectionTitle>Gönderimler</SectionTitle>
            <MonoLabel>son {data.submissions.length}</MonoLabel>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-y border-sky bg-ice/60 text-left font-mono text-[11px] uppercase tracking-wider text-ink/60">
                  <th className="px-5 py-2 font-medium">Video</th>
                  <th className="px-3 py-2 font-medium">Adres</th>
                  <th className="px-3 py-2 font-medium">AI skoru</th>
                  <th className="px-3 py-2 font-medium">Durum</th>
                  <th className="px-5 py-2 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s) => (
                  <tr key={s.id} className="border-b border-sky/60 last:border-0 hover:bg-ice/40">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <img
                          src={s.previewUrl}
                          alt=""
                          className="h-12 w-9 rounded-md border-[1.5px] border-ink object-cover"
                        />
                        <span className="font-mono text-xs text-ink/55">{timeAgo(s.createdAt)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <a
                        href={addressUrl(s.contributorAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs hover:text-primary"
                      >
                        {shortAddr(s.contributorAddress)}
                      </a>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-sky/60">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              s.aiScore >= 0.85 ? "bg-success" : s.aiScore >= 0.65 ? "bg-warning" : "bg-danger",
                            )}
                            style={{ width: `${s.aiScore * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs tabular-nums">{(s.aiScore * 100).toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-2.5">
                      {s.txHash ? <TxHash hash={s.txHash} /> : <span className="font-mono text-xs text-ink/35">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Integrity */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-6 text-success" />
              <p className="font-bold">
                Dataset Integrity: <span className="font-mono text-success">VERIFIED</span>
              </p>
            </div>
            <p className="mt-2 text-sm text-ink/70">
              Kabul edilen {data.accepted} videonun hash&apos;leri bir Merkle ağacında birleştirilip Monad&apos;a yazıldı.
            </p>
            <div className="mt-4 rounded-xl border border-sky bg-ice/60 p-3">
              <MonoLabel>Merkle root</MonoLabel>
              <p className="mt-1 font-mono text-xs break-all">{data.merkleRoot}</p>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-ink/60">Zincir</dt>
                <dd className="font-mono text-xs">Monad Testnet · 10143</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink/60">Görev ID</dt>
                <dd className="font-mono text-xs">#{mission.chainMissionId}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink/60">Şirket cüzdanı</dt>
                <dd>
                  <a
                    href={addressUrl(mission.buyerAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                  >
                    {shortAddr(mission.buyerAddress)} <ExternalLink className="size-3" />
                  </a>
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <MonoLabel>Kalan bütçe</MonoLabel>
            <MonAmount value={data.budgetMon - data.spentMon} size="lg" className="mt-1 block" />
            <ProgressBar value={data.spentMon} max={data.budgetMon} size="sm" className="mt-3" />
            <p className="mt-2 font-mono text-xs text-ink/55">
              {formatMon(data.spentMon)} / {formatMon(data.budgetMon)} MON dağıtıldı
            </p>
            <Link href="/buyer/new" className="mt-4 inline-block text-sm font-bold text-primary hover:underline">
              Yeni görev aç →
            </Link>
          </Card>
        </div>
      </div>
    </BuyerShell>
  );
}
