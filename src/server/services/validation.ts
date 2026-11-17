import "server-only";
import type { z } from "zod";
import { isValidationKey } from "@/schemas/common";
import { AppError } from "../errors";

/**
 * Parses untrusted input with a schema. Failures become an AppError("validation") carrying,
 * for each field, the key of the message to show next to it.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join(".") || "_";
    if (!(path in fields)) fields[path] = isValidationKey(issue.message) ? issue.message : "invalid";
  }
  throw new AppError("validation", { fields });
}
