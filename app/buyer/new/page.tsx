"use client";

import { ArrowRight, ImagePlus, Loader2, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useConnectWallet } from "@/components/ConnectWallet";
import { CoverImage } from "@/components/CoverImage";
import { MissionPostCard } from "@/components/MissionPostCard";
import { BuyerShell } from "@/components/shell/BuyerShell";
import { useToast } from "@/components/Toaster";
import { TxStatus } from "@/components/TxStatus";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, MonoLabel } from "@/components/ui/card";
import { createMission, CURRENT_BUYER } from "@/lib/frontend/api";
import { createMissionTx, type TxState } from "@/lib/frontend/chain";
import { useWalletStatus } from "@/lib/frontend/hooks";
import { fileToCoverDataUrl } from "@/lib/frontend/media";
import { CATEGORY_LABELS, type Category, type MissionPost } from "@/lib/frontend/types";
import { cn, formatMon } from "@/lib/frontend/utils";

const DEFAULT_CRITERIA = [
  "En az 10 saniye, kesintisiz tek çekim",
  "Eller ve nesne kadrajda net görünüyor",
  "Yeterli ışık, bulanık olmayan görüntü",
];

const inputClass =
  "w-full rounded-xl border-[1.5px] border-ink bg-white px-4 py-3 text-[15px] outline-none placeholder:text-ink/40 focus:border-primary";

