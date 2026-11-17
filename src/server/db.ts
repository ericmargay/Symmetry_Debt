import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

/**
 * One Prisma client per server process.
 *
 * Creating the client does not open a connection, so importing this file is safe while the app
 * is being built (when there is no DATABASE_URL at all).
 */
const globalForPrisma = globalThis as unknown as { __symmetryDebtPrisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.__symmetryDebtPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  // Survive hot reloads in development without opening a new pool each time.
  globalForPrisma.__symmetryDebtPrisma = prisma;
}

/** The client inside `prisma.$transaction(async (tx) => …)`. */
export type Tx = Prisma.TransactionClient;

/** Anything that can run queries: the client itself or a transaction. */
export type Db = PrismaClient | Tx;
