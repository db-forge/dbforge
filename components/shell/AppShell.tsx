import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/frontend/utils";
import { ConnectWallet } from "../ConnectWallet";
import { BottomTabs } from "./BottomTabs";
import { Logo } from "./Logo";
import { RightPanel } from "./RightPanel";
import { SideNav } from "./SideNav";

/**
 * X/Twitter-style 3-column shell:
 * lg+: side nav | column (max 600px) | right panel
 * md:  compact side nav | column
 * sm:  column + bottom tab bar
 */
export function AppShell({
  title,
  backHref,
  children,
  subheader,
  actions,
  brandOnMobile = false,
  flush = false,
  immersive = false,
  wide = false,
  hideRightPanel = false,
}: {
  title: ReactNode;
  backHref?: string;
  children: ReactNode;
  subheader?: ReactNode;
  /** Header right side. Defaults to the wallet chip (hidden on lg where the right panel shows it). */
  actions?: ReactNode;
  /** Show the DBForge wordmark instead of the title on mobile. */
  brandOnMobile?: boolean;
  /** No inner padding — for divider-separated lists like the feed. */
  flush?: boolean;
  /** Mobile: no header and no bottom tabs; the page draws its own chrome. */
  immersive?: boolean;
  wide?: boolean;
  hideRightPanel?: boolean;
}) {
  const right =
    actions ??
    (hideRightPanel ? (
      <ConnectWallet compact />
    ) : (
      <div className="lg:hidden">
        <ConnectWallet compact />
      </div>
    ));

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1280px] justify-center">
      <SideNav />
      <main
        className={cn(
          "min-w-0 flex-1 bg-ice md:border-x-[1.5px] md:border-ink md:bg-white",
          immersive ? "pb-28 md:pb-10" : "pb-24 md:pb-10",
          wide ? "max-w-[900px]" : "max-w-[600px]",
        )}
      >
        <header
          className={cn(
            "sticky top-0 z-20 border-b-[1.5px] border-ink bg-white/95 backdrop-blur",
            immersive && "hidden md:block",
          )}
        >
          <div className="flex h-16 items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-3">
              {backHref && (
                <Link
                  href={backHref}
                  aria-label="Geri"
                  className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-ice"
                >
                  <ArrowLeft className="size-5" />
                </Link>
              )}
              {brandOnMobile && (
                <span className="md:hidden">
                  <Logo href="/" />
                </span>
              )}
              <h1 className={cn("truncate text-xl font-bold tracking-tight", brandOnMobile && "hidden md:block")}>
                {title}
              </h1>
            </div>
            {right}
          </div>
          {subheader}
        </header>
        <div className={cn(!flush && "px-4 pt-4")}>{children}</div>
      </main>
      {!hideRightPanel && <RightPanel />}
      <BottomTabs hidden={immersive} />
    </div>
  );
}
