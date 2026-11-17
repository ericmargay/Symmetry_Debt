import { execFileSync } from "node:child_process";
import pg from "pg";
import { testDatabaseUrl } from "./database";

/**
 * Runs once before the integration tests: makes sure the test database exists and is migrated
 * with the real migrations (so constraints and triggers are exactly the production ones).
 */
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const database = url.pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to run integration tests against "${database}": the database name must end in _test.`);
  }

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
}