/** Number input with a unit ("MON", "video") inside the box. */
function UnitInput({
  value,
  onChange,
  unit,
  step,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  step: string;
  className?: string;
}) {
  return (
    <div className="flex items-center rounded-xl border-[1.5px] border-ink bg-white px-4 focus-within:border-primary">
      <input
        type="number"
        min="0"
        step={step}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("w-full min-w-0 bg-transparent py-3 text-[15px] tabular-nums outline-none", className)}
      />
      <span className="shrink-0 pl-2 text-[15px] text-ink/60">{unit}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{label}</span>
        {hint && <span className="font-mono text-[11px] text-danger">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export default function NewMissionPage() {
  const toast = useToast();
  const { isConnected } = useWalletStatus();
  const { connectWallet } = useConnectWallet();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("gundelik");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<string[]>(DEFAULT_CRITERIA);
  const [newCriterion, setNewCriterion] = useState("");
  const [reward, setReward] = useState("0.10");
  const [target, setTarget] = useState("100");
  const [limit, setLimit] = useState("5");
  const [cover, setCover] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [tx, setTx] = useState<TxState>({ stage: "idle" });
  const [createdId, setCreatedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rewardNum = Number(reward) || 0;
  const targetNum = Math.floor(Number(target) || 0);
  const limitNum = Math.floor(Number(limit) || 0);
  const budget = rewardNum * targetNum;
  const busy = tx.stage === "awaiting_signature" || tx.stage === "pending";

  const errors = {
    title: title.trim().length < 3 ? "En az 3 karakter" : null,
    reward: rewardNum <= 0 ? "0'dan büyük olmalı" : null,
    target: targetNum < 1 ? "En az 1" : null,
    limit: limitNum < 1 ? "En az 1" : limitNum > targetNum ? "Hedeften büyük olamaz" : null,
  };
  const valid = !Object.values(errors).some(Boolean);

  const preview: MissionPost = useMemo(
    () => ({
      id: "preview",
      chainMissionId: "",
      buyerAddress: "",
      title: title.trim() || "Görev başlığı",
      description: description.trim() || "Görev açıklaması burada görünecek.",
      rewardMon: rewardNum,
      targetCount: Math.max(targetNum, 1),
      acceptedCount: 0,
      status: "active",
      company: CURRENT_BUYER,
      category,
      coverUrl: cover ?? "",
      sampleVideoUrl: "",
      createdAt: new Date(0).toISOString(),
      registeredCount: 0,
      perUserLimit: Math.max(limitNum, 1),
      minDurationSec: 10,
      criteria,
      isRegistered: false,
      isSaved: false,
      myUploads: 0,
      myAccepted: 0,
      myReviewing: 0,
      myRejected: 0,
      myEarnedMon: 0,
    }),
    [title, description, rewardNum, targetNum, limitNum, category, cover, criteria],
  );

  async function onPickCover(file: File) {
    setCoverLoading(true);
    try {
      setCover(await fileToCoverDataUrl(file));
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setCoverLoading(false);
    }
  }

  function addCriterion() {
    const c = newCriterion.trim();
    if (!c) return;
    setCriteria((prev) => [...prev, c]);
    setNewCriterion("");
  }

  async function submit() {
    if (!valid || busy) return;
    if (!isConnected) {
      connectWallet();
      return;
    }
    const result = await createMissionTx({ title, rewardMon: rewardNum, targetCount: targetNum }, setTx);
    if (result.stage !== "success") {
      toast({ kind: "error", title: "İşlem başarısız", description: result.error });
      return;
    }
    const mission = await createMission({
      title: title.trim(),
      category,
      description: description.trim(),
      criteria,
      rewardMon: rewardNum,
      targetCount: targetNum,
      perUserLimit: limitNum,
      coverUrl: cover ?? undefined,
      txHash: result.hash,
    });
    setCreatedId(mission.id);
    toast({ kind: "success", title: "Görev yayında", description: `${formatMon(budget)} MON kilitlendi.` });
  }

  const lockText = `${targetNum} × ${formatMon(rewardNum)} = ${formatMon(budget, 0)} MON`;

  return (
    <BuyerShell crumb="Şirket · Yeni post">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
        {/* Form */}
        <div className="space-y-5">
          <h1 className="text-3xl font-bold tracking-tight">Veri görevi paylaş</h1>

          <Field label="Post başlığı" hint={errors.title && title ? errors.title : undefined}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ör. Masadan şeffaf şişe kaldırma videosu (10–20 sn)"
              className={inputClass}
              maxLength={80}
            />
          </Field>

          <div>
            <span className="mb-1.5 block text-sm font-bold">Kategori</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "h-10 rounded-full border-[1.5px] border-ink px-4 text-sm font-medium",
                    category === c ? "bg-ink text-white" : "bg-white hover:bg-ice",
                  )}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative grid h-full min-h-36 w-full place-items-center overflow-hidden rounded-xl border-[1.5px] border-dashed border-ink bg-white text-sm text-ink/70 hover:border-primary hover:text-primary"
              >
                {coverLoading ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : cover ? (
                  <>
                    <CoverImage src={cover} className="absolute inset-0 size-full" />
                    <span className="absolute right-2 bottom-2 rounded-full border-[1.5px] border-ink bg-white px-2.5 py-0.5 text-xs text-ink">
                      Değiştir
                    </span>
                  </>
                ) : (
                  <span className="flex flex-col items-center gap-1.5 px-4 text-center">
                    <ImagePlus className="size-5" />+ Örnek foto / video yükle
                  </span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickCover(f);
                  e.target.value = "";
                }}
              />
            </div>
            <Field label="Açıklama ve kabul kriterleri">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Ne çekilmeli, hangi ortamda, neden?"
                className={cn(inputClass, "resize-y")}
              />
            </Field>
          </div>

          <div>
            <ul className="flex flex-wrap gap-2">
              {criteria.map((c, i) => (
                <li
                  key={`${c}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-sky bg-white py-1 pr-1 pl-3 text-sm"
                >
                  {c}
                  <button
                    type="button"
                    aria-label="Kriteri sil"
                    onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))}
                    className="grid size-6 place-items-center rounded-full text-ink/50 hover:bg-ice hover:text-danger"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCriterion();
                  }
                }}
                placeholder="Kriter ekle (ör. Şişe masada başlar)"
                className={cn(inputClass, "py-2 text-sm")}
              />
              <Button type="button" variant="outline" onClick={addCriterion} aria-label="Kriter ekle">
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Video başı ödül" hint={errors.reward ?? undefined}>
              <UnitInput value={reward} onChange={setReward} unit="MON" step="0.01" className="font-bold text-primary" />
            </Field>
            <Field label="Hedef video" hint={errors.target ?? undefined}>
              <UnitInput value={target} onChange={setTarget} unit="video" step="1" />
            </Field>
            <Field label="Kişi başı limit" hint={errors.limit ?? undefined}>
              <UnitInput value={limit} onChange={setLimit} unit="video" step="1" />
            </Field>
          </div>

          {/* Lock summary + CTA */}
          <div className="rounded-2xl border-[1.5px] border-ink bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-ink/65">Kontrata kilitlenecek</p>
                <p className="text-2xl font-bold tracking-tight text-primary tabular-nums sm:text-3xl">{lockText}</p>
              </div>
              {!createdId && (
                <Button size="lg" className="h-13 shrink-0 px-6 font-bold" onClick={submit} disabled={!valid || busy}>
                  {busy && <Loader2 className="size-5 animate-spin" />}
                  {!isConnected ? "Cüzdan bağla ve devam et" : "Bütçeyi kilitle ve paylaş"}
                </Button>
              )}
            </div>
            {tx.stage !== "idle" && <TxStatus state={tx} className="mt-4 border-sky" />}
            {tx.stage === "error" && (
              <Button variant="outline" className="mt-3 w-full" onClick={() => setTx({ stage: "idle" })}>
                <RotateCcw className="size-4" /> Tekrar dene
              </Button>
            )}
            <p className="mt-3 font-mono text-[11px] text-ink/55">
              Bütçe sadece kabul edilen videolara ödenir, kalanı iade edilebilir. Demo: başlıkta &ldquo;fail&rdquo;
              geçerse işlem hata verir.
            </p>
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-4 lg:sticky lg:top-26 lg:self-start">
          <MonoLabel className="block normal-case">ÖNİZLEME · akışta böyle görünecek</MonoLabel>
          <MissionPostCard mission={preview} preview />

          {createdId && (
            <Card className="animate-toast-in border-success p-5">
              <p className="text-lg font-bold">Görev yayında</p>
              <p className="mt-1 text-sm text-ink/70">
                <b className="text-primary">{formatMon(budget)} MON</b> kontratta kilitlendi.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <LinkButton href={`/buyer/missions/${createdId}`}>
                  Dashboard <ArrowRight className="size-4" />
                </LinkButton>
                <LinkButton href="/explore" variant="outline">
                  Akışta gör
                </LinkButton>
              </div>
            </Card>
          )}
          <p className="font-mono text-[11px] text-ink/50">
            <Link href="/buyer" className="underline">
              ← Görevlerim
            </Link>
          </p>
        </div>
      </div>
    </BuyerShell>
  );
}
