"use client";

import { ArrowRight, Bookmark, Check, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { registerMission, toggleSave } from "@/lib/frontend/api";
import { CATEGORY_LABELS, type MissionPost } from "@/lib/frontend/types";
import { CATEGORY_TEXT } from "@/lib/frontend/tones";
import { cn, timeAgo } from "@/lib/frontend/utils";
import { Avatar } from "./Avatar";
import { CoverImage } from "./CoverImage";
import { MonAmount } from "./MonAmount";
import { ProgressBar } from "./ProgressBar";
import { useToast } from "./Toaster";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/card";

export function MissionPostCard({
  mission,
  preview = false,
  className,
}: {
  mission: MissionPost;
  /** Static rendering for the buyer "live preview" — actions do nothing. */
  preview?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const remaining = Math.max(0, mission.targetCount - mission.acceptedCount);
  const completed = mission.status === "completed";
  const detailHref = preview ? "#" : `/mission/${mission.id}`;

  async function onRegister() {
    if (preview || mission.isRegistered || busy) return;
    setBusy(true);
    try {
      await registerMission(mission.id);
      toast({ kind: "success", title: "Kayıt olundu", description: `${mission.title} görevine katıldın.` });
    } catch (e) {
      toast({ kind: "error", title: "Kayıt başarısız", description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (preview) return;
    const saved = await toggleSave(mission.id);
    toast({ kind: "info", title: saved ? "Kaydedilenlere eklendi" : "Kaydedilenlerden çıkarıldı" });
  }

  return (
    <article
      className={cn(
        "flex gap-3 px-4 py-4",
        preview ? "rounded-2xl border-[1.5px] border-line bg-surface" : "border-b-[1.5px] border-sky bg-canvas",
        className,
      )}
    >
      <Avatar initials={mission.company.initials} colorKey={mission.company.handle} className="size-11" />
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pt-0.5">
            <p className="text-[15px] leading-tight">
              <span className="font-bold">{mission.company.name}</span>{" "}
              <span className="text-ink/55">
                @{mission.company.handle} · {preview ? "şimdi" : timeAgo(mission.createdAt)}
              </span>
            </p>
            <p className={cn("mt-0.5 font-mono text-xs", CATEGORY_TEXT[mission.category])}>#{CATEGORY_LABELS[mission.category]}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="inline-flex items-center gap-1 text-xs text-ink/60">
              <Users className="size-3" />
              {mission.registeredCount} kişi kayıtlı
            </span>
            {completed ? (
              <span className="inline-flex h-8 items-center rounded-full border-[1.5px] border-success px-3 text-sm font-bold text-success">
                Tamamlandı
              </span>
            ) : mission.isRegistered ? (
              <span className="inline-flex h-8 animate-pop items-center gap-1 rounded-full border-[1.5px] border-pink bg-surface px-3.5 text-sm font-bold text-pink">
                Kayıtlı <Check className="size-4" />
              </span>
            ) : (
              <Button variant="pink" size="sm" onClick={onRegister} disabled={busy} className="font-bold">
                Kayıt ol
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <Link href={detailHref} className="group mt-2 block">
          <h3 className="text-lg font-bold leading-snug group-hover:text-accent">{mission.title}</h3>
          <div className="mt-3 overflow-hidden rounded-2xl border-[1.5px] border-line">
            <CoverImage
              src={mission.coverUrl}
              alt={mission.title}
              className="aspect-[16/9] w-full transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
        </Link>

        {/* Personal progress — only after registering */}
        {mission.isRegistered && !completed && (
          <div className="mt-3 animate-toast-in rounded-xl border-[1.5px] border-pink/50 bg-surface px-3.5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-bold">Senin yüklemen</span>
                  <span className="tabular-nums">
                    {mission.myUploads} / {mission.perUserLimit} video
                  </span>
                </div>
                <ProgressBar value={mission.myUploads} max={mission.perUserLimit} size="sm" tone="pink" />
              </div>
              {mission.myUploads < mission.perUserLimit ? (
                <Link
                  href={preview ? "#" : `/mission/${mission.id}/capture`}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-pink underline underline-offset-2"
                >
                  Kayda başla <ArrowRight className="size-4" />
                </Link>
              ) : (
                <span className="shrink-0 font-mono text-xs text-success">Limit doldu</span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <MonAmount value={mission.rewardMon} size="md" />
            <span className="text-sm">{remaining} kaldı</span>
          </div>
          <button
            onClick={onSave}
            aria-label={mission.isSaved ? "Kaydedilenlerden çıkar" : "Kaydet"}
            className="-mr-2 grid size-9 place-items-center rounded-full hover:bg-ice"
          >
            <Bookmark className={cn("size-5", mission.isSaved ? "fill-lemon text-lemon" : "text-ink")} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function MissionPostCardSkeleton() {
  return (
    <div className="flex gap-3 border-b-[1.5px] border-sky bg-canvas px-4 py-4">
      <Skeleton className="size-11 rounded-full" />
      <div className="flex-1">
        <div className="flex justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-5 w-2/3" />
        <Skeleton className="mt-3 aspect-[16/9] w-full rounded-2xl" />
        <Skeleton className="mt-4 h-6 w-32" />
      </div>
    </div>
  );
}
