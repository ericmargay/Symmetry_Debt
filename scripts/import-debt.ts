/**
 * Imports one personal record from a JSON file into the account of a given email address.
 *
 *   npm run import:debt -- --email you@example.com --file .data/imports/my-debt.json
 *
 * The file has the same fields as the "new debt" form in personal mode (see
 * docs and scripts/examples/personal-debt.example.json). It goes through the very same service
 * as the form, so the same validation, balances and history apply.
 *
 * If nobody has signed in with that address yet, the account is created unclaimed: the first
 * person who signs in with that VERIFIED address finds the record waiting for them
 * (see src/server/auth/adapter.ts). Running the script twice with the same file does nothing
 * the second time.
 *
 * Only personal records can be imported: a shared agreement needs the other person to accept it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // not there
  }
}

const { values } = parseArgs({
  options: { email: { type: "string" }, file: { type: "string" }, name: { type: "string" } },
});

if (!values.email || !values.file) {
  console.error("Usage: npm run import:debt -- --email <address> --file <path.json> [--name <display name>]");
  process.exit(2);
}

const email = values.email.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`Not an email address: ${values.email}`);
  process.exit(2);
}

const raw = readFileSync(values.file, "utf8");
const input = JSON.parse(raw) as Record<string, unknown>;

// A stable key derived from the file and the account: importing the same file again is a no-op.
const digest = createHash("sha256").update(`${email}\n${raw}`).digest("hex");
const idempotencyKey = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;

async function main() {
  const { prisma } = await import("../src/server/db");
  const { createPersonalDebt } = await import("../src/server/services/personal");
  const { getDebtView } = await import("../src/server/services/views");
  const { AppError } = await import("../src/server/errors");
  const { formatMoney } = await import("../src/domain/money");

  try {
    let user = await prisma.user.findUnique({ where: { email }, include: { preferences: true } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: values.name ?? null,
          preferences: {
            create: {
              timeZone: process.env.DEFAULT_TIME_ZONE || "America/Mexico_City",
              defaultCurrency: process.env.DEFAULT_CURRENCY || "MXN",
            },
          },
        },
        include: { preferences: true },
      });
      console.log(`Created an unclaimed account for ${email}. It is claimed by the first verified sign-in with that address.`);
    }

    const actor = {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      locale: "es" as const,
      timeZone: user.preferences?.timeZone ?? "America/Mexico_City",
      defaultCurrency: user.preferences?.defaultCurrency ?? "MXN",
    };

    const { debtId } = await createPersonalDebt(actor, { ...input, mode: "PERSONAL", idempotencyKey } as never);
    const view = await getDebtView(actor, debtId);
    const money = (minor: bigint) => formatMoney(minor, view.terms.currency, "es-MX");

    console.log(`\nImported "${view.terms.concept}" (personal record, ${view.role === "DEBTOR" ? "you owe" : "owed to you by"} ${view.counterparty.name})`);
    console.log(`  amount       ${money(view.balance.totalOwedMinor)}`);
    console.log(`  paid         ${money(view.balance.paidMinor)}`);
    console.log(`  outstanding  ${money(view.balance.outstandingMinor)}`);
    console.log(`  instalments  ${view.progress.rows.length}`);
    console.log(`  id           ${debtId}`);
  } catch (error) {
    if (error instanceof AppError) {
      console.error(`\nThe file was not accepted: ${error.code}`);
      if (error.fields) console.error(JSON.stringify(error.fields, null, 2));
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
