import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page: sets a strict Content-Security-Policy with a fresh nonce.
 *
 * Scripts may only run if they come from this origin and carry the nonce of this very
 * response, so injected markup cannot execute anything. Authentication and authorisation do
 * NOT happen here: every page, action and route checks the session itself, next to the data.
 */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const https = (process.env.APP_URL ?? "").startsWith("https://");
  // Sign-in posts a form that is redirected to the identity provider.
  const identityProviders = ["https://accounts.google.com", originOf(process.env.AUTH_GOOGLE_ISSUER)].filter(Boolean).join(" ");

  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    `form-action 'self' ${identityProviders}`,
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Lets a page that requires sign-in send the visitor back to where they were going.
  requestHeaders.set("x-sd-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    // The landing page. Under a base path the pattern below does not cover the bare root
    // ("/debt" has no trailing slash to match), so it is listed on its own.
    {
      source: "/",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      // Every other page. API routes set their own headers and static files need none.
      source: "/((?!api/|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest|robots.txt|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
