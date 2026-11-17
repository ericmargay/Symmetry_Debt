import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Base path — where the app lives inside the domain.
 *
 * The official instance is served at https://aminoacid.com.mx/debt, so the default is "/debt".
 * Independent installs can pick another one at BUILD time:
 *   NEXT_PUBLIC_BASE_PATH=/money   → https://example.org/money
 *   NEXT_PUBLIC_BASE_PATH=/        → https://example.org        (root of the domain)
 *
 * Next.js inlines this value in the client bundles, so changing it requires a rebuild.
 */
function normalizeBasePath(raw: string | undefined): string {
  if (raw === undefined) return "/debt";
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (!/^(\/[A-Za-z0-9._~-]+)+$/.test(withSlash)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_BASE_PATH "${raw}". Use something like "/debt", or "/" for the domain root.`,
    );
  }
  return withSlash;
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

/** Largest receipt a user may upload, in MB. Read at build time for the framework limits. */
const maxUploadMb = Math.max(1, Number.parseInt(process.env.MAX_UPLOAD_MB ?? "10", 10) || 10);

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // The development badge sits on top of the app's own navigation.
  devIndicators: false,

  // Normalised value, available to server and client code as process.env.NEXT_PUBLIC_BASE_PATH.
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  experimental: {
    // Uploads go through a Route Handler; this only bounds what proxy.ts may buffer.
    proxyClientMaxBodySize: `${maxUploadMb + 2}mb`,
  },

  async redirects() {
    // When the app lives under a sub-path, send the bare domain root there
    // (only reachable on standalone installs; behind the official proxy "/" never gets here).
    return basePath
      ? [{ source: "/", destination: basePath, basePath: false, permanent: false }]
      : [];
  },

  async headers() {
    // Static security headers. The Content-Security-Policy carries a per-request nonce,
    // so it is set in src/proxy.ts instead.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
