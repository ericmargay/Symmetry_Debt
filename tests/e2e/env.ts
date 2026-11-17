import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Everything the end-to-end tests need to run the real production build against a database of
 * their own, with the mock issuer standing in for Google. Nothing here touches development data.
 */
export const APP_PORT = 3100;
export const DONATIONS_PORT = 3101;
export const OIDC_PORT = 4466;

export const APP = `http://localhost:${APP_PORT}/debt`;
export const APP_WITH_DONATIONS = `http://localhost:${DONATIONS_PORT}/debt`;
export const ISSUER = `http://localhost:${OIDC_PORT}`;

export function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  // Read only DATABASE_URL: loading the whole file would leak development settings into the servers under test.
  let base = process.env.DATABASE_URL;
  for (const file of [".env.local", ".env"]) {
    if (base) break;
    try {
      base = parseEnv(readFileSync(file, "utf8")).DATABASE_URL;
    } catch {
      // not there
    }
  }
  if (!base) throw new Error("End-to-end tests need E2E_DATABASE_URL, or DATABASE_URL to derive a database from.");
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "").replace(/(_e2e)?(_test)?$/, "");
  url.pathname = `/${name}_e2e_test`;
  return url.toString();
}

const uploads = process.env.E2E_UPLOAD_DIR ?? mkdtempSync(path.join(tmpdir(), "symmetry-debt-e2e-"));

export function serverEnv(port: number, extra: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "production",
    SKIP_ENV_FILES: "1",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: e2eDatabaseUrl(),
    APP_URL: `http://localhost:${port}/debt`,
    AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
    AUTH_GOOGLE_ID: "symmetry-debt-e2e",
    AUTH_GOOGLE_SECRET: "symmetry-debt-e2e-secret",
    AUTH_GOOGLE_ISSUER: ISSUER,
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"),
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: uploads,
    EMAIL_PROVIDER: "none",
    REMINDERS_ENABLED: "false",
    MAX_UPLOAD_MB: "10",
    E2E_UPLOAD_DIR: uploads,
    ...extra,
  };
}
