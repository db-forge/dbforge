"use client";

import { ArrowRight, Check, Clock, FileQuestion, Loader2, RotateCcw, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MonAmount } from "@/components/MonAmount";
import { StatusBadge } from "@/components/StatusBadge";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/Toaster";
import { TxHash } from "@/components/TxHash";
import { LinkButton } from "@/components/ui/button";
import { Card, MonoLabel, Skeleton } from "@/components/ui/card";
import { getMissions, getSubmission } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import type { SubmissionView } from "@/lib/frontend/types";
import { cn } from "@/lib/frontend/utils";

const STEPS = [
  { label: "Yüklendi", hint: "Video alındı, hash hesaplandı" },
  { label: "Süre", hint: "Minimum 10 saniye kontrolü" },
  { label: "Benzersiz", hint: "Daha önce gönderilmemiş" },
  { label: "AI kontrolü", hint: "Görev kriterlerine uygunluk" },
];
// ms after mount at which each of the first three steps completes
const STEP_AT = [400, 1100, 1900];

type StepState = "done" | "active" | "waiting" | "failed" | "review";

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [sub, setSub] = useState<SubmissionView | null | undefined>(undefined);
  const [elapsed, setElapsed] = useState(0);
  // Old, already-resolved submissions skip the animation.
  const [instant, setInstant] = useState<boolean | null>(null);
  const toasted = useRef(false);
  const { data: missions } = useApi(() => getMissions());

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
      if (e > 4000) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, []);

  const stepsDone = instant ? 3 : STEP_AT.filter((t) => elapsed >= t).length;
  const showResult = !!sub?.result && (instant || stepsDone === 3);

  useEffect(() => {
    if (!showResult || !sub || toasted.current || instant) return;
    toasted.current = true;
    if (sub.result === "accepted")
      toast({ kind: "success", title: `+${sub.rewardMon.toFixed(2)} MON`, description: "Ödeme cüzdanına gönderildi." });
    else if (sub.result === "rejected") toast({ kind: "error", title: "Video reddedildi" });
    else toast({ kind: "info", title: "Video incelemeye alındı" });
  }, [showResult, sub, toast, instant]);

  if (sub === undefined) {
    return (
      <AppShell title="Doğrulama">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
      </AppShell>
    );
  }

  if (sub === null) {
    return (
      <AppShell title="Doğrulama" backHref="/explore">
        <EmptyState
          icon={FileQuestion}
          title="Gönderim bulunamadı"
          action={<LinkButton href="/registered">Kayıtlılarıma git</LinkButton>}
        />
      </AppShell>
    );
  }

  function stepState(i: number): StepState {
    if (i < 3) return i < stepsDone ? "done" : i === stepsDone ? "active" : "waiting";
    if (stepsDone < 3) return "waiting";
    if (!sub?.result) return "active";
    if (sub.result === "accepted") return "done";
    if (sub.result === "rejected") return "failed";
    return "review";
  }

  const nextMission = missions?.find(
    (m) => m.id !== sub.missionId && m.status !== "completed" && m.myUploads < m.perUserLimit,
  );

  return (
    <AppShell title="Doğrulama" backHref={`/mission/${sub.missionId}`}>
      <div className="space-y-4">
        <div className="flex gap-4 rounded-2xl border-[1.5px] border-ink bg-white p-3">
          <video
            src={sub.previewUrl}
            autoPlay
            muted
            loop
            playsInline
            className="aspect-[3/4] w-28 shrink-0 rounded-xl border-[1.5px] border-ink bg-black object-cover sm:w-36"
          />
          <div className="flex min-w-0 flex-col justify-between py-1">
            <div>
              <MonoLabel>Gönderim</MonoLabel>
              <p className="font-bold leading-snug">{sub.missionTitle}</p>
              <p className="mt-1 truncate font-mono text-xs text-ink/60">{sub.fileName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={showResult ? sub.result! : "verifying"} />
              {showResult && sub.aiScore !== null && (
                <span className="font-mono text-xs text-ink/70">AI skoru {(sub.aiScore * 100).toFixed(0)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Checklist */}
        <Card className="p-5">
          <ol className="space-y-4">
            {STEPS.map((step, i) => {
              const s = stepState(i);
              return (
                <li key={step.label} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
                      s === "done" && "animate-pop border-success bg-success text-white",
                      s === "active" && "border-primary text-primary",
                      s === "waiting" && "border-sky text-ink/30",
                      s === "failed" && "animate-pop border-danger bg-danger text-white",
                      s === "review" && "animate-pop border-warning bg-warning text-white",
                    )}
                  >
                    {s === "done" ? (
                      <Check className="size-4" />
                    ) : s === "active" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : s === "failed" ? (
                      <X className="size-4" />
                    ) : s === "review" ? (
                      <Clock className="size-4" />
                    ) : (
                      <span className="font-mono text-xs">{i + 1}</span>
                    )}
                  </span>
                  <div>
                    <p className={cn("font-bold", s === "waiting" && "text-ink/40")}>{step.label}</p>
                    <p className="text-xs text-ink/60">{step.hint}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Result */}
        {showResult && sub.result === "accepted" && (
          <Card className="animate-toast-in border-success p-6 text-center">
            <StatusBadge status="accepted" label="Kabul edildi" />
            <div className="mt-4 animate-pop">
              <MonAmount value={sub.rewardMon} sign size="xl" className="text-6xl" />
            </div>
            <p className="mt-2 text-sm text-ink/70">Ödeme Monad Testnet üzerinden cüzdanına gönderildi.</p>
            <div className="mt-5 rounded-xl border border-sky bg-ice/60 p-3 text-left">
              <MonoLabel>Tx hash</MonoLabel>
              <TxHash hash={sub.txHash} full className="mt-1 flex" />
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <LinkButton href={`/mission/${sub.missionId}/capture`} variant="outline" size="lg">
                Bir video daha
              </LinkButton>
              <LinkButton href={nextMission ? `/mission/${nextMission.id}` : "/explore"} size="lg">
                Sonraki görev <ArrowRight className="size-4" />
              </LinkButton>
            </div>
          </Card>
        )}

        {showResult && sub.result === "rejected" && (
          <Card className="animate-toast-in border-danger p-6">
            <StatusBadge status="rejected" label="Reddedildi" />
            <p className="mt-3 text-lg font-bold">Bu video kabul edilmedi</p>
            <p className="mt-1 text-sm text-ink/75">{sub.rejectReason}</p>
            <p className="mt-3 font-mono text-xs text-ink/55">Reddedilen videolar yükleme limitinden düşülmez.</p>
            <LinkButton href={`/mission/${sub.missionId}/capture`} size="lg" className="mt-5 w-full">
              <RotateCcw className="size-4" /> Tekrar dene
            </LinkButton>
          </Card>
        )}

        {showResult && sub.result === "review" && (
          <Card className="animate-toast-in border-warning bg-amber-50/60 p-6">
            <StatusBadge status="review" />
            <p className="mt-3 text-lg font-bold">Manuel incelemeye alındı</p>
            <p className="mt-1 text-sm text-ink/75">
              AI skoru kabul eşiğine yakın. Bir moderatör videonu inceleyecek; onaylanırsa{" "}
              <b className="text-primary">{sub.rewardMon.toFixed(2)} MON</b> otomatik gönderilir.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <LinkButton href="/registered" variant="outline" size="lg">
                Kayıtlılarım
              </LinkButton>
              <LinkButton href={nextMission ? `/mission/${nextMission.id}` : "/explore"} size="lg">
                Sonraki görev <ArrowRight className="size-4" />
              </LinkButton>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
