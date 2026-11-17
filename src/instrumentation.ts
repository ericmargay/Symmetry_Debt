/**
 * Runs once when the server process starts.
 *
 *   - checks the configuration and says clearly what is missing, instead of failing on the
 *     first request that happens to need it;
 *   - starts the due-date reminder job on a timer (REMINDERS_ENABLED=true, the default).
 *     The job is idempotent, so several instances — or an external scheduler calling
 *     /api/cron/reminders as well — never produce duplicates.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { env, EnvError } = await import("@/server/env");
  let config;
  try {
    config = env();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(`\n[symmetry-debt] ${error.message}\n`);
      return;
    }
    throw error;
  }

  if (config.AUTH_GOOGLE_ISSUER && config.NODE_ENV === "production") {
    console.warn(
      "[symmetry-debt] AUTH_GOOGLE_ISSUER is set: sign-in is NOT going through Google. This is meant for local development and tests only.",
    );
  }
  if (!config.AUTH_GOOGLE_ID || !config.AUTH_GOOGLE_SECRET) {
    console.warn(
      "[symmetry-debt] AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are not set: the site runs, but nobody can sign in until they are (scripts/google-oauth.sh).",
    );
  }
  if (!config.DATA_ENCRYPTION_KEY) {
    console.warn("[symmetry-debt] DATA_ENCRYPTION_KEY is not set: bank accounts cannot be saved until it is.");
  }

  if (!config.REMINDERS_ENABLED || config.NODE_ENV === "test") return;

  const globalState = globalThis as unknown as { __symmetryDebtReminders?: NodeJS.Timeout };
  if (globalState.__symmetryDebtReminders) return;

  const HOUR = 60 * 60 * 1000;
  const run = async () => {
    try {
      const { runReminders } = await import("@/server/services/reminders");
      const result = await runReminders();
      if (result.created > 0) console.log(`[reminders] ${result.created} created`);
    } catch (error) {
      console.error("[reminders] run failed:", error instanceof Error ? error.message : error);
    }
  };

  // A first pass shortly after boot, then every hour.
  setTimeout(run, 30_000).unref();
  globalState.__symmetryDebtReminders = setInterval(run, HOUR);
  globalState.__symmetryDebtReminders.unref();
}
