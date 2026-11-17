// Configuration for the Prisma CLI (migrate, generate, studio).
//
// Kept as a plain object on purpose: no runtime imports, so the same file works in the
// production image where only the Prisma CLI is installed.

// The CLI does not read .env files by itself. Next.js does, so we mirror that here for local use.
// In containers the variables come from the environment and there is simply no file to load.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File not present — fine.
  }
}

const config = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Not required for `prisma generate`, so this must not throw when it is missing.
    url: process.env.DATABASE_URL,
  },
};

export default config;
