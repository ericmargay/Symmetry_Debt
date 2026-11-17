import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from "next-auth/adapters";
import { sha256Hex } from "../crypto";
import { prisma } from "../db";

/**
 * Subject prefix used by the local mock issuer (scripts/mock-oidc.mjs).
 * Identities created through it are not real Google identities.
 */
export const MOCK_SUBJECT_PREFIX = "mock-";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A user row can be claimed by the first verified sign-in with its email address when nobody
 * has ever proven they own it:
 *
 *   - it has no sign-in identity at all (it was created by an import script, or a sign-up was
 *     interrupted half-way), or
 *   - its only identities come from the local mock issuer (data entered while trying the app
 *     locally, later moved to a real deployment).
 *
 * A user that has a real Google identity is NEVER claimable: a different Google account with
 * the same address is refused by Auth.js (OAuthAccountNotLinked), as it should be.
 */
export function isClaimable(accounts: ReadonlyArray<{ providerAccountId: string }>): boolean {
  return accounts.every((account) => account.providerAccountId.startsWith(MOCK_SUBJECT_PREFIX));
}

function toAdapterUser(user: {
  id: string;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  image: string | null;
}): AdapterUser {
  return { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, image: user.image };
}

/**
 * The stock Prisma adapter with four changes:
 *
 *   1. Session tokens are stored hashed. A copy of the database is not a pile of live sessions.
 *   2. Provider tokens (access/refresh/id tokens) are not stored. We only need to know who
 *      signed in, not to act on their Google account.
 *   3. Emails are normalised to lower case.
 *   4. Unclaimed user rows are adopted by the first verified sign-in (see `isClaimable`).
 */
export function createAuthAdapter(): Adapter {
  const base = PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]);

  return {
    ...base,

    async getUserByEmail(email) {
      const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) },
        include: { accounts: { select: { providerAccountId: true } } },
      });
      if (!user) return null;
      // Hiding a claimable row makes Auth.js take the "new user" path, where createUser adopts it.
      if (isClaimable(user.accounts)) return null;
      return toAdapterUser(user);
    },

    async createUser(data) {
      const email = normalizeEmail(data.email);
      // Only verified addresses get this far: the signIn callback rejects the rest.
      const emailVerified = new Date();

      return prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { email },
          include: { accounts: { select: { provider: true, providerAccountId: true } } },
        });

        if (existing) {
          if (!isClaimable(existing.accounts)) {
            // Cannot happen through Auth.js (getUserByEmail would have returned this user),
            // but never fall through to adopting an owned account.
            throw new Error("A user with this email already exists");
          }
          await tx.account.deleteMany({ where: { userId: existing.id } });
          await tx.session.deleteMany({ where: { userId: existing.id } });
          const adopted = await tx.user.update({
            where: { id: existing.id },
            data: {
              emailVerified,
              name: existing.name ?? data.name ?? null,
              image: data.image ?? existing.image,
            },
          });
          return toAdapterUser(adopted);
        }

        const created = await tx.user.create({
          data: { email, emailVerified, name: data.name ?? null, image: data.image ?? null },
        });
        return toAdapterUser(created);
      });
    },

    async linkAccount(account: AdapterAccount) {
      await prisma.account.create({
        data: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
      });
    },

    async createSession(session): Promise<AdapterSession> {
      await prisma.session.create({
        data: {
          sessionToken: sha256Hex(session.sessionToken),
          userId: session.userId,
          expires: session.expires,
        },
      });
      return session;
    },

    async getSessionAndUser(sessionToken) {
      const row = await prisma.session.findUnique({
        where: { sessionToken: sha256Hex(sessionToken) },
        include: { user: true },
      });
      if (!row) return null;
      return {
        session: { sessionToken, userId: row.userId, expires: row.expires },
        user: toAdapterUser(row.user),
      };
    },

    async updateSession(session) {
      const { count } = await prisma.session.updateMany({
        where: { sessionToken: sha256Hex(session.sessionToken) },
        data: { expires: session.expires },
      });
      if (count === 0) return null;
      const row = await prisma.session.findUnique({ where: { sessionToken: sha256Hex(session.sessionToken) } });
      return row ? { sessionToken: session.sessionToken, userId: row.userId, expires: row.expires } : null;
    },

    async deleteSession(sessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken: sha256Hex(sessionToken) } });
    },
  };
}
