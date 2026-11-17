/**
 * Building blocks for input validation, shared by forms (browser) and server actions.
 *
 * Messages are KEYS under "validation" in messages/*.json, never literal text, so every
 * validation error can be shown in the reader's language.
 */
import { z } from "zod";
import { isCurrencyCode } from "@/domain/currencies";
import { isISODate } from "@/domain/dates";
import { parseAmount } from "@/domain/money";
import { PAYMENT_METHODS } from "@/domain/payment-methods";
import { PARTY_ROLES } from "@/domain/lifecycle";

export const VALIDATION_KEYS = [
  "required",
  "tooLong",
  "invalid",
  "date",
  "dateInFuture",
  "dateBeforeOrigin",
  "email",
  "currency",
  "amountEmpty",
  "amountInvalid",
  "amountDecimals",
  "amountNotPositive",
  "amountTooLarge",
  "amountExceedsBalance",
  "amountBelowPaid",
  "clabeLength",
  "clabeDigits",
  "clabeChecksum",
  "accountNumber",
  "needClabeOrAccount",
  "scheduleSum",
  "scheduleOrder",
  "scheduleEmpty",
  "scheduleCount",
  "previousPaymentsTooMuch",
  "selfInvite",
  "confirmText",
] as const;

export type ValidationKey = (typeof VALIDATION_KEYS)[number];

export function isValidationKey(value: unknown): value is ValidationKey {
  return typeof value === "string" && (VALIDATION_KEYS as readonly string[]).includes(value);
}

const msg = (key: ValidationKey) => key;

/** Trims and removes control characters (keeps line breaks when `multiline`). */
export function cleanText(value: string, multiline = false): string {
  const pattern = multiline ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g : /[\x00-\x1F\x7F]/g;
  const cleaned = value.replace(pattern, multiline ? "" : " ");
  return (multiline ? cleaned : cleaned.replace(/\s+/g, " ")).trim();
}

export const requiredText = (max: number) =>
  z
    .string({ error: msg("required") })
    .transform((value) => cleanText(value))
    .pipe(z.string().min(1, msg("required")).max(max, msg("tooLong")));

/** Optional single-line text: empty becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => {
      const cleaned = cleanText(value ?? "");
      return cleaned === "" ? null : cleaned;
    })
    .pipe(z.string().max(max, msg("tooLong")).nullable());

/** Optional multi-line text (notes, comments): empty becomes null. */
export const optionalNote = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => {
      const cleaned = cleanText(value ?? "", true);
      return cleaned === "" ? null : cleaned;
    })
    .pipe(z.string().max(max, msg("tooLong")).nullable());

export const requiredNote = (max: number) =>
  z
    .string({ error: msg("required") })
    .transform((value) => cleanText(value, true))
    .pipe(z.string().min(1, msg("required")).max(max, msg("tooLong")));

export const isoDateSchema = z.string({ error: msg("required") }).refine(isISODate, msg("date"));

export const optionalIsoDate = z
  .string()
  .nullish()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : null))
  .pipe(z.string().refine(isISODate, msg("date")).nullable());

export const currencySchema = z
  .string({ error: msg("required") })
  .refine((value) => Boolean(isCurrencyCode(value)), msg("currency"));

export const emailSchema = z
  .string({ error: msg("required") })
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.email(msg("email")).max(254, msg("tooLong")));

export const optionalEmail = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = (value ?? "").trim().toLowerCase();
    return trimmed === "" ? null : trimmed;
  })
  .pipe(z.email(msg("email")).max(254, msg("tooLong")).nullable());

/** Database id (cuid). */
export const idSchema = z.string().regex(/^[a-z0-9]{20,40}$/, msg("invalid"));

export const optionalId = z
  .string()
  .nullish()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : null))
  .pipe(idSchema.nullable());

/** Client-generated key that makes a submission safe to repeat. */
export const idempotencyKeySchema = z.uuid(msg("invalid"));

export const roleSchema = z.enum(PARTY_ROLES, msg("required"));

export const methodSchema = z.enum(PAYMENT_METHODS, msg("invalid"));

export const optionalMethod = z
  .string()
  .nullish()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : null))
  .pipe(methodSchema.nullable());

const AMOUNT_ERRORS: Record<string, ValidationKey> = {
  empty: "amountEmpty",
  invalid: "amountInvalid",
  too_many_decimals: "amountDecimals",
  not_positive: "amountNotPositive",
  too_large: "amountTooLarge",
};

/**
 * Converts what a person typed into minor units, for the given currency.
 * Returns the validation key when it cannot be read.
 */
export function readAmount(text: string, currency: string): { minor: bigint } | { error: ValidationKey } {
  const result = parseAmount(text ?? "", currency);
  return result.ok ? { minor: result.minor } : { error: AMOUNT_ERRORS[result.error] ?? "amountInvalid" };
}

/** Amount as typed. It is parsed against the currency later, with `readAmount`. */
export const amountText = z.string({ error: msg("amountEmpty") }).max(40, msg("amountInvalid"));
