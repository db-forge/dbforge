import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";
import { LandingStats, LiveMissions } from "@/components/landing/LiveMissions";
import { NetworkPill } from "@/components/NetworkPill";
import { Logo } from "@/components/shell/Logo";
import { LinkButton } from "@/components/ui/button";
import { MonoLabel } from "@/components/ui/card";

const STEPS = [
  { title: "Görev aç", text: "Bütçe kontratta kilitlenir" },
  { title: "Çek", text: "Telefonunla kaydet" },
  { title: "AI doğrular", text: "Kalite + sahtecilik kontrolü" },
  { title: "Anında ödeme", text: "Monad üzerinde ödenir" },
];

const NAV = [
  { href: "/explore", label: "Görevler" },
  { href: "/buyer", label: "Şirketler için" },
  { href: "#nasil-calisir", label: "Nasıl çalışır" },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-[1.5px] border-ink bg-white">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-[15px] hover:text-primary">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NetworkPill className="hidden sm:inline-flex" />
            <ConnectWallet />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <section className="grid items-center gap-12 py-14 md:py-20 lg:grid-cols-2">
          <div>
            <h1 className="text-5xl leading-[1.02] font-bold tracking-tight md:text-6xl">
              Real-world data for <span className="text-primary">Physical AI</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-ink/75">
              Şirketler veri görevi açar. İnsanlar telefonlarıyla çeker. AI doğrular. Kabul edilen her örnek Monad
              üzerinden anında ödenir.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/explore" size="lg" className="font-bold">
                Görevlere göz at
              </LinkButton>
              <LinkButton href="/buyer/new" size="lg" variant="outline" className="font-bold">
                Görev oluştur
              </LinkButton>
            </div>
            <LandingStats />
          </div>

          <div>
            <MonoLabel className="mb-3 flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-success" /> Canlı görevler
            </MonoLabel>
            <LiveMissions />
            <Link href="/explore" className="mt-3 inline-block text-sm font-bold text-primary hover:underline">
              Tümünü gör →
            </Link>
          </div>
        </section>

        <section id="nasil-calisir" className="scroll-mt-6 pb-20">
          <ol className="grid overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="border-ink p-5 not-first:border-t-[1.5px] sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(even)]:border-l-[1.5px] lg:not-first:border-t-0 lg:not-first:border-l-[1.5px]"
              >
                <span className="font-mono text-xs text-ink/55">0{i + 1}</span>
                <p className="mt-2 text-lg font-bold">{s.title}</p>
                <p className="text-sm text-ink/65">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t-[1.5px] border-ink bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-xs text-ink/60">
          <span>DBForge · Data Bounty Forge</span>
          <span>Monad Testnet · chainId 10143</span>
        </div>
      </footer>
    </div>
  );
}
