/**
 * Where the app lives inside its domain ("/debt" on the official instance, "" at the root).
 *
 * next/link, next/navigation and redirects add the base path on their own. Use `withBasePath`
 * only for the things Next.js does not rewrite: plain <a>/<img> tags, fetch() calls and URLs
 * that are built by hand.
 */
export const BASE_PATH: string = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) return path;
  if (BASE_PATH === "") return path;
  if (path === "/") return BASE_PATH;
  return `${BASE_PATH}${path}`;
}

/** Removes the base path from a pathname (e.g. one read from window.location). */
export function stripBasePath(pathname: string): string {
  if (BASE_PATH !== "" && (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`))) {
    return pathname.slice(BASE_PATH.length) || "/";
  }
  return pathname;
}

/**
 * Only allows redirecting to a path inside this app. Anything else (absolute URLs,
 * protocol-relative URLs, backslash tricks) falls back to `fallback`.
 * The result is an app-internal path WITHOUT the base path.
 */
export function safeInternalPath(candidate: string | null | undefined, fallback = "/app"): string {
  if (!candidate) return fallback;
  let path = candidate;
  try {
    path = decodeURIComponent(candidate);
  } catch {
    return fallback;
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n\t]/.test(path)) {
    return fallback;
  }
  const internal = stripBasePath(path);
  if (!internal.startsWith("/") || internal.startsWith("//")) return fallback;
  return internal;
}
