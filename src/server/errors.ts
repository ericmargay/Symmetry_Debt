/**
 * Errors the user can do something about.
 *
 * `code` is a key under "errors" in messages/*.json, so the same failure is explained in the
 * reader's language wherever it surfaces. Anything that is NOT an AppError is a bug or an
 * outage: it is logged and shown as a generic message, never leaked to the browser.
 */
export const APP_ERROR_CODES = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation",
  "rate_limited",
  "conflict",
  "stale",
  "invalid_state",
  "exceeds_balance",
  "nothing_to_pay",
  "reversal_target_invalid",
  "reversal_already_exists",
  "reversal_amount_mismatch",
  "schedule_invalid",
  "terms_invalid",
  "terms_locked_fields",
  "terms_unchanged",
  "own_proposal",
  "own_movement",
  "not_your_turn",
  "invitation_invalid",
  "invitation_expired",
  "invitation_self",
  "invitation_used",
  "identity_unconfirmed",
  "contact_in_use",
  "contact_not_found",
  "bank_account_not_found",
  "bank_account_needs_number",
  "clabe_invalid",
  "encryption_unavailable",
  "file_too_large",
  "file_type_not_allowed",
  "file_empty",
  "attachment_locked",
  "already_converted",
  "conversion_pending",
  "currency_mismatch",
  "account_has_active_agreements",
  "confirmation_mismatch",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Field-level problems for forms: field name → message key under "validation". */
  readonly fields?: Record<string, string>;
  /** Values interpolated into the translated message. */
  readonly params?: Record<string, string | number>;

  constructor(
    code: AppErrorCode,
    options: { fields?: Record<string, string>; params?: Record<string, string | number>; cause?: unknown } = {},
  ) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.fields = options.fields;
    this.params = options.params;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

const HTTP_STATUS: Partial<Record<AppErrorCode, number>> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  conflict: 409,
  stale: 409,
  invalid_state: 409,
  file_too_large: 413,
  file_type_not_allowed: 415,
};

export function httpStatusFor(code: AppErrorCode): number {
  return HTTP_STATUS[code] ?? 400;
}
