"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMyRegistrations } from "@/lib/frontend/api";
import { useApi, useIsClient, useWalletStatus } from "@/lib/frontend/hooks";
import { cn, shortAddr } from "@/lib/frontend/utils";
import { Avatar } from "../Avatar";
import { buttonClass } from "../ui/button";
import { Logo } from "./Logo";
import { isActive, NAV_ITEMS } from "./nav";

/** "Video yükle" goes straight to the first active registration's camera. */
export function useUploadHref() {
  const { data } = useApi(getMyRegistrations);
  const first = data?.active[0];
  return first ? `/mission/${first.id}/capture` : "/explore";
}

export function SideNav() {
  const pathname = usePathname();
  const uploadHref = useUploadHref();
  const { address, isConnected } = useWalletStatus();
  const mounted = useIsClient();

  return (
    <aside className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col justify-between px-3 py-5 md:flex lg:w-64 lg:px-4">
      <div className="flex flex-col items-center gap-6 lg:items-stretch">
        <div className="hidden px-3 lg:block">
          <Logo href="/" />
        </div>
        <div className="lg:hidden">
          <Logo compact href="/" />
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  "flex items-center gap-4 rounded-full px-3 py-3 text-lg transition-colors hover:bg-surface",
                  active ? "font-bold text-ink" : "text-ink",
                )}
              >
                <Icon className={cn("size-6 shrink-0", active && "text-pink")} strokeWidth={active ? 2.4 : 1.8} />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href={uploadHref} className={buttonClass("primary", "lg", "w-12 px-0 lg:w-full")} title="Video yükle">
          <Upload className="size-5" />
          <span className="hidden lg:inline">Video yükle</span>
        </Link>
        <Link
          href="/buyer"
          className="hidden px-3 font-mono text-xs text-ink/55 hover:text-pink lg:block"
        >
          Şirket paneli →
        </Link>
      </div>

      <div className="flex items-center gap-3 rounded-full p-1.5 lg:px-2">
        <Avatar initials="SN" className="size-10 border-lemon bg-lemon text-xs text-black" />
        <div className="hidden min-w-0 lg:block">
          <p className="text-sm font-bold leading-tight">Sen</p>
          <p className="truncate font-mono text-xs text-ink/60">
            {mounted && isConnected ? shortAddr(address) : "Bağlı değil"}
          </p>
        </div>
      </div>
    </aside>
  );
}
