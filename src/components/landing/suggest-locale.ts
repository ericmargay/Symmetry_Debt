import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, LOCALE_HINT_COOKIE, type Locale } from "@/i18n/config";

/**
 * The supported language a browser prefers most, read from its Accept-Language header
 * ("en-US,en;q=0.9,es;q=0.8" → "en"). Null when it lists none of ours.
 */
export function preferredLocale(acceptLanguage: string | null): Locale | null {
  if (!acceptLanguage) return null;

  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag = "", ...parameters] = part.trim().split(";");
      const weight = parameters.map((parameter) => parameter.trim()).find((parameter) => parameter.startsWith("q="));
      const quality = weight === undefined ? 1 : Number(weight.slice(2));
      return {
        language: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      };
    })
    .filter((entry) => entry.language !== "" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const entry of ranked) {
    if (isLocale(entry.language)) return entry.language;
  }
  return null;
}

/**
 * Whether to OFFER another language to this visitor. The page is never switched for them:
 * the default stays Spanish until they choose. Nothing is offered once they have chosen a
 * language or dismissed the offer.
 */
export async function suggestedLocale(current: Locale): Promise<Locale | null> {
  const jar = await cookies();
  if (jar.get(LOCALE_COOKIE) || jar.get(LOCALE_HINT_COOKIE)) return null;

  const preferred = preferredLocale((await headers()).get("accept-language"));
  return preferred !== null && preferred !== current ? preferred : null;
}
