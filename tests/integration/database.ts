/**
 * Which database the integration tests use.
 *
 * TEST_DATABASE_URL wins when set (CI). Otherwise the tests use a sibling of the development
 * database with "_test" appended to its name, so they can never touch real data.
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  for (const file of [".env.local", ".env"]) {
    if (process.env.DATABASE_URL) break;
    try {
      process.loadEnvFile(file);
    } catch {
      // not there
    }
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("Integration tests need TEST_DATABASE_URL, or DATABASE_URL to derive a *_test database from.");
  }
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, "");
  if (!name) throw new Error("DATABASE_URL has no database name");
  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return url.toString();
}
