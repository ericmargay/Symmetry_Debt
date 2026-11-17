import type { NextRequest } from "next/server";
import { safeEqual } from "@/server/crypto";
import { env } from "@/server/env";
import { runReminders } from "@/server/services/reminders";

export const dynamic = "force-dynamic";

/**
 * Lets an external scheduler run the due-date reminders:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://example.org/debt/api/cron/reminders
 *
 * The job is idempotent, so it does no harm to also run it on the built-in timer.
 * Without CRON_SECRET configured the endpoint does not exist.
 */
export async function POST(request: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret) return new Response(null, { status: 404 });

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, secret)) return new Response(null, { status: 401 });

  const result = await runReminders();
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
