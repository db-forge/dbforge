"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/frontend/utils";
import { ConnectWallet } from "../ConnectWallet";
import { Logo } from "./Logo";

const LINKS = [
  { href: "/buyer", label: "Görevlerim", exact: true },
  { href: "/buyer/new", label: "Yeni görev", exact: true },
  { href: "/explore", label: "Akışa dön", exact: false },
];

/** Desktop-first layout for company (buyer) pages. */
export function BuyerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b-[1.5px] border-ink bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Logo href="/buyer" />
            <span className="hidden rounded-full bg-ink px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white sm:inline">
              Şirket
            </span>
            <nav className="hidden items-center gap-1 md:flex">
              {LINKS.map((l) => {
                const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-sm",
                      active ? "bg-ice font-bold text-primary" : "hover:bg-ice",
                    )}
                  >
                    {l.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <ConnectWallet />
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-sky px-3 py-2 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="shrink-0 rounded-full px-3 py-1 text-sm hover:bg-ice">
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
