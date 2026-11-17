"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { runAction } from "@/actions/_run";
import { LOCALE_COOKIE } from "@/i18n/config";
import { BASE_PATH } from "@/lib/base-path";
import type { PreferencesInput } from "@/schemas/settings";
import { signOut } from "@/server/auth";
import { sha256Hex } from "@/server/crypto";
import { deleteAccount, revokeSessions, updatePreferences } from "@/server/services/account";

const SESSION_COOKIES = ["__Secure-sd.session", "sd.session"];

export async function updatePreferencesAction(input: PreferencesInput) {
  return runAction(async (actor) => {
    await updatePreferences(actor, input);
    (await cookies()).set(LOCALE_COOKIE, input.locale, {
      path: BASE_PATH || "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
      secure: (process.env.APP_URL ?? "").startsWith("https://"),
    });
  });
}

/** Signs out every other device, keeping the session this request came from. */
export async function revokeOtherSessionsAction() {
  return runAction(async (actor) => {
    const store = await cookies();
    const current = SESSION_COOKIES.map((name) => store.get(name)?.value).find(Boolean);
    return { count: await revokeSessions(actor, current ? sha256Hex(current) : null) };
  });
}

/** Deletes the account for good. The person has to type their own email address to confirm. */
export async function deleteAccountAction(confirmationEmail: string) {
  const result = await runAction((actor) => deleteAccount(actor, confirmationEmail), { revalidate: false });
  if (!result.ok) return result;
  // The session rows are already gone with the account; this clears the cookies.
  await signOut({ redirect: false });
  redirect("/?deleted=1");
}
