"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, getDict, type Locale } from "@/lib/frontend/i18n";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Receives the cookie locale from the root layout so SSR and client agree. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

/** Current dictionary: `const t = useT(); t.nav.explore`. */
export function useT() {
  return getDict(useLocale());
}
