"use client";

import { Check, CircleDashed, Clock, FileQuestion, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { MonAmount } from "@/components/MonAmount";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/Toaster";
import { LinkButton } from "@/components/ui/button";
import { MonoLabel, Skeleton } from "@/components/ui/card";
import { getMission, getMissions, getSubmission, getWallet } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
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
  const [sub, setSub] = useState<SubmissionView | null | undefined>(undefined);
  const [elapsed, setElapsed] = useState(0);
  // Old, already-resolved submissions skip the animation.
  const [instant, setInstant] = useState<boolean | null>(null);
  const [skip, setSkip] = useState(false);
  const [meta, setMeta] = useState<{ sec: number; h: number } | null>(null);
  const toasted = useRef(false);
  const { data: missions } = useApi(() => getMissions());
  const { data: wallet } = useApi(getWallet);
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
      toast({ kind: "success", title: `+${sub.rewardMon.toFixed(2)} MON`, description: "Ödeme cüzdanına gönderildi." });
    else if (sub.result === "rejected") toast({ kind: "error", title: "Video reddedildi" });
    else toast({ kind: "info", title: "Video incelemeye alındı" });
  }, [showResult, sub, toast, instant]);

  if (sub === undefined) {
    return (
      <AppShell title="Doğrulama" immersive>
        <Skeleton className="mt-4 aspect-video w-full rounded-2xl" />
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
    "Yüklendi",
    meta ? `Süre ${Math.round(meta.sec)} sn · ${meta.h}p` : "Süre kontrolü",
    "Benzersiz (kopya değil)",
    "Challenge geçerli",
    "AI kriterleri kontrol ediyor",
  ];

  const nextMission = missions?.find(
    (m) => m.id !== sub.missionId && m.status !== "completed" && m.myUploads < m.perUserLimit,
  );
  const nextHref = nextMission ? `/mission/${nextMission.id}` : "/explore";
  const score = sub.aiScore !== null ? `${Math.round(sub.aiScore * 100)}%` : "–";
  const label = `Gönderim · Görev #${mission?.chainMissionId ?? "…"}`;

  // ---------- result screens ----------
  if (showResult) {
    const accepted = sub.result === "accepted";
    const rejected = sub.result === "rejected";
    return (
      <AppShell title="Doğrulama" backHref={`/mission/${sub.missionId}`} immersive>
        <div className="flex min-h-[calc(100dvh-8rem)] animate-toast-in flex-col md:min-h-[600px]">
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <span
              className={cn(
                "grid size-24 animate-pop place-items-center rounded-full border-[1.5px] bg-white",
                accepted ? "border-ink" : rejected ? "border-danger text-danger" : "border-warning text-warning",
              )}
            >
              {accepted ? (
                <Check className="size-10 text-success" strokeWidth={2.5} />
              ) : rejected ? (
                <X className="size-10" strokeWidth={2.5} />
              ) : (
                <Clock className="size-10" strokeWidth={2.2} />
              )}
            </span>
            <MonoLabel className="mt-5">
              {accepted ? "Kabul" : rejected ? "Reddedildi" : "İnceleniyor"} · AI skoru {score}
            </MonoLabel>

            {accepted && (
              <>
                <MonAmount value={sub.rewardMon} sign size="xl" className="mt-2 text-6xl sm:text-7xl" />
                <p className="mt-3 text-ink/75">
                  <span className="font-mono">{shortAddr(sub.contributorAddress, 4, 4)}</span> adresine Monad
                  üzerinden ödendi
                </p>
                <a
                  href={txUrl(sub.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex h-9 items-center rounded-xl border-[1.5px] border-ink bg-white px-3.5 font-mono text-xs hover:border-primary hover:text-primary"
                >
                  tx {shortAddr(sub.txHash, 6, 4)} · {settleSec(sub.txHash)} sn
                </a>
              </>
            )}

            {rejected && (
              <>
                <p className="mt-2 text-2xl font-bold">Bu video kabul edilmedi</p>
                <p className="mt-2 max-w-sm rounded-xl border-[1.5px] border-danger/40 bg-red-50 px-4 py-3 text-sm text-danger">
                  {sub.rejectReason}
                </p>
                <p className="mt-3 font-mono text-xs text-ink/55">Reddedilen videolar yükleme limitinden düşülmez.</p>
              </>
            )}

            {!accepted && !rejected && (
              <>
                <p className="mt-2 text-2xl font-bold">Manuel incelemeye alındı</p>
                <p className="mt-2 max-w-sm rounded-xl border-[1.5px] border-warning/50 bg-amber-50 px-4 py-3 text-sm text-ink/80">
                  AI skoru kabul eşiğine yakın. Moderatör onaylarsa{" "}
                  <b className="text-primary">{formatMon(sub.rewardMon)} MON</b> otomatik gönderilir.
                </p>
              </>
            )}
          </div>

          <div className="space-y-3 pb-2">
            {accepted && (
              <div className="flex items-center justify-between rounded-2xl border-[1.5px] border-ink bg-white px-4 py-3">
                <span>Bakiye</span>
                {wallet ? <MonAmount value={wallet.balanceMon} size="sm" /> : <Skeleton className="h-5 w-20" />}
              </div>
            )}
            {rejected ? (
              <LinkButton href={`/mission/${sub.missionId}/capture`} size="lg" className="h-14 w-full font-bold">
                Tekrar dene
              </LinkButton>
            ) : (
              <LinkButton href={nextHref} size="lg" className="h-14 w-full font-bold">
                Sonraki görev
              </LinkButton>
            )}
            {accepted ? (
              <a
                href={txUrl(sub.txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-14 w-full items-center justify-center rounded-full border-[1.5px] border-ink bg-white font-bold hover:bg-ice"
              >
                Explorer&apos;da gör
              </a>
            ) : (
              <LinkButton
                href={rejected ? nextHref : "/registered"}
                variant="outline"
                size="lg"
                className="h-14 w-full font-bold"
              >
                {rejected ? "Sonraki görev" : "Kayıtlılarım"}
              </LinkButton>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  // ---------- verifying ----------
  return (
    <AppShell title="Doğrulama" backHref={`/mission/${sub.missionId}`} immersive>
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
          className="mt-3 aspect-[16/10] w-full rounded-2xl bg-ink object-cover"
        />

        <h2 className="mt-6 text-2xl font-bold tracking-tight">Videon kontrol ediliyor…</h2>
        <ol className="mt-4 divide-y divide-sky rounded-2xl border-[1.5px] border-ink bg-white">
          {steps.map((text, i) => {
            const st = stepState(i);
            return (
              <li
                key={i}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3.5",
                  st === "active" && "font-bold text-primary",
                  st === "waiting" && "text-ink/40",
                )}
              >
                <span>{text}</span>
                {st === "done" ? (
                  <Check className="size-5 animate-pop" strokeWidth={2.5} />
                ) : st === "active" ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <CircleDashed className="size-5" />
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-sm text-ink/65">
          Genelde 10 saniyeden kısa sürer. Kabul edilirse {formatMon(sub.rewardMon)} MON cüzdanına otomatik
          gönderilir.
        </p>

        {!skip && (
          <div className="mt-10 text-center">
            <button
              onClick={() => setSkip(true)}
              className="font-mono text-xs text-ink/60 underline underline-offset-4 hover:text-primary"
            >
              [ demo: sonuca atla → ]
            </button>
          </div>
        )}
        <p className="mt-6 text-center">
          <Link href="/registered" className="text-sm text-ink/60 hover:text-primary">
            Arka planda devam etsin → Kayıtlılarım
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
