import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { defaultLocale, isLocale } from "@/i18n/config";
import { isCurrencyCode } from "@/domain/currencies";
import { isValidTimeZone } from "@/domain/dates";
import type { Actor } from "./actor";
import { auth } from "./auth";
import { prisma } from "./db";
import { AppError } from "./errors";

/**
 * Who is making this request? Resolved once per request (React cache) from the session cookie.
 * Returns null for visitors that are not signed in.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { preferences: true } });
  if (!user) return null;

  const preferences =
    user.preferences ??
    (await prisma.userPreferences.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        timeZone: process.env.DEFAULT_TIME_ZONE || "America/Mexico_City",
        defaultCurrency: process.env.DEFAULT_CURRENCY || "MXN",
      },
    }));

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    locale: isLocale(preferences.locale) ? preferences.locale : defaultLocale,
    timeZone: isValidTimeZone(preferences.timeZone) ? preferences.timeZone : "America/Mexico_City",
    defaultCurrency: isCurrencyCode(preferences.defaultCurrency) ? preferences.defaultCurrency : "MXN",
  };
});

/** For pages: sends visitors to the sign-in page and brings them back afterwards. */
export async function requireActor(returnTo?: string): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    // The path the visitor asked for, as noted by src/proxy.ts.
    const target = returnTo ?? (await headers()).get("x-sd-path") ?? undefined;
    redirect(target && target !== "/app" ? `/login?next=${encodeURIComponent(target)}` : "/login");
  }
  return actor;
}

/** For server actions and route handlers: fails instead of redirecting. */
export async function requireActorOrThrow(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AppError("unauthenticated");
  return actor;
}
