#!/usr/bin/env node
/**
 * Runs the production build without Docker:
 *
 *   npm run build && npm run start:standalone
 *
 * `next build` (output: "standalone") leaves a self-contained server in .next/standalone, but
 * without the static assets. This copies them next to it, loads .env the way `next dev` would,
 * and starts the server. PORT and HOSTNAME are honoured (defaults: 3000, 0.0.0.0).
 */
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(1);
}

// `next build` copies the .env files it finds into the standalone folder, and the server would
// read them on its own. This script is what decides the environment, so those copies go: they
// would be stale after an edit, and would defeat SKIP_ENV_FILES.
for (const file of readdirSync(standalone)) {
  if (file === ".env" || file.startsWith(".env.")) rmSync(path.join(standalone, file), { force: true });
}

// SKIP_ENV_FILES=1 runs with exactly the environment it was given (used by the end-to-end tests).
if (process.env.SKIP_ENV_FILES !== "1") {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(root, file));
    } catch {
      // not there: the environment comes from the shell
    }
  }
}

cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

// Receipts stored on disk are addressed relative to the project, not to .next/standalone.
if (process.env.STORAGE_LOCAL_DIR && !path.isAbsolute(process.env.STORAGE_LOCAL_DIR)) {
  process.env.STORAGE_LOCAL_DIR = path.resolve(root, process.env.STORAGE_LOCAL_DIR);
}
process.env.HOSTNAME ??= "0.0.0.0";

await import(pathToFileURL(path.join(standalone, "server.js")).href);
