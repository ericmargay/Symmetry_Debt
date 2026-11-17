import { defineConfig, devices } from "@playwright/test";
import { APP, APP_PORT, APP_WITH_DONATIONS, DONATIONS_PORT, OIDC_PORT, serverEnv } from "./tests/e2e/env";

/**
 * End-to-end tests: the production build, a real PostgreSQL database of their own and a mock
 * OpenID Connect issuer in place of Google.
 *
 *   npm run test:e2e
 *
 * Two copies of the app run side by side so both configurations are exercised: one without any
 * donation link (the default) and one with links configured.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: "**/mobile.spec.ts" },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: "**/mobile.spec.ts" },
  ],
  webServer: [
    {
      command: "node scripts/mock-oidc.mjs",
      url: `http://localhost:${OIDC_PORT}/health`,
      env: { MOCK_OIDC_PORT: String(OIDC_PORT), AUTH_GOOGLE_ID: "symmetry-debt-e2e", AUTH_GOOGLE_SECRET: "symmetry-debt-e2e-secret" },
      reuseExistingServer: false,
    },
    {
      command: "node scripts/start-standalone.mjs",
      url: `${APP}/api/health`,
      env: serverEnv(APP_PORT),
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "node scripts/start-standalone.mjs",
      url: `${APP_WITH_DONATIONS}/api/health`,
      env: serverEnv(DONATIONS_PORT, {
        DONATE_KOFI_URL: "https://ko-fi.com/example",
        DONATE_GITHUB_SPONSORS_URL: "https://github.com/sponsors/example",
        DONATE_OTHER_LINKS: "Open Collective|https://opencollective.com/example",
      }),
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
