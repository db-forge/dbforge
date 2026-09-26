"use client";

import { Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getMyRegistrations } from "@/lib/frontend/api";
import { useApi } from "@/lib/frontend/hooks";
import { cn } from "@/lib/frontend/utils";
import { SessionMenu } from "../auth/SessionMenu";
import { useT } from "../I18nProvider";
import { LanguageSwitch } from "../LanguageSwitch";
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
  const t = useT();

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
          {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
            const label = t.nav[labelKey];
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                title={label}
                className={cn(
                  "flex items-center gap-4 rounded-full px-3 py-3 text-lg transition-colors hover:bg-surface",
                  active ? "font-bold text-primary" : "text-text",
                )}
              >
                <Icon className="size-6 shrink-0" strokeWidth={active ? 2.4 : 1.8} />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href={uploadHref} className={buttonClass("primary", "lg", "w-12 px-0 lg:w-full")} title={t.nav.upload}>
          <Upload className="size-5" />
          <span className="hidden lg:inline">{t.nav.upload}</span>
        </Link>
        <Link
          href="/buyer"
          className="hidden px-3 font-mono text-xs text-link hover:underline lg:block"
        >
          {t.nav.companyPanel}
        </Link>
      </div>

      <div className="flex flex-col items-center gap-3 lg:items-stretch">
        <LanguageSwitch variant="toggle" className="lg:hidden" />
        <LanguageSwitch className="hidden self-start lg:ml-2 lg:inline-flex" />
        <SessionMenu variant="nav" />
      </div>
    </aside>
  );
}
