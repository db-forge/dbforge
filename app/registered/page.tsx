"use client";

import { Bookmark, CheckCheck, ListChecks } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CoverImage } from "@/components/CoverImage";
import { EmptyState } from "@/components/EmptyState";
import { FilterTabs } from "@/components/FilterTabs";
import { ProgressBar } from "@/components/ProgressBar";
import { AppShell } from "@/components/shell/AppShell";
import { LinkButton } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { getMyRegistrations } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import type { MissionPost } from "@/lib/frontend/types";
import { formatMon } from "@/lib/frontend/utils";

type Tab = "active" | "saved" | "done";

function RegistrationCard({ mission, tab, primary }: { mission: MissionPost; tab: Tab; primary: boolean }) {
  const completed = mission.status === "completed";
  const canUpload = !completed && mission.myUploads < mission.perUserLimit;
  const captureHref = `/mission/${mission.id}/capture`;
  return (
    <Card className="p-4">
      <Link href={`/mission/${mission.id}`} className="group flex items-center gap-3">
        <CoverImage src={mission.coverUrl} label="" className="size-14 shrink-0 rounded-xl border-[1.5px] border-ink" />
        <div className="min-w-0">
          <p className="truncate text-lg leading-tight font-bold group-hover:text-primary">{mission.title}</p>
          <p className="mt-0.5 truncate text-sm text-ink/65">
            {mission.company.name} · <b className="text-primary">{formatMon(mission.rewardMon)} MON</b> / video
          </p>
        </div>
      </Link>

      {mission.isRegistered ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-bold">Senin yüklemen</span>
            <span className="tabular-nums">
              {mission.myUploads} / {mission.perUserLimit} video
            </span>
          </div>
          <ProgressBar
            value={mission.myUploads}
            max={mission.perUserLimit}
            tone={tab === "done" ? "success" : "primary"}
          />
          {mission.myLastRejectReason ? (
            <p className="mt-2.5 text-sm text-danger">
              {mission.myRejected} video reddedildi: {mission.myLastRejectReason.toLocaleLowerCase("tr")} —{" "}
              <Link href={captureHref} className="font-bold underline underline-offset-2">
                tekrar dene
              </Link>
            </p>
          ) : (
            (mission.myAccepted > 0 || mission.myReviewing > 0) && (
              <div className="mt-2.5 flex items-center justify-between text-sm">
                <span className="flex gap-4">
                  {mission.myAccepted > 0 && <span className="text-success">✓ {mission.myAccepted} kabul</span>}
                  {mission.myReviewing > 0 && <span className="text-warning">◐ {mission.myReviewing} incelemede</span>}
                </span>
                {mission.myEarnedMon > 0 && (
                  <span className="font-bold text-primary tabular-nums">+{formatMon(mission.myEarnedMon)} MON</span>
                )}
              </div>
            )
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink/60">Henüz kayıt olmadın · {mission.registeredCount} kişi kayıtlı</p>
      )}

      {canUpload && primary && (
        <LinkButton href={captureHref} size="lg" className="mt-4 h-13 w-full font-bold">
          Video yükle
        </LinkButton>
      )}
      {canUpload && !primary && (
        <Link href={captureHref} className="mt-3 inline-block text-sm font-bold text-primary underline underline-offset-2">
          {mission.isRegistered ? "Video yükle →" : "Kayıt ol ve çek →"}
        </Link>
      )}
      {!canUpload && (
        <p className="mt-3 font-mono text-xs text-ink/55">{completed ? "Görev tamamlandı" : "Yükleme limiti doldu"}</p>
      )}
    </Card>
  );
}

const EMPTY: Record<Tab, { title: string; description: string; icon: typeof ListChecks }> = {
  active: {
    title: "Devam eden kaydın yok",
    description: "Akıştan bir göreve kayıt ol, videonu çek, anında MON kazan.",
    icon: ListChecks,
  },
  saved: {
    title: "Kaydedilen görev yok",
    description: "Postlardaki yer imi ikonuyla görevleri sonraya sakla.",
    icon: Bookmark,
  },
  done: {
    title: "Henüz biten görev yok",
    description: "Limitini doldurduğun veya tamamlanan görevler burada listelenir.",
    icon: CheckCheck,
  },
};

export default function RegisteredPage() {
  const [tab, setTab] = useState<Tab>("active");
  const { data, loading } = useApi(getMyRegistrations);
  const list = data?.[tab] ?? [];
  const empty = EMPTY[tab];

  return (
    <AppShell
      title="Kayıtlı işlemlerim"
      subheader={
        <FilterTabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: "Devam eden", count: data?.active.length },
            { value: "saved", label: "Kaydedilenler", count: data?.saved.length },
            { value: "done", label: "Biten", count: data?.done.length },
          ]}
        />
      }
    >
      <div className="space-y-4">
        {loading && !data ? (
          <>
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-44 rounded-2xl" />
          </>
        ) : list.length === 0 ? (
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            action={<LinkButton href="/explore">Görevlere göz at</LinkButton>}
          />
        ) : (
          list.map((m, i) => <RegistrationCard key={m.id} mission={m} tab={tab} primary={i === 0} />)
        )}
      </div>
    </AppShell>
  );
}
