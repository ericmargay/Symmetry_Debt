import type { Locale } from "@/i18n/config";

/**
 * The signed-in person on whose behalf something is done.
 *
 * Services receive the actor explicitly instead of reading the session themselves, so every
 * rule can be exercised in tests without a browser.
 */
export interface Actor {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  locale: Locale;
  timeZone: string;
  defaultCurrency: string;
}

export function actorDisplayName(actor: Pick<Actor, "name" | "email">): string {
  return actor.name?.trim() || actor.email.split("@")[0];
}
