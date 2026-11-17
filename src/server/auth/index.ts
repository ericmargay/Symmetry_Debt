import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { BASE_PATH } from "@/lib/base-path";
import { prisma } from "../db";
import { createAuthAdapter } from "./adapter";

/**
 * Auth.js (next-auth v5) — Google sign-in only, database sessions.
 *
 * Under a base path, three things have to agree and all of them are derived from APP_URL
 * and NEXT_PUBLIC_BASE_PATH here, so there is a single place to get it right:
 *
 *   - the path of the auth endpoints            →  <base path>/api/auth
 *   - the redirect URI registered with Google    →  <APP_URL>/api/auth/callback/google
 *   - the path the cookies are scoped to         →  <base path>
 */

export const AUTH_BASE_PATH = `${BASE_PATH}/api/auth`;

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const SESSION_UPDATE_AGE = 60 * 60 * 24; // extend at most once a day

function publicUrl(): string | undefined {
  const url = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return url ? url : undefined;
}

function buildConfig(): NextAuthConfig {
  const appUrl = publicUrl();

  // Auth.js reads AUTH_URL itself. Deriving it from APP_URL keeps the two from disagreeing.
  if (appUrl && !process.env.AUTH_URL) {
    process.env.AUTH_URL = `${appUrl}/api/auth`;
  }

  const secure = appUrl ? appUrl.startsWith("https://") : process.env.NODE_ENV === "production";
  const prefix = secure ? "__Secure-" : "";
  // Scoped to the base path: the session never travels to other apps on the same domain.
  const cookie = { httpOnly: true, sameSite: "lax" as const, path: BASE_PATH || "/", secure };
  const issuer = process.env.AUTH_GOOGLE_ISSUER?.trim() || undefined;

  return {
    adapter: createAuthAdapter(),
    basePath: AUTH_BASE_PATH,
    // The public origin comes from APP_URL (AUTH_URL) in production; behind the reverse proxy
    // the Host header is the public host as well.
    trustHost: true,
    session: { strategy: "database", maxAge: SESSION_MAX_AGE, updateAge: SESSION_UPDATE_AGE },
    useSecureCookies: secure,
    cookies: {
      sessionToken: { name: `${prefix}sd.session`, options: cookie },
      callbackUrl: { name: `${prefix}sd.callback-url`, options: cookie },
      csrfToken: { name: `${prefix}sd.csrf`, options: cookie },
      pkceCodeVerifier: { name: `${prefix}sd.pkce`, options: { ...cookie, maxAge: 60 * 15 } },
      state: { name: `${prefix}sd.state`, options: { ...cookie, maxAge: 60 * 15 } },
      nonce: { name: `${prefix}sd.nonce`, options: cookie },
    },
    providers: [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        // Only overridden for local development and tests (scripts/mock-oidc.mjs).
        ...(issuer ? { issuer } : {}),
        checks: ["pkce", "state", "nonce"],
        authorization: { params: { scope: "openid email profile", prompt: "select_account" } },
      }),
    ],
    // Auth.js builds these as absolute URLs, so the base path has to be spelled out.
    pages: {
      signIn: `${BASE_PATH}/login`,
      error: `${BASE_PATH}/login`,
    },
    callbacks: {
      /**
       * Only accounts whose email Google has verified may sign in. This is what makes an email
       * address mean something when an invitation names one.
       */
      signIn({ account, profile }) {
        if (account?.provider !== "google") return false;
        if (!profile?.email || profile.email_verified !== true) return false;
        return true;
      },
      /**
       * What /api/auth/session and auth() expose. Built by hand on purpose: the object Auth.js
       * passes in also carries the raw session token, which must never reach page scripts.
       */
      session({ session, user }) {
        return {
          expires: session.expires,
          user: { id: user.id, name: user.name, email: user.email, image: user.image },
        } as typeof session;
      },
    },
    events: {
      /** First sign-in: start the user off in the language they were already browsing in. */
      async createUser({ user }) {
        if (!user.id) return;
        let locale: string | undefined;
        try {
          locale = (await cookies()).get(LOCALE_COOKIE)?.value;
        } catch {
          // No request scope (e.g. a script): keep the default language.
        }
        await prisma.userPreferences.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            locale: isLocale(locale) ? locale : "es",
            timeZone: process.env.DEFAULT_TIME_ZONE || "America/Mexico_City",
            defaultCurrency: process.env.DEFAULT_CURRENCY || "MXN",
          },
        });
      },
    },
    logger: {
      error(error) {
        // Never log tokens or profile data; the error name and message are enough to diagnose.
        console.error(`[auth] ${error.name}: ${error.message}`);
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
