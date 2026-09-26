"use client";

import { CameraOff, FolderOpen, Loader2, RotateCcw, Send, SwitchCamera, Video, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useT } from "@/components/I18nProvider";
import { MonAmount } from "@/components/MonAmount";
import { useToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { getMission, uploadSubmission } from "@/lib/frontend/api";
import { useApi, useIsClient, useWalletStatus } from "@/lib/frontend/hooks";
import { cn, randomHex } from "@/lib/frontend/utils";
import { DEMO_VIDEOS } from "@/lib/mock/missions";
import { DEMO_VIDEO_LABELS_EN } from "@/lib/mock/missions.en";

type Phase = "init" | "denied" | "ready" | "recording" | "preview" | "uploading";

const MIN_SEC = 10;
const MAX_SEC = 20;
const CHALLENGE_SEC = 5 * 60;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One-time challenge code shown while recording (anti-replay). Mock for now;
 * later it comes from the verification service with its expiry.
 */
function useChallenge() {
  const [code] = useState(() => randomHex(2).slice(2));
  const [left, setLeft] = useState(CHALLENGE_SEC);
  // The code is random; only show it after hydration so SSR and client agree.
  const mounted = useIsClient();
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return { code: mounted ? code : "····", left };
}

export default function CapturePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const locale = useLocale();
  const { data: mission } = useApi(() => getMission(id), [id]);
  const challenge = useChallenge();
  const { address } = useWalletStatus();

  const [phase, setPhase] = useState<Phase>("init");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [elapsed, setElapsed] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fromPicker, setFromPicker] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopStream();
    try {
      // Throws (→ denied) when mediaDevices is missing, e.g. insecure origin.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => {});
      }
      setPhase("ready");
    } catch {
      setPhase("denied");
    }
  }, [facing, stopStream]);

  useEffect(() => {
    // startCamera only sets state after awaiting getUserMedia.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera();
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCamera, stopStream]);

  // Revoke preview blob URLs we created when they change.
  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    if (typeof MediaRecorder === "undefined") {
      toast({ kind: "error", title: t.capture.noRecorder, description: t.capture.noRecorderDesc });
      setSheetOpen(true);
      return;
    }
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const f = new File([blob], `kayit-${Date.now()}.${ext}`, { type });
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setFromPicker(false);
      setPhase("preview");
    };
    recorder.start(250);
    recorderRef.current = recorder;
    // eslint-disable-next-line react-hooks/purity -- event handler, not render
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase("recording");
    timerRef.current = setInterval(() => {
      const sec = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(sec);
      if (sec >= MAX_SEC) stopRecording();
    }, 100);
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function applyFile(f: File) {
    if (phase === "recording") stopRecording();
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setFromPicker(true);
    setElapsed(0);
    setSheetOpen(false);
    setPhase("preview");
  }

  async function pickDemo(name: string, url: string) {
    setLoadingDemo(name);
    try {
      const blob = await (await fetch(url)).blob();
      applyFile(new File([blob], name, { type: blob.type || "video/mp4" }));
    } catch {
      toast({ kind: "error", title: t.capture.videoLoadFailed });
    } finally {
      setLoadingDemo(null);
    }
  }

  function retake() {
    if (phase === "recording") stopRecording();
    setFile(null);
    setPreviewUrl(null);
    setElapsed(0);
    if (streamRef.current) {
      setPhase("ready");
    } else {
      setPhase("init");
      startCamera();
    }
  }

  async function submit() {
    if (!file) return;
    setPhase("uploading");
    try {
      const sub = await uploadSubmission(id, file, address);
      stopStream();
      router.push(`/submission/${sub.id}`);
    } catch (e) {
      toast({ kind: "error", title: t.capture.uploadFailed, description: (e as Error).message });
      setPhase("preview");
    }
  }

  const denied = phase === "denied";
  const live = phase === "ready" || phase === "recording";
  const reviewing = phase === "preview" || phase === "uploading";
  const tooShort = !fromPicker && elapsed < MIN_SEC;
  const pct = Math.min(100, (elapsed / MAX_SEC) * 100);
  const hint = mission?.criteria.at(-1) ?? t.capture.defaultHint;

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="video/*"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) applyFile(f);
        e.target.value = "";
      }}
    />
  );

  const demoList = (
    <div className="space-y-2">
      <Button className="w-full" size="lg" onClick={() => fileInputRef.current?.click()}>
        <FolderOpen className="size-5" /> {t.capture.pickFromGallery}
      </Button>
      <p className="pt-2 font-mono text-[11px] tracking-wider text-muted uppercase">{t.capture.sampleVideos}</p>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_VIDEOS.map((v) => (
          <button
            key={v.name}
            onClick={() => pickDemo(v.name, v.url)}
            disabled={!!loadingDemo}
            className="inline-flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-border bg-surface px-3 text-left text-sm hover:bg-border/40 disabled:opacity-50"
          >
            {loadingDemo === v.name ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <Video className="size-4 shrink-0" />
            )}
            <span className="truncate">{locale === "en" ? (DEMO_VIDEO_LABELS_EN[v.name] ?? v.label) : v.label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => pickDemo("fail-bottle-drop.mp4", "/demo/bottle-drop.mp4")}
          disabled={!!loadingDemo}
          className="h-7 rounded-full border border-dashed border-danger/60 px-2.5 font-mono text-[10px] text-danger hover:bg-danger/15"
        >
          {t.capture.demoReject}
        </button>
        <button
          onClick={() => pickDemo("review-bottle-drop.mp4", "/demo/bottle-drop.mp4")}
          disabled={!!loadingDemo}
          className="h-7 rounded-full border border-dashed border-warn/60 px-2.5 font-mono text-[10px] text-warn hover:bg-warn/15"
        >
          {t.capture.demoReview}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 bg-bg text-text">
      <div className="mx-auto flex h-full max-w-[480px] flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {/* Top bar */}
        <div className="flex h-10 items-center justify-between gap-3">
          <Link href={`/mission/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium">
            <X className="size-5" /> {t.common.cancel}
          </Link>
          <span className="inline-flex h-8 items-center rounded-full border-[1.5px] border-primary px-3 font-mono text-xs text-text">
            {t.capture.challenge} {challenge.code} · {fmt(challenge.left)}
          </span>
        </div>

        {mission && (
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-muted">{mission.title}</span>
            <MonAmount value={mission.rewardMon} size="sm" className="shrink-0" />
          </div>
        )}

        {/* Viewfinder */}
        <div className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl border-[1.5px] border-dashed border-border">
          <video
            ref={liveRef}
            muted
            playsInline
            className={cn(
              "absolute inset-0 size-full object-cover",
              facing === "user" && "-scale-x-100",
              (reviewing || denied) && "invisible",
            )}
          />
          {reviewing && previewUrl && (
            <video
              key={previewUrl}
              src={previewUrl}
              controls
              autoPlay
              loop
              playsInline
              muted
              className="absolute inset-0 size-full bg-bg object-contain"
            />
          )}

          {phase === "init" && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-2 text-sm text-muted">
                <Loader2 className="size-6 animate-spin" /> {t.capture.cameraOpening}
              </div>
            </div>
          )}

          {denied && (
            <div className="absolute inset-0 overflow-y-auto bg-surface p-4 text-text">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-border bg-surface">
                  <CameraOff className="size-5 text-danger" />
                </span>
                <div>
                  <p className="font-bold">{t.capture.noPermission}</p>
                  <p className="text-sm text-muted">{t.capture.noPermissionDesc}</p>
                </div>
              </div>
              <div className="mt-4">{demoList}</div>
              <button
                onClick={() => {
                  setPhase("init");
                  startCamera();
                }}
                className="mt-4 w-full text-center text-sm font-bold text-link underline underline-offset-2"
              >
                {t.capture.retryCamera}
              </button>
            </div>
          )}

          {live && (
            <>
              <div className="absolute inset-x-0 top-3 flex justify-center">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-mono text-sm font-bold tabular-nums",
                    phase === "recording" ? "bg-danger text-white" : "bg-surface/90 text-text",
                  )}
                >
                  <span className={cn("size-2 rounded-full", phase === "recording" ? "animate-pulse bg-white" : "bg-danger")} />
                  {fmt(elapsed)}
                </span>
              </div>
              <p className="absolute inset-x-0 bottom-4 px-6 text-center text-base font-bold [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]">
                {hint}
              </p>
            </>
          )}

          {reviewing && !fromPicker && (
            <span
              className={cn(
                "absolute top-3 left-3 rounded-full px-3 py-1 font-mono text-xs font-bold",
                tooShort ? "bg-danger text-white" : "bg-money text-white",
              )}
            >
              {fmt(elapsed)} {tooShort && `· ${t.capture.min(MIN_SEC)}`}
            </span>
          )}
        </div>

        {/* Duration track: 0 — min 10 — 20 */}
        {!denied && (
          <div className="mt-4">
            <div className="relative h-1.5 rounded-full bg-border">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-100",
                  elapsed >= MIN_SEC ? "bg-money" : "bg-primary",
                )}
                style={{ width: `${reviewing && fromPicker ? 100 : pct}%` }}
              />
              <span
                className="absolute -top-1 h-3.5 w-0.5 rounded bg-text"
                style={{ left: `${(MIN_SEC / MAX_SEC) * 100}%` }}
              />
            </div>
            <div className="relative mt-1.5 flex justify-between font-mono text-[11px] text-muted">
              <span>{t.common.sec(0)}</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${(MIN_SEC / MAX_SEC) * 100}%` }}>
                {t.capture.min(MIN_SEC)}
              </span>
              <span>{t.common.sec(MAX_SEC)}</span>
            </div>
          </div>
        )}

        {/* Controls */}
        {reviewing ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={retake}
              disabled={phase === "uploading"}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-full border-[1.5px] border-text font-bold disabled:opacity-50"
            >
              <RotateCcw className="size-4" /> {t.capture.retake}
            </button>
            <Button size="lg" className="h-14 font-bold" onClick={submit} disabled={phase === "uploading" || tooShort}>
              {phase === "uploading" ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> {t.capture.uploading}
                </>
              ) : (
                <>
                  <Send className="size-4" /> {t.capture.send}
                </>
              )}
            </Button>
          </div>
        ) : (
          !denied && (
            <div className="mt-4 grid grid-cols-3 items-center">
              <button onClick={retake} disabled={phase !== "recording"} className="justify-self-start text-sm text-muted disabled:opacity-40">
                {t.capture.retake}
              </button>
              <button
                onClick={phase === "recording" ? stopRecording : startRecording}
                disabled={!live}
                aria-label={phase === "recording" ? t.capture.stop : t.capture.start}
                className="grid size-20 place-items-center justify-self-center rounded-full border-4 border-text disabled:opacity-40"
              >
                <span
                  className={cn(
                    "block bg-danger transition-all",
                    phase === "recording" ? "size-8 rounded-lg" : "size-15 rounded-full",
                  )}
                />
              </button>
              <button
                onClick={() => {
                  setPhase("init");
                  setFacing((f) => (f === "user" ? "environment" : "user"));
                }}
                disabled={phase !== "ready"}
                className="inline-flex items-center gap-1.5 justify-self-end text-sm text-muted disabled:opacity-40"
              >
                <SwitchCamera className="size-4" /> {t.capture.flip}
              </button>
            </div>
          )
        )}

        {!denied && !reviewing && (
          <button
            onClick={() => setSheetOpen(true)}
            disabled={phase === "recording"}
            className="mt-4 inline-flex items-center justify-center gap-2 self-center rounded-full border-[1.5px] border-border px-4 py-2 text-sm hover:border-text disabled:opacity-40"
          >
            <FolderOpen className="size-4" /> {t.capture.pickReady}
          </button>
        )}
      </div>

      {/* Ready-made video sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70" onClick={() => setSheetOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] animate-toast-in rounded-t-3xl border-[1.5px] border-b-0 border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-text"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-bold">{t.capture.pickReady}</p>
              <button onClick={() => setSheetOpen(false)} aria-label={t.common.close} className="grid size-9 place-items-center rounded-full hover:bg-bg">
                <X className="size-5" />
              </button>
            </div>
            {demoList}
          </div>
        </div>
      )}
      {fileInput}
    </div>
  );
}
