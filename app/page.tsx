import { ArrowRight, BadgeCheck, Camera, Coins, Megaphone } from "lucide-react";
import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";
import { LiveMissions } from "@/components/landing/LiveMissions";
import { Logo } from "@/components/shell/Logo";
import { LinkButton } from "@/components/ui/button";
import { MonoLabel } from "@/components/ui/card";

const STEPS = [
  { icon: Megaphone, title: "Görev aç", text: "Physical AI şirketi ihtiyacı olan veriyi tanımlar, bütçeyi MON olarak kontrata kilitler." },
  { icon: Camera, title: "Çek", text: "Katkıcılar göreve kayıt olur, telefonla kısa bir video çeker ve yükler." },
  { icon: BadgeCheck, title: "AI doğrular", text: "Süre, benzersizlik ve görev kriterleri saniyeler içinde otomatik kontrol edilir." },
  { icon: Coins, title: "Anında ödeme", text: "Kabul edilen her video için ödül Monad üzerinden anında cüzdana gönderilir." },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b-[1.5px] border-ink bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/explore" className="hidden rounded-full px-3.5 py-1.5 text-sm hover:bg-ice sm:inline">
              Keşfet
            </Link>
            <Link href="/buyer" className="hidden rounded-full px-3.5 py-1.5 text-sm hover:bg-ice sm:inline">
              Şirketler için
            </Link>
            <ConnectWallet />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* Hero */}
        <section className="py-14 md:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-white px-3 py-1 font-mono text-[11px] tracking-wider uppercase">
            <span className="size-1.5 rounded-full bg-primary" /> Monad Testnet üzerinde canlı
          </span>
          <h1 className="mt-5 max-w-4xl text-5xl leading-[1.02] font-bold tracking-tight md:text-7xl">
            Real-world data for <span className="text-primary">Physical AI</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink/75 md:text-xl">
            Robotik şirketleri ihtiyaç duyduğu gerçek dünya verisi için görev açar. Sen telefonunla çekersin, AI
            doğrular, kabul edilen her video için MON anında cüzdanına gelir.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/explore" size="lg">
              Görevlere göz at <ArrowRight className="size-5" />
            </LinkButton>
            <LinkButton href="/buyer/new" size="lg" variant="outline">
              Görev oluştur
            </LinkButton>
          </div>
        </section>

        {/* Live missions */}
        <section className="pb-16">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <MonoLabel>Şu an açık</MonoLabel>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Canlı görevler</h2>
            </div>
            <Link href="/explore" className="text-sm font-bold text-primary hover:underline">
              Tümünü gör →
            </Link>
          </div>
          <LiveMissions />
        </section>

        {/* How it works */}
        <section className="pb-20">
          <MonoLabel>Nasıl çalışır</MonoLabel>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Dört adımda veri → MON</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-2xl border-[1.5px] border-ink bg-white p-5">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl border-[1.5px] border-ink bg-ice">
                    <Icon className="size-5 text-primary" />
                  </span>
                  <span className="font-mono text-3xl font-bold text-sky">0{i + 1}</span>
                </div>
                <p className="mt-4 text-lg font-bold">{title}</p>
                <p className="mt-1 text-sm text-ink/70">{text}</p>
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
