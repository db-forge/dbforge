"use client";

import { Bookmark, Check, ChevronLeft, FileQuestion, Play, Video } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { CoverImage } from "@/components/CoverImage";
import { EmptyState } from "@/components/EmptyState";
import { useT } from "@/components/I18nProvider";
import { MonAmount } from "@/components/MonAmount";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/Toaster";
import { AppShell } from "@/components/shell/AppShell";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, MonoLabel, Skeleton } from "@/components/ui/card";
import { getMission, getMySubmissions, registerMission, toggleSave } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { cn, formatMon } from "@/lib/frontend/utils";

export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const { data: mission, loading } = useApi(() => getMission(id), [id]);
  const { data: mySubs } = useApi(() => getMySubmissions(id), [id]);
  const [starting, setStarting] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  if (loading && !mission) {
    return (
      <AppShell title={t.common.mission} backHref="/explore">
        <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
        <Skeleton className="mt-4 h-8 w-2/3" />
        <Skeleton className="mt-3 h-24 w-full" />
      </AppShell>
    );
  }

  if (!mission) {
    return (
      <AppShell title={t.common.mission} backHref="/explore">
        <EmptyState
          icon={FileQuestion}
          title={t.common.missionNotFound}
          description={t.mission.notFoundDesc}
          action={<LinkButton href="/explore">{t.mission.backToExplore}</LinkButton>}
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
        toast({ kind: "success", title: t.post.toastRegistered });
      }
      router.push(`/mission/${mission.id}/capture`);
    } catch (e) {
      toast({ kind: "error", title: t.mission.startFailed, description: (e as Error).message });
      setStarting(false);
    }
  }

  const cta = completed
    ? t.mission.cta.completed
    : limitReached
      ? t.mission.cta.limit
      : starting
        ? t.mission.cta.opening
        : mission.isRegistered
          ? t.mission.cta.resume
          : t.mission.cta.start;

  return (
    <AppShell title={t.common.mission} backHref="/explore" immersive flush>
      {/* Cover / sample video */}
      <div className="relative border-b-[1.5px] border-border bg-bg">
        {showVideo ? (
          <video
            src={mission.sampleVideoUrl}
            poster={mission.coverUrl}
            controls
            autoPlay
            playsInline
            className="aspect-[16/10] w-full bg-bg object-contain"
          />
        ) : (
          <>
            <CoverImage src={mission.coverUrl} alt={mission.title} className="aspect-[16/10] w-full" />
            <button
              onClick={() => setShowVideo(true)}
              className="absolute right-4 bottom-4 inline-flex items-center gap-2 rounded-full border-[1.5px] border-border bg-surface px-3.5 py-1.5 font-mono text-xs hover:bg-border/40"
            >
              <Play className="size-3.5 fill-text" /> {t.mission.sampleClip}
            </button>
          </>
        )}
        <Link
          href="/explore"
          aria-label={t.common.back}
          className="absolute top-4 left-4 grid size-11 place-items-center rounded-full border-[1.5px] border-border bg-surface md:hidden"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <button
          onClick={async () => {
            const saved = await toggleSave(mission.id);
            toast({ kind: "info", title: saved ? t.mission.saved : t.post.toastUnsaved });
          }}
          aria-label={t.common.save}
          className="absolute top-4 right-4 grid size-11 place-items-center rounded-full border-[1.5px] border-border bg-surface hover:bg-border/40"
        >
          <Bookmark className={cn("size-5", mission.isSaved ? "fill-primary text-primary" : "text-muted")} />
        </button>
      </div>

      <div className="space-y-5 px-4 pt-5">
        {/* Title + reward */}
        <div>
          <div className="flex items-center gap-2 text-sm">
            <CompanyAvatar company={mission.company} className="size-6 rounded-md" />
            <span className="font-bold">{mission.company.name}</span>
            <span className={"font-mono text-xs text-link"}>#{t.categories[mission.category]}</span>
            <span className="ml-auto">
              <StatusBadge status={completed ? "completed" : "active"} />
            </span>
          </div>
          <h2 className="mt-3 text-2xl leading-tight font-bold tracking-tight text-text sm:text-3xl">{mission.title}</h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <MonAmount value={mission.rewardMon} size="xl" />
            <span className="text-sm text-muted">{t.mission.perVideo}</span>
          </p>
        </div>

        {/* Overall progress */}
        <div>
          <ProgressBar
            value={mission.acceptedCount}
            max={mission.targetCount}
          />
          <p className="mt-2 text-xs text-muted">
            <b className="text-text tabular-nums">
              {mission.acceptedCount} / {mission.targetCount}
            </b>{" "}
            {t.mission.collected} · {completed ? t.mission.datasetDone : t.common.remaining(remaining)} ·{" "}
            {t.mission.budgetLocked}
          </p>
        </div>

        <p className="text-sm text-muted">{mission.description}</p>

        {/* Criteria */}
        <Card className="p-4">
          <MonoLabel>{t.mission.criteriaTitle}</MonoLabel>
          <ul className="mt-3 space-y-2.5">
            {mission.criteria.map((c) => (
              <li key={c} className="flex items-start gap-2.5 text-sm font-medium">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border-[1.5px] border-primary text-primary">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            {t.mission.requirements(mission.minDurationSec, mission.perUserLimit)}
          </p>
        </Card>

        {/* Personal progress */}
        {mission.isRegistered && (
          <Card className="p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold text-text">{t.common.yourUploads}</span>
              <span className="text-muted tabular-nums">
                {t.common.uploadsOf(mission.myUploads, mission.perUserLimit)}
              </span>
            </div>
            <ProgressBar value={mission.myUploads} max={mission.perUserLimit} size="sm" className="mt-2" />
            <p className="mt-2 flex gap-3 text-xs">
              <span className="text-money">{t.common.acceptedCount(mission.myAccepted)}</span>
              <span className="text-warn">{t.common.reviewingCount(mission.myReviewing)}</span>
              {mission.myEarnedMon > 0 && (
                <span className="ml-auto font-bold text-money">+{formatMon(mission.myEarnedMon)} MON</span>
              )}
            </p>
            {mySubs && mySubs.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-border pt-3">
                {mySubs.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/submission/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm hover:border-primary"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Video className="size-4 shrink-0 text-muted" />
                        <span className="truncate font-mono text-xs">{s.fileName}</span>
                      </span>
                      <StatusBadge status={s.result === null ? "verifying" : s.result} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {/* CTA — fixed on mobile, sticky at the column bottom on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-border bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:sticky md:mt-6 md:border-t-[1.5px]">
        <Button size="lg" className="h-14 w-full text-base font-bold" onClick={start} disabled={starting || completed || limitReached}>
          {cta}
        </Button>
        {!mission.isRegistered && !completed && (
          <p className="mt-2 text-center font-mono text-[11px] text-muted">
            {t.mission.ctaHint(mission.registeredCount, mission.perUserLimit)}
          </p>
        )}
      </div>
    </AppShell>
  );
}
