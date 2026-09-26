"use client";

import { Check, CircleDashed, Clock, FileQuestion, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useT } from "@/components/I18nProvider";
import { MonAmount } from "@/components/MonAmount";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/Toaster";
import { LinkButton } from "@/components/ui/button";
import { MonoLabel, Skeleton } from "@/components/ui/card";
import { getMission, getMissions, getSubmission, getWallet } from "@/lib/frontend/api";
import { useApi, useDisplayBalance } from "@/lib/frontend/hooks";
import type { SubmissionView } from "@/lib/frontend/types";
import { cn, formatMon, shortAddr, txUrl } from "@/lib/frontend/utils";

// ms after mount at which each of the first four steps completes; the last
// step (AI) waits for the verification result.
const STEP_AT = [300, 900, 1500, 2100];

type StepState = "done" | "active" | "waiting" | "failed" | "review";

/** Stable fake settlement time (0.4–1.3 s) derived from the tx hash. */
function settleSec(hash: string) {
  return (0.4 + (parseInt(hash.slice(2, 4) || "0", 16) % 10) / 10).toFixed(1);
}

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const t = useT();
  const [sub, setSub] = useState<SubmissionView | null | undefined>(undefined);
  const [elapsed, setElapsed] = useState(0);
  // Old, already-resolved submissions skip the animation.
  const [instant, setInstant] = useState<boolean | null>(null);
  const [skip, setSkip] = useState(false);
  const [meta, setMeta] = useState<{ sec: number; h: number } | null>(null);
  const toasted = useRef(false);
  const { data: missions } = useApi(() => getMissions());
  const { data: wallet } = useApi(getWallet);
  const balance = useDisplayBalance(wallet?.balanceMon);
  const missionId = sub?.missionId ?? "";
  const { data: mission } = useApi(() => (missionId ? getMission(missionId) : Promise.resolve(null)), [missionId]);

  // Poll until verification resolves.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let first = true;
    async function poll() {
      const s = await getSubmission(id);
      if (!alive) return;
      if (first) setInstant(!!s?.result);
      first = false;
      setSub(s);
      if (s && s.result === null) timer = setTimeout(poll, 500);
    }
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  // Drives the step-by-step checklist animation.
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => {
      const e = Date.now() - start;
      setElapsed(e);
      if (e > 3000) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, []);

  const fast = instant || skip;
  const stepsDone = fast ? STEP_AT.length : STEP_AT.filter((t) => elapsed >= t).length;
  const showResult = !!sub?.result && stepsDone === STEP_AT.length;

  useEffect(() => {
    if (!showResult || !sub || toasted.current || instant) return;
    toasted.current = true;
    if (sub.result === "accepted")
      toast({ kind: "success", title: `+${sub.rewardMon.toFixed(2)} MON`, description: t.submission.toastPaid });
    else if (sub.result === "rejected") toast({ kind: "error", title: t.submission.toastRejected });
    else toast({ kind: "info", title: t.submission.toastReview });
  }, [showResult, sub, toast, instant, t]);

  if (sub === undefined) {
    return (
      <AppShell title={t.submission.title} immersive>
        <Skeleton className="mt-4 aspect-video w-full rounded-2xl" />
        <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
      </AppShell>
    );
  }

  if (sub === null) {
    return (
      <AppShell title={t.submission.title} backHref="/explore">
        <EmptyState
          icon={FileQuestion}
          title={t.submission.notFound}
          action={<LinkButton href="/registered">{t.submission.goToRegistered}</LinkButton>}
        />
      </AppShell>
    );
  }

  const last = STEP_AT.length;
  function stepState(i: number): StepState {
    if (i < last) return i < stepsDone ? "done" : i === stepsDone ? "active" : "waiting";
    if (stepsDone < last) return "waiting";
    if (!sub?.result) return "active";
    if (sub.result === "accepted") return "done";
    if (sub.result === "rejected") return "failed";
    return "review";
  }

  const steps = [
    t.submission.steps.uploaded,
    meta ? t.submission.steps.duration(Math.round(meta.sec), meta.h) : t.submission.steps.durationCheck,
    t.submission.steps.unique,
    t.submission.steps.challenge,
    t.submission.steps.ai,
  ];

  const nextMission = missions?.find(
    (m) => m.id !== sub.missionId && m.status !== "completed" && m.myUploads < m.perUserLimit,
  );
  const nextHref = nextMission ? `/mission/${nextMission.id}` : "/explore";
  const score = sub.aiScore !== null ? `${Math.round(sub.aiScore * 100)}%` : "–";
  const label = t.submission.label(mission?.chainMissionId ?? "…");

  // ---------- result screens ----------
  if (showResult) {
    const accepted = sub.result === "accepted";
    const rejected = sub.result === "rejected";
    return (
      <AppShell title={t.submission.title} backHref={`/mission/${sub.missionId}`} immersive>
        <div className="flex min-h-[calc(100dvh-8rem)] animate-toast-in flex-col md:min-h-[600px]">
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <span
              className={cn(
                "grid size-24 animate-pop place-items-center rounded-full border-[1.5px] bg-surface",
                accepted ? "border-money text-money" : rejected ? "border-danger text-danger" : "border-warn text-warn",
              )}
            >
              {accepted ? (
                <Check className="size-10" strokeWidth={3} />
              ) : rejected ? (
                <X className="size-10" strokeWidth={2.5} />
              ) : (
                <Clock className="size-10" strokeWidth={2.2} />
              )}
            </span>
            <MonoLabel className="mt-5">
              {t.submission.resultLabel[accepted ? "accepted" : rejected ? "rejected" : "review"]} · {t.submission.aiScore}{" "}
              {score}
            </MonoLabel>

            {accepted && (
              <>
                <MonAmount value={sub.rewardMon} sign size="xl" className="mt-2 text-6xl sm:text-7xl" />
                <p className="mt-3 text-muted">
                  {t.submission.paidTo(!!sub.txHash).before}
                  <span className="font-mono">{shortAddr(sub.contributorAddress, 4, 4)}</span>
                  {t.submission.paidTo(!!sub.txHash).after}
                </p>
                {sub.txHash ? (
                  <a
                    href={txUrl(sub.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex h-9 items-center rounded-xl border-[1.5px] border-border bg-surface px-3.5 font-mono text-xs hover:border-primary hover:text-link"
                  >
                    tx {shortAddr(sub.txHash, 6, 4)} · {t.common.sec(settleSec(sub.txHash))}
                  </a>
                ) : (
                  <p className="mt-4 max-w-sm rounded-xl border-[1.5px] border-warn/50 bg-warn/15 px-4 py-2 text-sm">
                    {sub.note ?? t.submission.payoutQueued}
                  </p>
                )}
              </>
            )}

            {rejected && (
              <>
                <p className="mt-2 text-2xl font-bold text-danger">{t.submission.rejectedTitle}</p>
                <p className="mt-2 max-w-sm rounded-xl border-[1.5px] border-danger/40 bg-danger/15 px-4 py-3 text-sm text-danger">
                  {sub.rejectReason}
                </p>
                <p className="mt-3 font-mono text-xs text-muted">{t.submission.rejectedNote}</p>
              </>
            )}

            {!accepted && !rejected && (
              <>
                <p className="mt-2 text-2xl font-bold">{t.submission.reviewTitle}</p>
                <p className="mt-2 max-w-sm rounded-xl border-[1.5px] border-warn/50 bg-warn/15 px-4 py-3 text-sm text-text/80">
                  {sub.note ?? (
                    <>
                      {t.submission.reviewBefore}
                      <b className="text-money">{formatMon(sub.rewardMon)} MON</b>
                      {t.submission.reviewAfter}
                    </>
                  )}
                </p>
              </>
            )}
          </div>

          <div className="space-y-3 pb-2">
            {accepted && (
              <div className="flex items-center justify-between rounded-2xl border-[1.5px] border-border bg-surface px-4 py-3">
                <span>{t.submission.balance}</span>
                {balance !== null ? <MonAmount value={balance} size="sm" /> : <Skeleton className="h-5 w-20" />}
              </div>
            )}
            {rejected ? (
              <LinkButton href={`/mission/${sub.missionId}/capture`} size="lg" className="h-14 w-full font-bold">
                {t.common.tryAgain}
              </LinkButton>
            ) : (
              <LinkButton href={nextHref} size="lg" className="h-14 w-full font-bold">
                {t.common.nextMission}
              </LinkButton>
            )}
            {accepted && sub.txHash ? (
              <a
                href={txUrl(sub.txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-14 w-full items-center justify-center rounded-full border-[1.5px] border-border bg-surface font-bold hover:bg-border/40"
              >
                {t.common.viewOnExplorer}
              </a>
            ) : (
              <LinkButton
                href={rejected ? nextHref : "/registered"}
                variant="outline"
                size="lg"
                className="h-14 w-full font-bold"
              >
                {rejected ? t.common.nextMission : t.common.registered}
              </LinkButton>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  // ---------- verifying ----------
  return (
    <AppShell title={t.submission.title} backHref={`/mission/${sub.missionId}`} immersive>
      <div className="pt-2 md:pt-0">
        <MonoLabel>{label}</MonoLabel>
        <video
          src={sub.previewUrl}
          autoPlay
          muted
          loop
          playsInline
          onLoadedMetadata={(e) =>
            setMeta({ sec: e.currentTarget.duration, h: e.currentTarget.videoHeight })
          }
          className="mt-3 aspect-[16/10] w-full rounded-2xl bg-bg object-cover"
        />

        <h2 className="mt-6 text-2xl font-bold tracking-tight">{t.submission.checking}</h2>
        <ol className="mt-4 divide-y divide-border rounded-2xl border-[1.5px] border-border bg-surface">
          {steps.map((text, i) => {
            const st = stepState(i);
            return (
              <li
                key={i}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3.5",
                  st === "active" && "font-bold text-primary",
                  st === "waiting" && "text-muted",
                )}
              >
                <span>{text}</span>
                {st === "done" ? (
                  <Check className="size-5 animate-pop text-money" strokeWidth={2.5} />
                ) : st === "active" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <CircleDashed className="size-5" />
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-sm text-muted">
          {t.submission.usually(formatMon(sub.rewardMon))}
        </p>

        {!skip && (
          <div className="mt-10 text-center">
            <button
              onClick={() => setSkip(true)}
              className="font-mono text-xs text-muted underline underline-offset-4 hover:text-link"
            >
              {t.submission.skip}
            </button>
          </div>
        )}
        <p className="mt-6 text-center">
          <Link href="/registered" className="text-sm text-muted hover:text-link">
            {t.submission.background}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
