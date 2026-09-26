"use client";

import { Bookmark, CheckCheck, ListChecks } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CoverImage } from "@/components/CoverImage";
import { EmptyState } from "@/components/EmptyState";
import { FilterTabs } from "@/components/FilterTabs";
import { useLocale, useT } from "@/components/I18nProvider";
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
  const t = useT();
  const locale = useLocale();
  return (
    <Card className="p-4">
      <Link href={`/mission/${mission.id}`} className="group flex items-center gap-3">
        <CoverImage src={mission.coverUrl} label="" className="size-14 shrink-0 rounded-xl border-[1.5px] border-border" />
        <div className="min-w-0">
          <p className="truncate text-lg leading-tight font-bold text-text group-hover:underline">{mission.title}</p>
          <p className="mt-0.5 truncate text-sm text-muted">
            {mission.company.name} · <b className="text-money">{formatMon(mission.rewardMon)} MON</b> / video
          </p>
        </div>
      </Link>

      {mission.isRegistered ? (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-bold text-text">{t.common.yourUploads}</span>
            <span className="text-muted tabular-nums">
              {t.common.uploadsOf(mission.myUploads, mission.perUserLimit)}
            </span>
          </div>
          <ProgressBar value={mission.myUploads} max={mission.perUserLimit} />
          {mission.myLastRejectReason ? (
            <p className="mt-2.5 text-sm text-danger">
              {t.registered.rejected(mission.myRejected, mission.myLastRejectReason.toLocaleLowerCase(locale))}
              <Link href={captureHref} className="font-bold underline underline-offset-2">
                {t.registered.retry}
              </Link>
            </p>
          ) : (
            (mission.myAccepted > 0 || mission.myReviewing > 0) && (
              <div className="mt-2.5 flex items-center justify-between text-sm">
                <span className="flex gap-4">
                  {mission.myAccepted > 0 && <span className="text-money">{t.common.acceptedCount(mission.myAccepted)}</span>}
                  {mission.myReviewing > 0 && <span className="text-warn">{t.common.reviewingCount(mission.myReviewing)}</span>}
                </span>
                {mission.myEarnedMon > 0 && (
                  <span className="font-bold text-money tabular-nums">+{formatMon(mission.myEarnedMon)} MON</span>
                )}
              </div>
            )
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">{t.registered.notRegistered(mission.registeredCount)}</p>
      )}

      {canUpload && primary && (
        <LinkButton href={captureHref} size="lg" className="mt-4 h-13 w-full font-bold">
          {t.registered.upload}
        </LinkButton>
      )}
      {canUpload && !primary && (
        <Link href={captureHref} className="mt-3 inline-block text-sm font-bold text-link underline underline-offset-2">
          {mission.isRegistered ? t.registered.uploadArrow : t.registered.registerAndShoot}
        </Link>
      )}
      {!canUpload && (
        <p className="mt-3 font-mono text-xs text-muted">{completed ? t.registered.missionDone : t.registered.limitFull}</p>
      )}
    </Card>
  );
}

const EMPTY_ICONS: Record<Tab, typeof ListChecks> = {
  active: ListChecks,
  saved: Bookmark,
  done: CheckCheck,
};

export default function RegisteredPage() {
  const [tab, setTab] = useState<Tab>("active");
  const { data, loading } = useApi(getMyRegistrations);
  const list = data?.[tab] ?? [];
  const t = useT();
  const empty = t.registered.empty[tab];

  return (
    <AppShell
      title={t.registered.title}
      subheader={
        <FilterTabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: t.registered.tabs.active, count: data?.active.length },
            { value: "saved", label: t.registered.tabs.saved, count: data?.saved.length },
            { value: "done", label: t.registered.tabs.done, count: data?.done.length },
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
            icon={EMPTY_ICONS[tab]}
            title={empty.title}
            description={empty.description}
            action={<LinkButton href="/explore">{t.common.browseMissions}</LinkButton>}
          />
        ) : (
          list.map((m, i) => <RegistrationCard key={m.id} mission={m} tab={tab} primary={i === 0} />)
        )}
      </div>
    </AppShell>
  );
}
