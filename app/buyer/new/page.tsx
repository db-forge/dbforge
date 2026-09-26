"use client";

/* eslint-disable @next/next/no-img-element */
import { ArrowRight, ImagePlus, Loader2, Lock, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useConnectWallet } from "@/components/ConnectWallet";
import { MissionPostCard } from "@/components/MissionPostCard";
import { MonAmount } from "@/components/MonAmount";
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
  "w-full rounded-xl border-[1.5px] border-ink bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/40 focus:border-primary";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{label}</span>
        {hint && <span className="font-mono text-[11px] text-ink/50">{hint}</span>}
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
      coverUrl: cover ?? "/missions/bottle-drop.jpg",
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

  return (
    <BuyerShell>
      <div className="mb-6">
        <MonoLabel>Yeni veri görevi</MonoLabel>
        <h1 className="text-3xl font-bold tracking-tight">Görev oluştur</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* Form */}
        <div className="space-y-5">
          <Card className="space-y-5 p-5 sm:p-6">
            <Field label="Başlık" hint={errors.title && title ? errors.title : undefined}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ör. Masadan pet şişe düşürme"
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
                      "h-9 rounded-full border-[1.5px] px-4 text-sm font-medium",
                      category === c ? "border-primary bg-primary text-white" : "border-ink bg-white hover:bg-ice",
                    )}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-bold">Örnek foto / video</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center gap-4 rounded-xl border-[1.5px] border-dashed border-sky bg-ice/50 p-3 text-left hover:border-primary"
              >
                <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border-[1.5px] border-ink bg-white">
                  {coverLoading ? (
                    <Loader2 className="size-5 animate-spin text-primary" />
                  ) : cover ? (
                    <img src={cover} alt="" className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-6 text-primary" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold">{cover ? "Değiştir" : "Dosya yükle"}</p>
                  <p className="text-xs text-ink/60">
                    Katkıcıların ne çekeceğini gösteren bir kare. Video seçersen ilk kareyi kullanırız.
                  </p>
                </div>
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

            <Field label="Açıklama">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Ne çekilmeli, hangi ortamda, neden?"
                className={cn(inputClass, "resize-y")}
              />
            </Field>

            <div>
              <span className="mb-1.5 block text-sm font-bold">Kabul kriterleri</span>
              <ul className="space-y-2">
                {criteria.map((c, i) => (
                  <li
                    key={`${c}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-sky bg-white px-3 py-2 text-sm"
                  >
                    <span>{c}</span>
                    <button
                      type="button"
                      aria-label="Kriteri sil"
                      onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))}
                      className="grid size-6 place-items-center rounded-full text-ink/50 hover:bg-ice hover:text-danger"
                    >
                      <X className="size-4" />
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
                  placeholder="Yeni kriter ekle"
                  className={inputClass}
                />
                <Button type="button" variant="outline" onClick={addCriterion} aria-label="Kriter ekle">
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Video başı ödül" hint={errors.reward ?? "MON"}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  className={cn(inputClass, "font-bold text-primary tabular-nums")}
                />
              </Field>
              <Field label="Hedef adet" hint={errors.target ?? "video"}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={cn(inputClass, "tabular-nums")}
                />
              </Field>
              <Field label="Kişi başı limit" hint={errors.limit ?? "video"}>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className={cn(inputClass, "tabular-nums")}
                />
              </Field>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border-[1.5px] border-ink bg-ice p-4">
              <p className="font-mono text-sm tabular-nums">
                {targetNum} × {formatMon(rewardNum)} MON =
              </p>
              <p className="flex items-baseline gap-2">
                <MonAmount value={budget} size="lg" digits={0} />
                <span className="text-sm text-ink/70">kilitlenecek</span>
              </p>
            </div>
            <p className="mt-2 font-mono text-[11px] text-ink/55">
              Bütçe kontratta kilitlenir, sadece kabul edilen videolara ödenir. Kalan bütçe iade edilebilir.
            </p>
          </Card>
        </div>

        {/* Live preview + submit */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center justify-between">
            <MonoLabel>Akışta böyle görünecek</MonoLabel>
            <span className="font-mono text-[11px] text-primary">canlı önizleme</span>
          </div>
          <MissionPostCard mission={preview} preview />

          {createdId ? (
            <Card className="animate-toast-in border-success p-5">
              <p className="text-lg font-bold">Görev yayında</p>
              <p className="mt-1 text-sm text-ink/70">
                <b className="text-primary">{formatMon(budget)} MON</b> kontratta kilitlendi.
              </p>
              <TxStatus state={tx} className="mt-4 border-sky" />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <LinkButton href={`/buyer/missions/${createdId}`}>
                  Dashboard <ArrowRight className="size-4" />
                </LinkButton>
                <LinkButton href="/explore" variant="outline">
                  Akışta gör
                </LinkButton>
              </div>
            </Card>
          ) : (
            <>
              <Button size="lg" className="w-full" onClick={submit} disabled={!valid || busy}>
                {busy ? <Loader2 className="size-5 animate-spin" /> : <Lock className="size-5" />}
                {!isConnected ? "Cüzdan bağla ve devam et" : "Bütçeyi kilitle ve paylaş"}
              </Button>
              <TxStatus state={tx} />
              {tx.stage === "error" && (
                <Button variant="outline" className="w-full" onClick={() => setTx({ stage: "idle" })}>
                  <RotateCcw className="size-4" /> Tekrar dene
                </Button>
              )}
              <p className="text-center font-mono text-[11px] text-ink/50">
                Demo: başlıkta &ldquo;fail&rdquo; geçerse işlem hata verir.{" "}
                <Link href="/buyer" className="underline">
                  Görevlerim
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </BuyerShell>
  );
}
