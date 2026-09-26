"use client";

import { Building2, UserRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { safeNext } from "@/lib/frontend/auth-validation";
import { useContributorT } from "@/lib/frontend/i18n/auth/contributor";

function withNext(path: string, next: string | null) {
  const safe = next ? safeNext(next, "") : "";
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}

function Choose() {
  const d = useContributorT();
  const next = useSearchParams().get("next");
  const options = [
    { href: withNext("/company/login", next), icon: Building2, title: d.choose.companyTitle, body: d.choose.companyBody, cta: d.choose.companyCta },
    { href: withNext("/contributor/join", next), icon: UserRound, title: d.choose.contributorTitle, body: d.choose.contributorBody, cta: d.choose.contributorCta },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">{d.choose.title}</h1>
      <p className="mt-2 text-muted">{d.choose.subtitle}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {options.map(({ href, icon: Icon, title, body, cta }) => (
          <Link
            key={title}
            href={href}
            className="group flex flex-col rounded-2xl border-[1.5px] border-border bg-surface p-6 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Icon className="size-8 text-primary" />
            <h2 className="mt-4 text-xl font-bold">{title}</h2>
            <p className="mt-2 flex-1 text-sm text-muted">{body}</p>
            <span className="mt-6 text-sm font-bold text-link group-hover:underline">{cta} →</span>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default function AuthChoosePage() {
  return (
    <Suspense>
      <Choose />
    </Suspense>
  );
}
