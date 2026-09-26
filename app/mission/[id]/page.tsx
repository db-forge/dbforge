"use client";

/* eslint-disable @next/next/no-img-element */
import { Bookmark, CheckCircle2, Clock, FileQuestion, Play, Users, Video } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { MonAmount } from "@/components/MonAmount";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/Toaster";
import { AppShell } from "@/components/shell/AppShell";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, MonoLabel, SectionTitle, Skeleton } from "@/components/ui/card";
import { getMission, getMySubmissions, registerMission, toggleSave } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { CATEGORY_LABELS } from "@/lib/frontend/types";
import { cn, timeAgo } from "@/lib/frontend/utils";

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: mission, loading } = useApi(() => getMission(id), [id]);
  const { data: mySubs } = useApi(() => getMySubmissions(id), [id]);
  const [starting, setStarting] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  if (loading && !mission) {
    return (
      <AppShell title="Görev" backHref="/explore">
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        <Skeleton className="mt-4 h-8 w-2/3" />
        <Skeleton className="mt-3 h-24 w-full" />
      </AppShell>
    );
  }

  if (!mission) {
    return (
      <AppShell title="Görev" backHref="/explore">
        <EmptyState
          icon={FileQuestion}
          title="Görev bulunamadı"
          description="Bu görev kaldırılmış veya bağlantı hatalı olabilir."
          action={<LinkButton href="/explore">Keşfet&apos;e dön</LinkButton>}
        />
      </AppShell>
    );
  }

  const completed = mission.status === "completed";
  const limitReached = mission.myUploads >= mission.perUserLimit;
  const remaining = Math.max(0, mission.targetCount - mission.acceptedCount);

  async function start() {
    if (!mission) return;
    setStarting(true);
    try {
      if (!mission.isRegistered) {
        await registerMission(mission.id);
        toast({ kind: "success", title: "Kayıt olundu" });
      }
      router.push(`/mission/${mission.id}/capture`);
    } catch (e) {
      toast({ kind: "error", title: "Başlatılamadı", description: (e as Error).message });
      setStarting(false);
    }
  }

  return (
    <AppShell title="Görev" backHref="/explore">
      <div className="space-y-4">
        {/* Cover / sample video */}
        <div className="relative overflow-hidden rounded-2xl border-[1.5px] border-ink bg-ink">
          {showVideo ? (
            <video
              src={mission.sampleVideoUrl}
              poster={mission.coverUrl}
              controls
              autoPlay
              playsInline
              className="aspect-[4/3] w-full bg-black object-contain"
            />
          ) : (
            <>
              <img src={mission.coverUrl} alt={mission.title} className="aspect-[4/3] w-full object-cover" />
              <button
                onClick={() => setShowVideo(true)}
                className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-white px-3.5 py-1.5 text-sm font-medium hover:bg-ice"
              >
                <Play className="size-4 fill-ink" /> Örnek videoyu izle
              </button>
            </>
          )}
        </div>

        {/* Title block */}
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <Avatar initials={mission.company.initials} />
            <div className="min-w-0 flex-1">
              <p className="font-bold leading-tight">{mission.company.name}</p>
              <p className="font-mono text-xs text-ink/55">
                @{mission.company.handle} · {timeAgo(mission.createdAt)}
              </p>
            </div>
            <StatusBadge status={completed ? "completed" : "active"} />
          </div>
          <span className="mt-4 inline-block rounded-full bg-ice px-2 py-0.5 font-mono text-[11px] text-primary">
            #{CATEGORY_LABELS[mission.category].toLocaleLowerCase("tr")}
          </span>
          <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{mission.title}</h2>
          <p className="mt-2 text-ink/75">{mission.description}</p>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-xl border-[1.5px] border-sky bg-ice/60 p-4">
            <div>
              <MonoLabel>Video başı ödül</MonoLabel>
              <MonAmount value={mission.rewardMon} size="xl" className="block" />
            </div>
            <div className="flex gap-5 text-sm">
              <div>
                <MonoLabel className="block">Kişi başı</MonoLabel>
                <b>{mission.perUserLimit} video</b>
              </div>
              <div>
                <MonoLabel className="block">Min süre</MonoLabel>
                <b>{mission.minDurationSec} sn</b>
              </div>
              <div>
                <MonoLabel className="block">Kayıtlı</MonoLabel>
                <b>{mission.registeredCount}</b>
              </div>
            </div>
          </div>
        </Card>

        {/* Progress */}
        <Card className="p-5">
          <div className="flex items-end justify-between">
            <div>
              <MonoLabel>Genel ilerleme</MonoLabel>
              <p className="text-3xl font-bold tabular-nums">
                {mission.acceptedCount}
                <span className="text-ink/40">/{mission.targetCount}</span>
              </p>
            </div>
            <p className="font-mono text-xs text-ink/60">
              {completed ? "Dataset tamamlandı" : `${remaining} video kaldı`}
            </p>
          </div>
          <ProgressBar
            value={mission.acceptedCount}
            max={mission.targetCount}
            size="lg"
            tone={completed ? "success" : "primary"}
            className="mt-3"
          />

          {mission.isRegistered && (
            <div className="mt-5 border-t border-sky pt-4">
              <div className="flex items-center justify-between text-sm">
                <span>
                  Senin yüklemen{" "}
                  <b className="tabular-nums">
                    {mission.myUploads}/{mission.perUserLimit}
                  </b>
                </span>
                <span className="flex gap-3 font-mono text-xs">
                  <span className="text-success">{mission.myAccepted} kabul</span>
                  <span className="text-warning">{mission.myReviewing} inceleme</span>
                </span>
              </div>
              <ProgressBar value={mission.myUploads} max={mission.perUserLimit} size="sm" className="mt-2" />
              {mySubs && mySubs.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {mySubs.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/submission/${s.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-sky bg-white px-3 py-2 text-sm hover:border-primary"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Video className="size-4 shrink-0 text-ink/50" />
                          <span className="truncate font-mono text-xs">{s.fileName}</span>
                        </span>
                        <StatusBadge
                          status={s.result === null ? "verifying" : s.result}
                          className="shrink-0"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        {/* Criteria */}
        <Card className="p-5">
          <SectionTitle>Kabul kriterleri</SectionTitle>
          <ul className="mt-3 space-y-2.5">
            {mission.criteria.map((c) => (
              <li key={c} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-ice px-3 py-2 text-xs text-ink/70">
            <Clock className="size-3.5" />
            AI doğrulaması ~3 saniye sürer, kabul edilen videoya ödeme anında cüzdanına gönderilir.
          </div>
        </Card>

        {/* CTA */}
        <div className="sticky bottom-20 z-10 md:bottom-4">
          <div className="flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-white p-1.5">
            <Button
              size="lg"
              className="flex-1"
              onClick={start}
              disabled={starting || completed || limitReached}
            >
              <Video className="size-5" />
              {completed
                ? "Görev tamamlandı"
                : limitReached
                  ? "Yükleme limitine ulaştın"
                  : starting
                    ? "Açılıyor…"
                    : mission.isRegistered
                      ? "Kayda devam et"
                      : "Kaydı başlat"}
            </Button>
            <button
              onClick={async () => {
                const saved = await toggleSave(mission.id);
                toast({ kind: "info", title: saved ? "Kaydedildi" : "Kaydedilenlerden çıkarıldı" });
              }}
              aria-label="Kaydet"
              className="grid size-12 shrink-0 place-items-center rounded-full border-[1.5px] border-ink hover:bg-ice"
            >
              <Bookmark className={cn("size-5", mission.isSaved && "fill-primary text-primary")} />
            </button>
          </div>
          {!mission.isRegistered && !completed && (
            <p className="mt-2 flex items-center justify-center gap-1 font-mono text-[11px] text-ink/55">
              <Users className="size-3" /> Kayıt ol ve {mission.perUserLimit} videoya kadar yükle
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
