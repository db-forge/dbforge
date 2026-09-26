"use client";

import { SearchX, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useT } from "@/components/I18nProvider";
import { FilterTabs } from "@/components/FilterTabs";
import { MissionPostCard, MissionPostCardSkeleton } from "@/components/MissionPostCard";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { getMissions } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { CATEGORIES, type CategoryFilter } from "@/lib/frontend/types";

function Feed() {
  const t = useT();
  const query = useSearchParams().get("q") ?? "";
  const [category, setCategory] = useState<CategoryFilter>("all");
  const { data: missions, loading } = useApi(() => getMissions({ category, query }), [category, query]);

  return (
    <AppShell
      title={t.explore.title}
      brandOnMobile
      flush
      subheader={<FilterTabs options={[
            { value: "all", label: t.explore.all },
            ...CATEGORIES.map((c) => ({ value: c, label: t.categories[c] })),
          ]} value={category} onChange={setCategory} variant="responsive" />}
    >
      {query && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-full border-[1.5px] border-border bg-surface px-4 py-2 text-sm">
          <span>
            {t.explore.resultsBefore}
            <b>{query}</b>
            {t.explore.resultsAfter}
          </span>
          <Link href="/explore" aria-label={t.explore.clearSearch} className="text-muted hover:text-text">
            <X className="size-4" />
          </Link>
        </div>
      )}
      <div>
        {loading && !missions ? (
          <>
            <MissionPostCardSkeleton />
            <MissionPostCardSkeleton />
          </>
        ) : missions && missions.length > 0 ? (
          missions.map((m) => <MissionPostCard key={m.id} mission={m} />)
        ) : (
          <EmptyState
            className="m-4"
            icon={SearchX}
            title={t.explore.emptyTitle}
            description={t.explore.emptyDesc}
            action={
              <Button variant="outline" onClick={() => setCategory("all")}>
                {t.explore.showAll}
              </Button>
            }
          />
        )}
      </div>
    </AppShell>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <Feed />
    </Suspense>
  );
}
