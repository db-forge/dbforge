"use client";

import { ArrowRight, Bookmark, Check, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { registerMission, toggleSave } from "@/lib/frontend/api";
import type { MissionPost } from "@/lib/frontend/types";
import { cn, timeAgo } from "@/lib/frontend/utils";
import { useRequireContributor } from "./auth/RequireSession";
import { useSession } from "@/lib/frontend/hooks";
import { CompanyAvatar } from "./CompanyAvatar";
import { CoverImage } from "./CoverImage";
import { useT } from "./I18nProvider";
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
  const t = useT();
  const requireContributor = useRequireContributor();
  const { session } = useSession();
  const isCompany = session?.kind === "company";
  const [busy, setBusy] = useState(false);
  const remaining = Math.max(0, mission.targetCount - mission.acceptedCount);
  const completed = mission.status === "completed";
  const detailHref = preview ? "#" : `/mission/${mission.id}`;

  async function onRegister() {
    if (preview || mission.isRegistered || busy) return;
    if (!requireContributor()) return;
    setBusy(true);
    try {
      await registerMission(mission.id);
      toast({ kind: "success", title: t.post.toastRegistered, description: t.post.toastRegisteredDesc(mission.title) });
    } catch (e) {
      toast({ kind: "error", title: t.post.toastRegisterFailed, description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (preview) return;
    const saved = await toggleSave(mission.id);
    toast({ kind: "info", title: saved ? t.post.toastSaved : t.post.toastUnsaved });
  }

  return (
    <article
      className={cn(
        "flex gap-3 px-4 py-4",
        preview ? "rounded-lg border-[1.5px] border-border bg-surface" : "border-b-[1.5px] border-border bg-bg",
        className,
      )}
    >
      <CompanyAvatar company={mission.company} />
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pt-0.5">
            <p className="text-[15px] leading-tight">
              <span className="font-bold text-text">{mission.company.name}</span>{" "}
              <span className="text-muted">
                @{mission.company.handle} · {preview ? t.time.now : timeAgo(mission.createdAt, t.time)}
              </span>
            </p>
            <p className={"mt-0.5 font-mono text-xs text-link"}>#{t.categories[mission.category]}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Users className="size-3" />
              {t.common.registeredCount(mission.registeredCount)}
            </span>
            {completed ? (
              <span className="inline-flex h-8 items-center rounded-full border-[1.5px] border-muted bg-transparent px-3 text-sm font-bold text-muted">
                {t.status.completed}
              </span>
            ) : mission.isRegistered ? (
              <span className="inline-flex h-8 animate-pop items-center gap-1 rounded-full border-[1.5px] border-money bg-transparent px-3.5 text-sm font-bold text-money">
                {t.post.registered} <Check className="size-4" />
              </span>
            ) : !isCompany ? (
              <Button size="sm" onClick={onRegister} disabled={busy} className="font-bold">
                {t.post.register}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <Link href={detailHref} className="group mt-2 block">
          <h3 className="text-lg leading-snug font-bold text-text underline-offset-2 group-hover:underline">{mission.title}</h3>
          <div className="mt-3 overflow-hidden rounded-md border-[1.5px] border-border">
            <CoverImage
              src={mission.coverUrl}
              alt={mission.title}
              className="aspect-[16/9] w-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.015]"
            />
          </div>
        </Link>

        {/* Personal progress — only after registering */}
        {!isCompany && mission.isRegistered && !completed && (
          <div className="mt-3 animate-toast-in rounded-md border-[1.5px] border-border bg-surface px-3.5 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-bold text-text">{t.common.yourUploads}</span>
                  <span className="text-muted tabular-nums">
                    {t.common.uploadsOf(mission.myUploads, mission.perUserLimit)}
                  </span>
                </div>
                <ProgressBar value={mission.myUploads} max={mission.perUserLimit} size="sm" />
              </div>
              {mission.myUploads < mission.perUserLimit ? (
                <Link
                  href={preview ? "#" : `/mission/${mission.id}/capture`}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-link underline underline-offset-2"
                >
                  {t.post.startRecording} <ArrowRight className="size-4" />
                </Link>
              ) : (
                <span className="shrink-0 font-mono text-xs text-money">{t.post.limitReached}</span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <MonAmount value={mission.rewardMon} size="md" />
            <span className="text-sm text-muted">{t.common.remaining(remaining)}</span>
          </div>
          <button
            onClick={onSave}
            aria-label={mission.isSaved ? t.post.unsave : t.common.save}
            className="-mr-2 grid size-9 place-items-center rounded-full transition-colors hover:bg-border/40 active:bg-border/70"
          >
            <Bookmark className={cn("size-5", mission.isSaved ? "fill-primary text-primary" : "text-muted")} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function MissionPostCardSkeleton() {
  return (
    <div className="flex gap-3 border-b-[1.5px] border-border bg-bg px-4 py-4">
      <Skeleton className="size-11 rounded-xl" />
      <div className="flex-1">
        <div className="flex justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <Skeleton className="mt-4 h-5 w-2/3" />
        <Skeleton className="mt-3 aspect-[16/9] w-full rounded-md" />
        <Skeleton className="mt-4 h-6 w-32" />
      </div>
    </div>
  );
}
