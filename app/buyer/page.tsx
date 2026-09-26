"use client";

/* eslint-disable @next/next/no-img-element */
import { FolderPlus, Plus } from "lucide-react";
import Link from "next/link";
import { MonAmount } from "@/components/MonAmount";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge } from "@/components/StatusBadge";
import { BuyerShell } from "@/components/shell/BuyerShell";
import { CompanyWalletLinkCard } from "@/components/auth/CompanyWalletLinkCard";
import { EmptyState } from "@/components/EmptyState";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, MonoLabel, Skeleton } from "@/components/ui/card";
import { getBuyerMissions } from "@/lib/frontend/api";
import { useApi, useSession } from "@/lib/frontend/hooks";
import { CompanyAvatar } from "@/components/CompanyAvatar";
import { useT } from "@/components/I18nProvider";

export default function BuyerDashboardPage() {
  const { data: missions, loading } = useApi(getBuyerMissions);
  const t = useT();
  const { session } = useSession();
  // A company funds missions from its linked wallet; until then creating is off.
  const walletLinked = session?.kind === "company" && !!session.walletAddress;

  return (
    <BuyerShell crumb={t.common.myMissions}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <MonoLabel>{t.buyer.panel}</MonoLabel>
          <h1 className="text-3xl font-bold tracking-tight">{t.common.myMissions}</h1>
        </div>
        {walletLinked ? (
          <LinkButton href="/buyer/new" size="lg">
            <Plus className="size-5" /> {t.common.createMission}
          </LinkButton>
        ) : (
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button size="lg" disabled aria-describedby="wallet-required">
              <Plus className="size-5" /> {t.common.createMission}
            </Button>
            <p id="wallet-required" className="font-mono text-[11px] text-muted">
              {t.session.walletRequired}
            </p>
          </div>
        )}
      </div>

      <CompanyWalletLinkCard className="mb-6" />

      {!loading && missions?.length === 0 && (
        <EmptyState
          icon={FolderPlus}
          title={t.session.noMissionsTitle}
          description={t.session.noMissionsDesc}
          action={
            walletLinked ? (
              <LinkButton href="/buyer/new">
                <Plus className="size-4" /> {t.common.createMission}
              </LinkButton>
            ) : undefined
          }
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading && !missions
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)
          : missions?.map((m) => {
              const complete = m.acceptedCount >= m.targetCount;
              return (
                <Link key={m.id} href={`/buyer/missions/${m.id}`} className="group">
                  <Card className="overflow-hidden transition-colors group-hover:border-primary">
                    <img src={m.coverUrl} alt="" className="aspect-[16/9] w-full border-b-[1.5px] border-border object-cover" />
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <CompanyAvatar company={m.company} className="size-6 rounded-md" />
                          <span className="truncate font-mono text-xs text-muted">{m.company.name}</span>
                        </span>
                        <StatusBadge status={complete ? "completed" : "active"} />
                      </div>
                      <p className="mt-1 truncate text-lg font-bold text-text group-hover:underline">{m.title}</p>
                      <div className="mt-3 flex items-baseline justify-between">
                        <span className="font-bold tabular-nums">
                          {m.acceptedCount}
                          <span className="text-muted">/{m.targetCount}</span>
                        </span>
                        <MonAmount value={m.acceptedCount * m.rewardMon} size="sm" />
                      </div>
                      <ProgressBar
                        value={m.acceptedCount}
                        max={m.targetCount}
                        size="sm"
                        className="mt-2"
                      />
                    </div>
                  </Card>
                </Link>
              );
            })}
      </div>
    </BuyerShell>
  );
}
