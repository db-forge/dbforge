"use client";

import { Camera, CameraOff, FolderOpen, Loader2, RotateCcw, Send, SwitchCamera, Video } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MonAmount } from "@/components/MonAmount";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Card, MonoLabel } from "@/components/ui/card";
import { getMission, uploadSubmission } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { cn } from "@/lib/frontend/utils";
import { DEMO_VIDEOS } from "@/lib/mock/missions";

type Phase = "init" | "denied" | "ready" | "recording" | "preview" | "uploading";

const MIN_SEC = 10;
const MAX_SEC = 60;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function fmt(sec: number) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function CapturePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: mission } = useApi(() => getMission(id), [id]);

  const [phase, setPhase] = useState<Phase>("init");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [elapsed, setElapsed] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fromPicker, setFromPicker] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);

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
      toast({ kind: "error", title: "Tarayıcın kayıt desteklemiyor", description: "Hazır video seçebilirsin." });
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
    setPhase("preview");
  }

  async function pickDemo(name: string, url: string) {
    setLoadingDemo(name);
    try {
      const blob = await (await fetch(url)).blob();
      applyFile(new File([blob], name, { type: blob.type || "video/mp4" }));
    } catch {
      toast({ kind: "error", title: "Video yüklenemedi" });
    } finally {
      setLoadingDemo(null);
    }
  }

  function retake() {
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
      const sub = await uploadSubmission(id, file);
      stopStream();
      router.push(`/submission/${sub.id}`);
    } catch (e) {
      toast({ kind: "error", title: "Yükleme başarısız", description: (e as Error).message });
      setPhase("preview");
    }
  }

  const tooShort = !fromPicker && elapsed < MIN_SEC;
  const denied = phase === "denied";
  const minPct = Math.min(100, (elapsed / MIN_SEC) * 100);

  const picker = (
    <Card className={cn("p-4", denied && "border-primary")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold">Hazır video seç</p>
          <p className="text-sm text-ink/65">Galeriden veya örnek videolardan birini gönder.</p>
        </div>
        <Button variant={denied ? "primary" : "outline"} onClick={() => fileInputRef.current?.click()}>
          <FolderOpen className="size-4" /> Dosya seç
        </Button>
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
      </div>
      <MonoLabel className="mt-4 block">Örnek videolar</MonoLabel>
      <div className="mt-2 flex flex-wrap gap-2">
        {DEMO_VIDEOS.map((v) => (
          <button
            key={v.name}
            onClick={() => pickDemo(v.name, v.url)}
            disabled={!!loadingDemo || phase === "uploading"}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-sky bg-white px-3 text-xs font-medium hover:border-primary disabled:opacity-50"
          >
            {loadingDemo === v.name ? <Loader2 className="size-3 animate-spin" /> : <Video className="size-3" />}
            {v.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => pickDemo("fail-bottle-drop.mp4", "/demo/bottle-drop.mp4")}
          disabled={!!loadingDemo}
          className="h-7 rounded-full border border-dashed border-danger/50 px-2.5 font-mono text-[10px] text-danger hover:bg-red-50"
        >
          demo: red senaryosu
        </button>
        <button
          onClick={() => pickDemo("review-bottle-drop.mp4", "/demo/bottle-drop.mp4")}
          disabled={!!loadingDemo}
          className="h-7 rounded-full border border-dashed border-warning/50 px-2.5 font-mono text-[10px] text-warning hover:bg-amber-50"
        >
          demo: inceleme senaryosu
        </button>
      </div>
    </Card>
  );

  return (
    <AppShell title="Video kaydı" backHref={`/mission/${id}`}>
      <div className="space-y-4">
        {mission && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-sky bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{mission.title}</p>
              <p className="font-mono text-xs text-ink/60">
                {mission.myUploads}/{mission.perUserLimit} yüklendi · min {MIN_SEC} sn
              </p>
            </div>
            <MonAmount value={mission.rewardMon} size="md" className="shrink-0" />
          </div>
        )}

        {denied && picker}

        {/* Viewport */}
        <div className="relative mx-auto aspect-[3/4] max-h-[68dvh] w-full overflow-hidden rounded-2xl border-[1.5px] border-ink bg-ink">
          <video
            ref={liveRef}
            muted
            playsInline
            className={cn(
              "absolute inset-0 size-full object-cover",
              facing === "user" && "-scale-x-100",
              (phase === "preview" || phase === "uploading" || denied) && "invisible",
            )}
          />
          {(phase === "preview" || phase === "uploading") && previewUrl && (
            <video
              key={previewUrl}
              src={previewUrl}
              controls
              autoPlay
              loop
              playsInline
              muted
              className="absolute inset-0 size-full bg-black object-contain"
            />
          )}

          {phase === "init" && (
            <div className="absolute inset-0 grid place-items-center text-white/80">
              <div className="flex flex-col items-center gap-2 text-sm">
                <Loader2 className="size-6 animate-spin" /> Kamera açılıyor…
              </div>
            </div>
          )}

          {denied && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
              <div className="flex flex-col items-center gap-3">
                <CameraOff className="size-8 text-sky" />
                <p className="font-bold">Kamera izni yok</p>
                <p className="max-w-60 text-sm text-white/70">
                  Tarayıcı ayarlarından kamera izni ver veya yukarıdan hazır bir video seç.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhase("init");
                    startCamera();
                  }}
                >
                  <Camera className="size-4" /> Tekrar dene
                </Button>
              </div>
            </div>
          )}

          {/* Top overlay: timer + min bar */}
          {(phase === "ready" || phase === "recording") && (
            <div className="absolute inset-x-0 top-0 p-3">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-sm font-bold tabular-nums",
                    phase === "recording" ? "bg-danger text-white" : "bg-white/90 text-ink",
                  )}
                >
                  {phase === "recording" && <span className="size-2 animate-pulse rounded-full bg-white" />}
                  {fmt(elapsed)}
                </span>
                {phase === "ready" && (
                  <button
                    onClick={() => {
                      setPhase("init");
                      setFacing((f) => (f === "user" ? "environment" : "user"));
                    }}
                    aria-label="Kamerayı çevir"
                    className="grid size-9 place-items-center rounded-full bg-white/90 text-ink"
                  >
                    <SwitchCamera className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-3 rounded-full bg-white/90 p-1">
                <div className="relative h-2 overflow-hidden rounded-full bg-sky">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-100",
                      minPct >= 100 ? "bg-success" : "bg-primary",
                    )}
                    style={{ width: `${minPct}%` }}
                  />
                </div>
              </div>
              <p className="mt-1 text-center font-mono text-[11px] font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                {minPct >= 100 ? "Minimum süre tamam" : `min ${MIN_SEC} sn`}
              </p>
            </div>
          )}

          {/* Record button */}
          {(phase === "ready" || phase === "recording") && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-5">
              <button
                onClick={phase === "recording" ? stopRecording : startRecording}
                aria-label={phase === "recording" ? "Kaydı durdur" : "Kaydı başlat"}
                className="grid size-18 place-items-center rounded-full border-4 border-white bg-white/20"
              >
                <span
                  className={cn(
                    "block bg-danger transition-all",
                    phase === "recording" ? "size-7 rounded-md" : "size-14 rounded-full",
                  )}
                />
              </button>
            </div>
          )}
        </div>

        {/* Preview actions */}
        {(phase === "preview" || phase === "uploading") && (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-mono text-xs text-ink/70">{file?.name}</span>
              {!fromPicker && (
                <span className={cn("font-mono text-xs font-bold", tooShort ? "text-danger" : "text-success")}>
                  {fmt(elapsed)}
                </span>
              )}
            </div>
            {tooShort && (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">
                Video en az {MIN_SEC} saniye olmalı. Tekrar çek.
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" onClick={retake} disabled={phase === "uploading"}>
                <RotateCcw className="size-4" /> Tekrar çek
              </Button>
              <Button size="lg" onClick={submit} disabled={phase === "uploading" || tooShort}>
                {phase === "uploading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Yükleniyor
                  </>
                ) : (
                  <>
                    <Send className="size-4" /> Gönder
                  </>
                )}
              </Button>
            </div>
          </Card>
        )}

        {!denied && phase !== "preview" && phase !== "uploading" && picker}
      </div>
    </AppShell>
  );
}
