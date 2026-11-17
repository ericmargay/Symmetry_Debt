import "server-only";
import { z } from "zod";

/**
 * Every setting the server reads from the environment, validated once.
 *
 * Nothing here is read while the app is being BUILT: the build has no database and no secrets.
 * Values are parsed lazily, the first time a request needs them.
 */

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === "") return fallback;
      return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    });

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : undefined));

const optionalUrl = optionalString.refine(
  (value) => value === undefined || /^https?:\/\/\S+$/i.test(value),
  "must be an http(s) URL",
);

const positiveInt = (fallback: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = Number.parseInt(value ?? "", 10);
      if (!Number.isFinite(parsed) || parsed < 1) return fallback;
      return Math.min(parsed, max);
    });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "is required"),

  /** Public URL of the app including its base path, e.g. https://aminoacid.com.mx/debt */
  APP_URL: optionalUrl,

  AUTH_SECRET: z.string().min(32, "must be at least 32 characters (openssl rand -base64 32)"),
  /**
   * Google OAuth client. Without it the app still runs (landing page, health check) but nobody
   * can sign in: the login page says so instead of sending people to a broken Google screen.
   */
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  /** Development and tests only: points Google sign-in at the local mock issuer. */
  AUTH_GOOGLE_ISSUER: optionalUrl,

  /** 32 random bytes in base64. Encrypts CLABEs and account numbers at rest. */
  DATA_ENCRYPTION_KEY: optionalString,
  /** Previous key, kept only so old values can still be read while rotating. */
  DATA_ENCRYPTION_KEY_PREVIOUS: optionalString,

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.data/uploads"),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: bool(true),
  MAX_UPLOAD_MB: positiveInt(10, 100),

  EMAIL_PROVIDER: z.enum(["none", "smtp", "resend"]).default("none"),
  EMAIL_FROM: z.string().default("Symmetry Debt <no-reply@localhost>"),
  SMTP_URL: optionalString,
  RESEND_API_KEY: optionalString,

  /** Runs the due-date reminder job inside the server process. */
  REMINDERS_ENABLED: bool(true),
  /** Lets an external scheduler call /api/cron/reminders. */
  CRON_SECRET: optionalString,

  DEFAULT_TIME_ZONE: z.string().default("America/Mexico_City"),
  DEFAULT_CURRENCY: z.string().default("MXN"),
  INVITATION_TTL_DAYS: positiveInt(14, 90),

  /** Number of proxies in front of the app whose X-Forwarded-For entry can be trusted. */
  TRUSTED_PROXY_HOPS: positiveInt(1, 10),
  RATE_LIMIT_ENABLED: bool(true),

  PROJECT_REPO_URL: optionalUrl,
  DONATE_GITHUB_SPONSORS_URL: optionalUrl,
  DONATE_KOFI_URL: optionalUrl,
  DONATE_BUYMEACOFFEE_URL: optionalUrl,
  DONATE_PAYPAL_URL: optionalUrl,
  /** Extra links: "Label|https://…;Other label|https://…" */
  DONATE_OTHER_LINKS: optionalString,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "EnvError";
  }
}

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new EnvError(parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`));
  }

  const value = parsed.data;
  const problems: string[] = [];

  if (value.NODE_ENV === "production" && !value.APP_URL) {
    problems.push("APP_URL is required in production (the public URL of the app, including its base path)");
  }
  if (value.STORAGE_DRIVER === "s3") {
    for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!value[key]) problems.push(`${key} is required when STORAGE_DRIVER=s3`);
    }
  }
  if (value.EMAIL_PROVIDER === "smtp" && !value.SMTP_URL) {
    problems.push("SMTP_URL is required when EMAIL_PROVIDER=smtp");
  }
  if (value.EMAIL_PROVIDER === "resend" && !value.RESEND_API_KEY) {
    problems.push("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }
  if (problems.length > 0) throw new EnvError(problems);

  cached = value;
  return value;
}

/** Whether Google sign-in has a client configured (or the local mock issuer is in use). */
export function signInConfigured(): boolean {
  const value = env();
  return Boolean(value.AUTH_GOOGLE_ID && value.AUTH_GOOGLE_SECRET);
}

/** For tests that change process.env between cases. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** Public URL of the app (with base path, without trailing slash), or null when not configured. */
export function appUrl(): string | null {
  const url = env().APP_URL;
  return url ? url.replace(/\/+$/, "") : null;
}
