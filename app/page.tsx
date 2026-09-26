import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";
import { LandingStats, LiveMissions } from "@/components/landing/LiveMissions";
import { Burst } from "@/components/Burst";
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

// Alternating accent blocks, like the reference's lime/black cards.
const STEP_TONES = [
  "bg-lemon text-black",
  "bg-canvas text-ink [&>span]:text-pink",
  "bg-pink text-black",
  "bg-canvas text-ink [&>span]:text-lemon",
];

const NAV = [
  { href: "/explore", label: "Görevler" },
  { href: "/buyer", label: "Şirketler için" },
  { href: "#nasil-calisir", label: "Nasıl çalışır" },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-[1.5px] border-line bg-canvas">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 md:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-[15px] hover:text-accent">
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

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:py-20 lg:grid-cols-2">
          <div className="relative">
            <Burst className="absolute -top-10 right-4 size-16 animate-[spin_24s_linear_infinite] fill-pink sm:right-16 lg:-top-12" />
            <Burst className="absolute top-2 right-24 size-7 fill-lemon sm:right-36" />
            <p className="font-mono text-xs tracking-wider text-pink uppercase">Physical AI için veri görevleri</p>
            <h1 className="mt-3 text-5xl leading-[1.02] font-bold tracking-tight md:text-6xl">
              Real-world data for <span className="text-lemon">Physical AI.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-ink/75">
              Şirketler veri görevi açar. İnsanlar telefonlarıyla çeker. AI doğrular. Kabul edilen her örnek Monad
              üzerinden anında ödenir.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/explore" variant="lemon" size="lg" className="font-bold">
                Görevlere göz at
              </LinkButton>
              <LinkButton href="/buyer/new" size="lg" variant="outline" className="font-bold">
                Görev oluştur
              </LinkButton>
            </div>
          </div>

          <div>
            <MonoLabel className="mb-3 flex items-center gap-2">
              <span className="size-1.5 animate-pulse rounded-full bg-success" /> Canlı görevler
            </MonoLabel>
            <LiveMissions />
            <Link href="/explore" className="mt-3 inline-block text-sm font-bold text-pink hover:underline">
              Tümünü gör →
            </Link>
          </div>
        </section>

        {/* Purple accent band */}
        <section id="nasil-calisir" className="relative scroll-mt-6 overflow-hidden bg-primary py-16 text-white">
          <Burst className="absolute -right-24 -bottom-24 size-96 fill-black/15" />
          <div className="relative mx-auto max-w-6xl px-4">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Nasıl çalışır</h2>
              <Burst className="size-8 fill-lemon" />
            </div>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className={`rounded-2xl p-5 ${STEP_TONES[i]}`}>
                  <span className="font-mono text-3xl font-bold">0{i + 1}</span>
                  <p className="mt-3 text-lg font-bold">{s.title}</p>
                  <p className="text-sm opacity-75">{s.text}</p>
                </li>
              ))}
            </ol>
            <LandingStats />
          </div>
        </section>
      </main>

      <footer className="bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-xs text-ink/60">
          <span>DBForge · Data Bounty Forge</span>
          <span>Monad Testnet · chainId 10143</span>
        </div>
      </footer>
    </div>
  );
}
