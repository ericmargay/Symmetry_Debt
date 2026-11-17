import { NextRequest } from "next/server";
import { BASE_PATH } from "@/lib/base-path";
import { handlers } from "@/server/auth";
import { sha256Hex } from "@/server/crypto";
import { prisma } from "@/server/db";

/**
 * Auth.js endpoints: <base path>/api/auth/*
 *
 * Two adjustments are made to every request before Auth.js sees it.
 *
 * 1. Route Handlers receive URLs WITHOUT the base path ("/api/auth/…"), but Auth.js needs the
 *    public URL to recognise its own routes and to build the redirect URI it sends to Google.
 *    We rebuild it from the forwarded host and the configured base path.
 *
 * 2. When the OAuth callback arrives while another session is still open in the same browser,
 *    Auth.js would attach the new Google identity to that session's user. On a shared computer
 *    that would silently merge two people's accounts. The callback therefore always starts from
 *    a clean slate: the old session cookie is dropped (and that session is ended).
 */

const SESSION_COOKIE_NAMES = ["__Secure-sd.session", "sd.session"];

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function publicOrigin(req: NextRequest): string {
  const protocol = firstHeaderValue(req.headers.get("x-forwarded-proto")) ?? req.nextUrl.protocol.replace(/:$/, "");
  const host =
    firstHeaderValue(req.headers.get("x-forwarded-host")) ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${protocol}://${host}`;
}

function splitSessionCookie(header: string | null): { rest: string; sessionToken: string | null } {
  if (!header) return { rest: "", sessionToken: null };
  let sessionToken: string | null = null;
  const kept = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const separator = part.indexOf("=");
      const name = separator === -1 ? part : part.slice(0, separator);
      if (SESSION_COOKIE_NAMES.includes(name)) {
        sessionToken = decodeURIComponent(part.slice(separator + 1));
        return false;
      }
      return part !== "";
    });
  return { rest: kept.join("; "), sessionToken };
}

async function prepare(req: NextRequest): Promise<NextRequest> {
  const url = new URL(`${BASE_PATH}${req.nextUrl.pathname}${req.nextUrl.search}`, publicOrigin(req));

  if (req.method === "GET" && req.nextUrl.pathname.includes("/callback/")) {
    const { rest, sessionToken } = splitSessionCookie(req.headers.get("cookie"));
    if (sessionToken) {
      await prisma.session.deleteMany({ where: { sessionToken: sha256Hex(sessionToken) } }).catch(() => undefined);
      const headers = new Headers(req.headers);
      if (rest) headers.set("cookie", rest);
      else headers.delete("cookie");
      return new NextRequest(url, { method: "GET", headers });
    }
  }

  return new NextRequest(url, req);
}

export async function GET(req: NextRequest) {
  return handlers.GET(await prepare(req));
}

export async function POST(req: NextRequest) {
  return handlers.POST(await prepare(req));
}
