import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { testDatabaseUrl } from "./database";

// Environment for the code under test. This file runs before any test module is imported, so
// the database client is created against the test database.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.APP_URL = "https://debt.test/debt";
process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-test";
process.env.AUTH_GOOGLE_ID = "test-client";
process.env.AUTH_GOOGLE_SECRET = "test-client-secret";
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "symmetry-debt-test-"));
process.env.EMAIL_PROVIDER = "smtp";
process.env.SMTP_URL = "smtp://localhost:1"; // never used: tests intercept outgoing email
process.env.EMAIL_FROM = "Symmetry Debt <test@debt.test>";
process.env.MAX_UPLOAD_MB = "1";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.DEFAULT_TIME_ZONE = "America/Mexico_City";
process.env.INVITATION_TTL_DAYS = "14";
