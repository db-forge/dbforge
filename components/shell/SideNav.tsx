"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMyRegistrations } from "@/lib/frontend/api";
import { useApi, useWalletStatus } from "@/lib/frontend/hooks";
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <aside className="sticky top-0 hidden h-dvh w-20 shrink-0 flex-col justify-between px-3 py-5 md:flex lg:w-64 lg:px-5">
      <div className="flex flex-col items-center gap-6 lg:items-stretch">
        <div className="hidden lg:block">
          <Logo href="/explore" />
        </div>
        <div className="lg:hidden">
          <Logo compact href="/explore" />
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
                  "flex items-center gap-3 rounded-full px-3 py-2.5 text-base transition-colors hover:bg-white",
                  active ? "font-bold text-primary" : "text-ink",
                )}
              >
                <Icon className="size-6 shrink-0" strokeWidth={active ? 2.4 : 1.8} />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href={uploadHref} className={buttonClass("primary", "lg", "w-12 px-0 lg:w-full")} title="Video yükle">
          <Upload className="size-5" />
          <span className="hidden lg:inline">Video yükle</span>
        </Link>
      </div>

      <div className="flex items-center gap-3 rounded-full p-1.5 lg:border-[1.5px] lg:border-ink lg:bg-white">
        <Avatar initials="SN" className="size-9 bg-ice text-xs" />
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
