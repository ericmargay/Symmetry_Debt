// The framework-agnostic core: usable from scripts and background jobs, with no React involved.
import { createTranslator } from "use-intl/core";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import type { Locale } from "./config";

/** The message catalogues, for code that runs outside of a page render (emails, scripts). */
export const catalogues = { es, en } as const;

export type Messages = typeof es;

/** A translator for a given language that does not depend on the current request. */
export function translatorFor(locale: Locale) {
  return createTranslator({ locale, messages: catalogues[locale] as Messages });
}
