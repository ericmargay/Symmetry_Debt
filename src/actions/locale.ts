"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, LOCALE_HINT_COOKIE } from "@/i18n/config";
import { BASE_PATH } from "@/lib/base-path";
import { updateLocale } from "@/server/services/account";
import { getActor } from "@/server/session";

const ONE_YEAR = 60 * 60 * 24 * 365;

function cookieOptions() {
  return {
    path: BASE_PATH || "/",
    maxAge: ONE_YEAR,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && (process.env.APP_URL ?? "").startsWith("https://"),
  };
}

/** Switches the language: remembered in a cookie and, for signed-in users, in their preferences. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, cookieOptions());
  const actor = await getActor();
  if (actor) await updateLocale(actor, locale);
  revalidatePath("/", "layout");
}

/** "No thanks" on the hint that offers the browser's language. */
export async function dismissLocaleHintAction(): Promise<void> {
  (await cookies()).set(LOCALE_HINT_COOKIE, "1", cookieOptions());
  revalidatePath("/", "layout");
}
