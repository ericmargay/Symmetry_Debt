/** Languages the app speaks. Spanish is the default; English is the second language. */
export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

/** Cookie that remembers the visitor's language (also mirrored in the user's preferences). */
export const LOCALE_COOKIE = "sd_locale";

/** Cookie set when the visitor dismisses the "also available in your language" hint. */
export const LOCALE_HINT_COOKIE = "sd_locale_hint";

/** BCP 47 tags used for dates, numbers and currencies. */
export const intlLocales: Record<Locale, string> = {
  es: "es-MX",
  en: "en-US",
};

export const localeNames: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
