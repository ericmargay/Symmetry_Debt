/**
 * Run before the end-to-end tests (see "test:e2e" in package.json):
 * creates and migrates their database and builds the app exactly as it is deployed.
 */
import { execFileSync } from "node:child_process";
import pg from "pg";
import { e2eDatabaseUrl } from "./env";

async function main() {
  const url = new URL(e2eDatabaseUrl());
  const database = url.pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) throw new Error(`Refusing to use "${database}": the database name must end in _test.`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    // A clean database every run: tests never depend on what an earlier run left behind.
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }

  const env = { ...process.env, DATABASE_URL: url.toString(), PRISMA_HIDE_UPDATE_MESSAGE: "1" };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: ["ignore", "ignore", "inherit"] });
  if (process.env.E2E_SKIP_BUILD !== "1") {
    execFileSync("npm", ["run", "build"], { env: { ...process.env, NEXT_PUBLIC_BASE_PATH: "/debt" }, stdio: "inherit" });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
