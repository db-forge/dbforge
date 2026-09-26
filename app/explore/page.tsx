"use client";

import { SearchX, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FilterTabs } from "@/components/FilterTabs";
import { MissionPostCard, MissionPostCardSkeleton } from "@/components/MissionPostCard";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { getMissions } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import type { CategoryFilter } from "@/lib/frontend/types";

const FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "teknoloji", label: "Teknoloji" },
  { value: "doga", label: "Doğa" },
  { value: "gundelik", label: "Gündelik" },
];

function Feed() {
  const query = useSearchParams().get("q") ?? "";
  const [category, setCategory] = useState<CategoryFilter>("all");
  const { data: missions, loading } = useApi(() => getMissions({ category, query }), [category, query]);

  return (
    <AppShell
      title="Keşfet"
      brandOnMobile
      flush
      subheader={<FilterTabs options={FILTERS} value={category} onChange={setCategory} variant="responsive" />}
    >
      {query && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-full border-[1.5px] border-sky bg-surface px-4 py-2 text-sm">
          <span>
            &ldquo;<b>{query}</b>&rdquo; için sonuçlar
          </span>
          <Link href="/explore" aria-label="Aramayı temizle" className="text-ink/60 hover:text-ink">
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
            title="Bu kategoride görev yok"
            description="Şirketler yeni görevler açtıkça burada görünecek. Diğer kategorilere göz at."
            action={
              <Button variant="outline" onClick={() => setCategory("all")}>
                Tüm görevleri göster
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
