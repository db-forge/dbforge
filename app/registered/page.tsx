"use client";

/* eslint-disable @next/next/no-img-element */
import { Bookmark, CheckCheck, ListChecks, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FilterTabs } from "@/components/FilterTabs";
import { MonAmount } from "@/components/MonAmount";
import { ProgressBar } from "@/components/ProgressBar";
import { AppShell } from "@/components/shell/AppShell";
import { LinkButton } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { getMyRegistrations } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import type { MissionPost } from "@/lib/frontend/types";

type Tab = "active" | "saved" | "done";

function RegistrationCard({ mission, tab }: { mission: MissionPost; tab: Tab }) {
  const completed = mission.status === "completed";
  const canUpload = !completed && mission.myUploads < mission.perUserLimit;
  return (
    <Card className="p-4">
      <div className="flex gap-4">
        <Link href={`/mission/${mission.id}`} className="shrink-0">
          <img
            src={mission.coverUrl}
            alt=""
            className="h-24 w-20 rounded-xl border-[1.5px] border-ink object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-ink/55">{mission.company.name}</p>
          <Link href={`/mission/${mission.id}`} className="block truncate text-lg font-bold hover:text-primary">
            {mission.title}
          </Link>
          {mission.isRegistered ? (
            <>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span>
                  <b className="tabular-nums">
                    {mission.myUploads}/{mission.perUserLimit}
                  </b>{" "}
                  video
                </span>
                <span className="flex gap-3 font-mono text-xs">
                  <span className="text-success">{mission.myAccepted} kabul</span>
                  <span className="text-warning">{mission.myReviewing} inceleme</span>
                </span>
              </div>
              <ProgressBar
                value={mission.myUploads}
                max={mission.perUserLimit}
                size="sm"
                tone={tab === "done" ? "success" : "primary"}
                className="mt-1.5"
              />
            </>
          ) : (
            <p className="mt-2 text-sm text-ink/60">Henüz kayıt olmadın.</p>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-sky pt-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-ink/55">Kazanılan</p>
          <MonAmount value={mission.myEarnedMon} size="md" />
        </div>
        {canUpload ? (
          <LinkButton href={`/mission/${mission.id}/capture`} size="md">
            <Upload className="size-4" /> Video yükle
          </LinkButton>
        ) : (
          <LinkButton href={`/mission/${mission.id}`} variant="outline" size="md">
            {completed ? "Görev tamamlandı" : "Limit doldu"}
          </LinkButton>
        )}
      </div>
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
      title="Kayıtlılarım"
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
          list.map((m) => <RegistrationCard key={m.id} mission={m} tab={tab} />)
        )}
      </div>
    </AppShell>
  );
}
