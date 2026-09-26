"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/frontend/utils";
import { isActive, NAV_ITEMS } from "./nav";
import { useUploadHref } from "./SideNav";

export function BottomTabs() {
  const pathname = usePathname();
  const uploadHref = useUploadHref();
  const items = NAV_ITEMS.filter((i) => i.mobile);

  return (
    <>
      <Link
        href={uploadHref}
        aria-label="Video yükle"
        className="fixed right-4 bottom-20 z-30 grid size-14 place-items-center rounded-full border-[1.5px] border-ink bg-primary text-white md:hidden"
      >
        <Upload className="size-6" />
      </Link>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t-[1.5px] border-ink bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[11px]",
                active ? "font-bold text-primary" : "text-ink/70",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
