"use client";

/* eslint-disable @next/next/no-img-element */
import { ArrowRight, Bookmark, Check, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { registerMission, toggleSave } from "@/lib/frontend/api";
import { CATEGORY_LABELS, type MissionPost } from "@/lib/frontend/types";
import { cn, timeAgo } from "@/lib/frontend/utils";
import { Avatar } from "./Avatar";
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
    <article className={cn("rounded-2xl border-[1.5px] border-ink bg-white p-4 sm:p-5", className)}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar initials={mission.company.initials} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm leading-tight">
            <span className="truncate font-bold">{mission.company.name}</span>
            <span className="truncate font-mono text-xs text-ink/55">
              @{mission.company.handle} · {preview ? "şimdi" : timeAgo(mission.createdAt)}
            </span>
          </div>
          <span className="mt-1 inline-block rounded-full bg-ice px-2 py-0.5 font-mono text-[11px] text-primary">
            #{CATEGORY_LABELS[mission.category].toLocaleLowerCase("tr")}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {completed ? (
            <span className="rounded-full border-[1.5px] border-success px-3 py-1 text-xs font-bold text-success">
              Tamamlandı
            </span>
          ) : mission.isRegistered ? (
            <span className="inline-flex h-8 animate-pop items-center gap-1 rounded-full border-[1.5px] border-primary bg-ice px-3.5 text-sm font-medium text-primary">
              Kayıtlı <Check className="size-4" />
            </span>
          ) : (
            <Button size="sm" onClick={onRegister} disabled={busy}>
              Kayıt ol
            </Button>
          )}
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink/60">
            <Users className="size-3" />
            {mission.registeredCount} kişi kayıtlı
          </span>
        </div>
      </div>

      {/* Body */}
      <Link href={detailHref} className="group mt-3 block">
        <h3 className="text-lg font-bold leading-snug group-hover:text-primary">{mission.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-ink/70">{mission.description}</p>
        <div className="mt-3 overflow-hidden rounded-xl border-[1.5px] border-ink bg-ice">
          <img
            src={mission.coverUrl}
            alt={mission.title}
            className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      </Link>

      {/* Personal progress — only after registering */}
      {mission.isRegistered && !completed && (
        <div className="mt-3 animate-toast-in rounded-xl border-[1.5px] border-sky bg-ice/60 p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>
              Senin yüklemen{" "}
              <b className="tabular-nums">
                {mission.myUploads}/{mission.perUserLimit}
              </b>{" "}
              video
            </span>
            {mission.myUploads < mission.perUserLimit ? (
              <Link
                href={preview ? "#" : `/mission/${mission.id}/capture`}
                className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
              >
                Kayda başla <ArrowRight className="size-4" />
              </Link>
            ) : (
              <span className="font-mono text-xs text-success">Limit doldu</span>
            )}
          </div>
          <ProgressBar value={mission.myUploads} max={mission.perUserLimit} size="sm" />
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-sky pt-3">
        <div className="flex items-baseline gap-3">
          <MonAmount value={mission.rewardMon} size="md" />
          <span className="font-mono text-xs text-ink/60">/ video</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-ink/70">
            <b className="text-ink">{remaining}</b> kaldı
          </span>
          <button
            onClick={onSave}
            aria-label={mission.isSaved ? "Kaydedilenlerden çıkar" : "Kaydet"}
            className="grid size-9 place-items-center rounded-full hover:bg-ice"
          >
            <Bookmark className={cn("size-5", mission.isSaved ? "fill-primary text-primary" : "text-ink")} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function MissionPostCardSkeleton() {
  return (
    <div className="rounded-2xl border-[1.5px] border-sky bg-white p-5">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-5 w-2/3" />
      <Skeleton className="mt-3 aspect-[4/3] w-full" />
      <Skeleton className="mt-4 h-6 w-32" />
    </div>
  );
}
