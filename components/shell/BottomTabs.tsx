"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/frontend/utils";
import { useT } from "../I18nProvider";
import { isActive, NAV_ITEMS } from "./nav";

export function BottomTabs({ hidden = false }: { hidden?: boolean }) {
  const pathname = usePathname();
  const t = useT();
  if (hidden) return null;
  const items = NAV_ITEMS.filter((i) => i.mobile);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t-[1.5px] border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map(({ href, labelKey, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2.5 text-xs",
              active ? "font-bold text-primary" : "text-text",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
            {t.nav[labelKey]}
          </Link>
        );
      })}
    </nav>
  );
}
