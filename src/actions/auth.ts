"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeInternalPath, withBasePath } from "@/lib/base-path";
import { signIn, signOut } from "@/server/auth";
import { signInConfigured } from "@/server/env";
import { isAppError } from "@/server/errors";
import { clientIp, LIMITS } from "@/server/rate-limit";

/** Starts Google sign-in and comes back to `next` (always a path inside this app). */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const next = safeInternalPath(formData.get("next")?.toString(), "/app");
  if (!signInConfigured()) redirect(`/login?error=NotConfigured&next=${encodeURIComponent(next)}`);

  try {
    await LIMITS.signIn(clientIp(await headers()));
  } catch (error) {
    if (isAppError(error)) redirect("/login?error=RateLimited");
    throw error;
  }

  // Auth.js builds an absolute URL from this, so the base path has to be part of it.
  await signIn("google", { redirectTo: withBasePath(next) });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: withBasePath("/") });
}
