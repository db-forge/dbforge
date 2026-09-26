import { cookies } from "next/headers";
import { DEFAULT_LOCALE, getDict, isLocale, LOCALE_COOKIE, type Locale } from "./index";

/** Locale from the request cookie (Server Components only). */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getServerDict() {
  return getDict(await getLocale());
}
