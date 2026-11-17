import type { Prisma } from "@/generated/prisma/client";

/**
 * Makes a value safe to store in a JSON column: bigint amounts become strings of minor units,
 * dates become ISO strings and undefined values are dropped.
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry)),
  ) as Prisma.InputJsonValue;
}
