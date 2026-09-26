// Locale plumbing shared by server and client. The locale lives in a cookie so
// URLs stay the same; switching sets the cookie and reloads the page.
import { en } from "./en";
import { tr, type Dict } from "./tr";

export type { Dict };
export type Locale = "tr" | "en";

export const LOCALES: Locale[] = ["tr", "en"];
export const DEFAULT_LOCALE: Locale = "tr";
export const LOCALE_COOKIE = "dbforge-locale";

const DICTS: Record<Locale, Dict> = { tr, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as string[]).includes(value);
}

export function getDict(locale: Locale): Dict {
  return DICTS[locale];
}

/** Locale for non-React code (data layer). Server side it is always the default. */
export function currentLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return isLocale(match?.[1]) ? match[1] : DEFAULT_LOCALE;
}

/** Dictionary for non-React code (errors thrown by the data layer, mock content). */
export function t(): Dict {
  return DICTS[currentLocale()];
}

export function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
