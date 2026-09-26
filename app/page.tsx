import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";
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
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:py-20 lg:grid-cols-2">
          <div className="relative">
            <Burst className="absolute -top-10 right-4 size-16 animate-[spin_24s_linear_infinite] fill-primary sm:right-16 lg:-top-12" />
            <Burst className="absolute top-2 right-24 size-7 fill-link sm:right-36" />
            <p className="font-mono text-xs tracking-wider text-link uppercase">{t.landing.eyebrow}</p>
            <h1 className="mt-3 text-5xl leading-[1.02] font-bold tracking-tight md:text-6xl">
              {t.landing.headlineBefore}
              <span className="text-primary">{t.landing.headlineAccent}</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted">
              {t.landing.lead}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
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
            <Link href="/explore" className="mt-3 inline-block text-sm font-bold text-link hover:underline">
              {t.common.seeAllArrow}
            </Link>
          </div>
        </section>

        <section id="nasil-calisir" className="relative scroll-mt-6 overflow-hidden border-y-[1.5px] border-border bg-surface py-16">
          <Burst className="absolute -right-24 -bottom-24 size-96 fill-primary/10" />
          <div className="relative mx-auto max-w-6xl px-4">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{t.landing.howTitle}</h2>
              <Burst className="size-8 fill-primary" />
            </div>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {t.landing.steps.map((s, i) => (
                <li key={s.title} className="rounded-2xl border-[1.5px] border-border bg-bg p-5">
                  <span className="font-mono text-3xl font-bold text-primary">0{i + 1}</span>
                  <p className="mt-3 text-lg font-bold">{s.title}</p>
                  <p className="text-sm text-muted">{s.text}</p>
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
