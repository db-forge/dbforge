import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/frontend/utils";
import { ConnectWallet } from "../ConnectWallet";
import { BottomTabs } from "./BottomTabs";
import { LogoMark } from "./Logo";
import { RightPanel } from "./RightPanel";
import { SideNav } from "./SideNav";

/**
 * X/Twitter-style 3-column shell:
 * lg+: side nav | feed (max 600px) | right panel
 * md:  compact side nav | feed
 * sm:  feed + bottom tab bar
 */
export function AppShell({
  title,
  backHref,
  children,
  subheader,
  wide = false,
  hideRightPanel = false,
}: {
  title: ReactNode;
  backHref?: string;
  children: ReactNode;
  subheader?: ReactNode;
  wide?: boolean;
  hideRightPanel?: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1280px] justify-center">
      <SideNav />
      <main
        className={cn(
          "min-w-0 flex-1 pb-24 md:border-x-[1.5px] md:border-sky md:pb-10",
          wide ? "max-w-[900px]" : "max-w-[600px]",
        )}
      >
        <header className="sticky top-0 z-20 border-b-[1.5px] border-sky bg-ice/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-3">
              {backHref ? (
                <Link
                  href={backHref}
                  aria-label="Geri"
                  className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-white"
                >
                  <ArrowLeft className="size-5" />
                </Link>
              ) : (
                <Link href="/" className="md:hidden">
                  <LogoMark className="size-8 text-xs" />
                </Link>
              )}
              <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            </div>
            <ConnectWallet />
          </div>
          {subheader}
        </header>
        <div className="px-3 pt-4 sm:px-4">{children}</div>
      </main>
      {!hideRightPanel && <RightPanel />}
      <BottomTabs />
    </div>
  );
}
