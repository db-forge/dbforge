"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/frontend/hooks";
import { SessionMenu } from "../auth/SessionMenu";
import { ConnectWallet } from "../ConnectWallet";
import { LanguageSwitch } from "../LanguageSwitch";
import { NetworkPill } from "../NetworkPill";
import { Logo } from "./Logo";

/** Desktop-first layout for company (buyer) pages: "DBForge / <crumb>" header. */
export function BuyerShell({ crumb, children }: { crumb: ReactNode; children: ReactNode }) {
  const { session } = useSession();
  const companyName = session?.kind === "company" ? session.companyName : undefined;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b-[1.5px] border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo href="/buyer" crumb={crumb} />
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <LanguageSwitch className="hidden sm:inline-flex" />
            <LanguageSwitch variant="toggle" className="sm:hidden" />
            <NetworkPill className="hidden sm:inline-flex" />
            <span className="hidden sm:block">
              <ConnectWallet label={companyName} />
            </span>
            <span className="sm:hidden">
              <ConnectWallet compact />
            </span>
            <SessionMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
