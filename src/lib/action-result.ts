import type { AppErrorCode } from "@/server/errors";

/**
 * What every server action returns. Failures the user can act on come back as data (a code to
 * translate, plus per-field problems) instead of exceptions, so forms can show them in place.
 */
export type ActionFailure = {
  ok: false;
  code: AppErrorCode | "generic";
  /** Field name → key under "validation" in the message catalogue. */
  fields?: Record<string, string>;
  params?: Record<string, string | number>;
};

export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure;
