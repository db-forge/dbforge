import Link from "next/link";
import { SessionMenu } from "@/components/auth/SessionMenu";
import { LandingStats, LiveMissions } from "@/components/landing/LiveMissions";
import { Burst } from "@/components/Burst";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { NetworkPill } from "@/components/NetworkPill";
import { Logo } from "@/components/shell/Logo";
import { LinkButton } from "@/components/ui/button";
import { MonoLabel } from "@/components/ui/card";
import { getServerDict } from "@/lib/frontend/i18n/server";

export default async function HomePage() {
  const t = await getServerDict();
  const nav = [
    { href: "/explore", label: t.landing.nav.missions },
    { href: "/buyer", label: t.landing.nav.companies },
    { href: "#nasil-calisir", label: t.landing.nav.how },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-[1.5px] border-border bg-bg">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="text-[15px] hover:text-link">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <NetworkPill className="hidden sm:inline-flex" />
            <SessionMenu />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:py-20 lg:grid-cols-2">
          <div className="relative">
            <Burst className="absolute -top-8 right-6 size-12 fill-primary sm:right-16 lg:-top-10" />
            <p className="text-sm font-medium text-muted">{t.landing.eyebrow}</p>
            <h1 className="mt-4 text-5xl leading-[0.98] font-bold tracking-[-0.035em] md:text-7xl">
              {t.landing.headlineBefore}
              <span className="text-primary-ink">{t.landing.headlineAccent}</span>
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">
              {t.landing.lead}
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <LinkButton href="/explore" size="lg" className="font-bold">
                {t.common.browseMissions}
              </LinkButton>
              <LinkButton href="/buyer/new" size="lg" variant="outline" className="font-bold">
                {t.common.createMission}
              </LinkButton>
            </div>
          </div>

          <div>
            <MonoLabel className="mb-3 flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-money" /> {t.landing.liveMissions}
            </MonoLabel>
            <LiveMissions />
            <Link href="/explore" className="mt-4 inline-block text-sm font-bold text-link hover:underline">
              {t.common.seeAllArrow}
            </Link>
          </div>
        </section>

        <section id="nasil-calisir" className="scroll-mt-6 border-y-[1.5px] border-border bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="max-w-xl text-3xl font-bold tracking-tight md:text-4xl">{t.landing.howTitle}</h2>
            {/* Steps as a ruled sequence, not a card grid: the number carries order, the top rule carries progress. */}
            <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {t.landing.steps.map((s, i) => (
                <li key={s.title} className="border-t-[1.5px] border-border pt-5 first:border-primary">
                  <span className="font-mono text-sm text-primary-ink tabular-nums">{i + 1}</span>
                  <p className="mt-2 text-lg leading-snug font-bold">{s.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
            <LandingStats />
          </div>
        </section>
      </main>

      <footer className="bg-bg">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-xs text-muted">
          <span>DBForge · Data Bounty Forge</span>
          <span>Monad Testnet · chainId 10143</span>
        </div>
      </footer>
    </div>
  );
}
