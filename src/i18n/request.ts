import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getActor } from "@/server/session";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/**
 * Which language a request is rendered in. There is no /es or /en in the URL.
 *
 *   1. Signed in  → the language saved in the user's preferences (the same on every device).
 *   2. Otherwise  → the cookie set by the language switch.
 *   3. Otherwise  → Spanish, the default.
 *
 * The browser's language is never applied automatically; it is only used to offer a switch
 * (see LanguageHint).
 */
export async function resolveLocale(): Promise<{ locale: Locale; timeZone: string }> {
  const fallbackTimeZone = process.env.DEFAULT_TIME_ZONE || "America/Mexico_City";

  const actor = await getActor().catch(() => null);
  if (actor) return { locale: actor.locale, timeZone: actor.timeZone };

  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return { locale: isLocale(cookie) ? cookie : defaultLocale, timeZone: fallbackTimeZone };
}

export default getRequestConfig(async () => {
  const { locale, timeZone } = await resolveLocale();
  return {
    locale,
    timeZone,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
