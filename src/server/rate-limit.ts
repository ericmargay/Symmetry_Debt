import "server-only";
import { prisma } from "./db";
import { env } from "./env";
import { AppError } from "./errors";

/**
 * Fixed-window rate limiting backed by PostgreSQL, so the limit holds across several app
 * instances without any extra infrastructure.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  if (!env().RATE_LIMIT_ENABLED) return { ok: true, remaining: limit, retryAfterSeconds: 0 };

  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"
  `;

  const count = Number(rows[0]?.count ?? 1);
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)),
  };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const result = await rateLimit(key, limit, windowSeconds);
  if (!result.ok) throw new AppError("rate_limited", { params: { seconds: result.retryAfterSeconds } });
}

/** Named limits, so the numbers live in one place. */
export const LIMITS = {
  /** Any change made by a signed-in user. */
  mutation: (userId: string) => enforceRateLimit(`mut:${userId}`, 120, 60),
  /** Creating or re-sending invitations (each may send an email). */
  invitation: (userId: string) => enforceRateLimit(`inv:${userId}`, 20, 3600),
  /** Opening invitation links. */
  invitationLookup: (userId: string) => enforceRateLimit(`invl:${userId}`, 60, 600),
  upload: (userId: string) => enforceRateLimit(`upl:${userId}`, 60, 3600),
  export: (userId: string) => enforceRateLimit(`exp:${userId}`, 10, 3600),
  /** Starting a sign-in, per client address. */
  signIn: (ip: string) => enforceRateLimit(`signin:${ip}`, 30, 600),
} as const;

/** Removes counters of windows that ended long ago. */
export async function pruneRateLimitBuckets(): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
  });
  return count;
}

/**
 * Best-effort client address from X-Forwarded-For. Each proxy in front of the app appends the
 * address it received the request from, so with N trusted proxies the client is the N-th entry
 * from the right. Anything further left can be forged by the client and is ignored.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded.split(",").map((entry) => entry.trim()).filter(Boolean);
    const hops = env().TRUSTED_PROXY_HOPS;
    const candidate = entries[Math.max(0, entries.length - hops)];
    if (candidate) return candidate;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
