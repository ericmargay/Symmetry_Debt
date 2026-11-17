/**
 * Terms of a shared agreement.
 *
 * A version of an agreement is an immutable snapshot of these terms. Both sides must accept the
 * very same snapshot, which is checked by comparing the hash of its canonical JSON form.
 *
 * Amounts are strings of minor units so the JSON stays exact.
 */
import { z } from "zod";
import { isCurrencyCode } from "./currencies";
import { compareISO, isISODate, type ISODate } from "./dates";
import { MAX_AMOUNT_MINOR, minorFromString, sumMinor } from "./money";
import { PAYMENT_METHODS } from "./payment-methods";
import { finalDueDate, MAX_INSTALLMENTS, SCHEDULE_TYPES, validateSchedule, type ScheduleError } from "./schedule";

export const TERMS_VERSION = 1;
export const MAX_HISTORICAL_PAYMENTS = 200;
export const CONCEPT_MAX = 140;
export const NOTES_MAX = 2000;
export const SHORT_NOTE_MAX = 280;

const isoDate = z.string().refine(isISODate, "invalid_date");

const positiveMinor = z
  .string()
  .regex(/^[1-9][0-9]*$/, "invalid_amount")
  // Checks keep running after one fails, so this one must not assume the text is a number.
  .refine((value) => !/^[0-9]+$/.test(value) || BigInt(value) <= MAX_AMOUNT_MINOR, "too_large");

export const termsInstallmentSchema = z.strictObject({
  sequence: z.number().int().min(1).max(MAX_INSTALLMENTS),
  dueDate: isoDate,
  amountMinor: positiveMinor,
});

export const termsHistoricalPaymentSchema = z.strictObject({
  effectiveDate: isoDate,
  amountMinor: positiveMinor,
  method: z.enum(PAYMENT_METHODS).nullable(),
  note: z.string().max(SHORT_NOTE_MAX).nullable(),
});

export const termsSchema = z.strictObject({
  v: z.literal(TERMS_VERSION),
  concept: z.string().min(1).max(CONCEPT_MAX),
  // Boolean(): keeps the type a plain string, as it is in the database.
  currency: z.string().refine((value) => Boolean(isCurrencyCode(value)), "invalid_currency"),
  /** Amount of the debt — or, when `balanceAsOf` is set, the balance agreed on as of that date. */
  principalMinor: positiveMinor,
  originDate: isoDate,
  dueDate: isoDate.nullable(),
  balanceAsOf: isoDate.nullable(),
  scheduleType: z.enum(SCHEDULE_TYPES),
  installments: z.array(termsInstallmentSchema).max(MAX_INSTALLMENTS),
  plannedMethod: z.enum(PAYMENT_METHODS).nullable(),
  sharedNotes: z.string().max(NOTES_MAX).nullable(),
  /**
   * Payments made before the agreement existed that both sides recognise by accepting this
   * version. Only meaningful in the terms an agreement starts with.
   */
  historicalPayments: z.array(termsHistoricalPaymentSchema).max(MAX_HISTORICAL_PAYMENTS),
});

export type TermsSnapshot = z.infer<typeof termsSchema>;
export type TermsInstallment = z.infer<typeof termsInstallmentSchema>;
export type TermsHistoricalPayment = z.infer<typeof termsHistoricalPaymentSchema>;

export type TermsError =
  | "malformed"
  | "historical_exceeds_principal"
  | "historical_before_origin"
  | "historical_in_future"
  | "origin_in_future"
  | "installment_before_origin"
  | "due_date_mismatch"
  | `schedule_${ScheduleError}`;

export interface TermsValidationContext {
  /** Today for the person proposing the terms. */
  today: ISODate;
}

/** Reads untrusted JSON (e.g. from the database) as terms. Throws if it is not valid. */
export function parseTerms(value: unknown): TermsSnapshot {
  return termsSchema.parse(value);
}

export function historicalTotalMinor(terms: TermsSnapshot): bigint {
  return sumMinor(terms.historicalPayments.map((payment) => minorFromString(payment.amountMinor)));
}

/** What is still owed the moment the agreement starts. */
export function openingBalanceMinor(terms: TermsSnapshot): bigint {
  return minorFromString(terms.principalMinor) - historicalTotalMinor(terms);
}

/**
 * Business rules on top of the shape: the schedule covers the whole amount, recognised
 * payments leave something to agree on, and dates make sense.
 */
export function validateTerms(value: unknown, context: TermsValidationContext): TermsError[] {
  const parsed = termsSchema.safeParse(value);
  if (!parsed.success) return ["malformed"];
  const terms = parsed.data;
  const errors = new Set<TermsError>();
  const principal = minorFromString(terms.principalMinor);

  // A day of tolerance: "today" depends on the time zone of whoever is looking.
  if (compareISO(terms.originDate, addOneDay(context.today)) > 0) errors.add("origin_in_future");

  const installments = terms.installments.map((installment) => ({
    sequence: installment.sequence,
    dueDate: installment.dueDate,
    amountMinor: minorFromString(installment.amountMinor),
  }));
  for (const error of validateSchedule(terms.scheduleType, installments, principal)) {
    errors.add(`schedule_${error}`);
  }
  if (installments.some((installment) => compareISO(installment.dueDate, terms.originDate) < 0)) {
    errors.add("installment_before_origin");
  }
  if (terms.dueDate !== finalDueDate(installments)) errors.add("due_date_mismatch");

  if (terms.historicalPayments.length > 0) {
    if (historicalTotalMinor(terms) >= principal) errors.add("historical_exceeds_principal");
    for (const payment of terms.historicalPayments) {
      if (compareISO(payment.effectiveDate, terms.originDate) < 0) errors.add("historical_before_origin");
      if (compareISO(payment.effectiveDate, addOneDay(context.today)) > 0) errors.add("historical_in_future");
    }
  }

  return [...errors];
}

function addOneDay(iso: ISODate): ISODate {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Puts terms in their canonical order: instalments by sequence, recognised payments by date and
 * amount. Two snapshots that mean the same always serialise to the same text.
 */
export function normalizeTerms(terms: TermsSnapshot): TermsSnapshot {
  return {
    ...terms,
    concept: terms.concept.trim(),
    sharedNotes: terms.sharedNotes?.trim() ? terms.sharedNotes.trim() : null,
    installments: [...terms.installments]
      .sort((a, b) => a.sequence - b.sequence)
      .map((installment, index) => ({ ...installment, sequence: index + 1 })),
    historicalPayments: [...terms.historicalPayments]
      .map((payment) => ({ ...payment, note: payment.note?.trim() ? payment.note.trim() : null }))
      .sort(
        (a, b) =>
          compareISO(a.effectiveDate, b.effectiveDate) ||
          (BigInt(a.amountMinor) < BigInt(b.amountMinor) ? -1 : BigInt(a.amountMinor) > BigInt(b.amountMinor) ? 1 : 0) ||
          (a.method ?? "").localeCompare(b.method ?? "") ||
          (a.note ?? "").localeCompare(b.note ?? ""),
      ),
  };
}

/** Deterministic JSON: object keys sorted, no whitespace. This is the text that gets hashed. */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJSON(entry)}`).join(",")}}`;
}

export function canonicalTerms(terms: TermsSnapshot): string {
  return canonicalJSON(normalizeTerms(terms));
}

export const TERMS_FIELDS = [
  "concept",
  "principal",
  "originDate",
  "schedule",
  "plannedMethod",
  "sharedNotes",
  "historicalPayments",
] as const;
export type TermsField = (typeof TERMS_FIELDS)[number];

/** Which parts differ between two versions — used to show "what changed" to the reader. */
export function diffTerms(previous: TermsSnapshot, next: TermsSnapshot): TermsField[] {
  const a = normalizeTerms(previous);
  const b = normalizeTerms(next);
  const changed: TermsField[] = [];
  if (a.concept !== b.concept) changed.push("concept");
  if (a.principalMinor !== b.principalMinor || a.currency !== b.currency || a.balanceAsOf !== b.balanceAsOf) {
    changed.push("principal");
  }
  if (a.originDate !== b.originDate) changed.push("originDate");
  if (
    a.scheduleType !== b.scheduleType ||
    a.dueDate !== b.dueDate ||
    canonicalJSON(a.installments) !== canonicalJSON(b.installments)
  ) {
    changed.push("schedule");
  }
  if (a.plannedMethod !== b.plannedMethod) changed.push("plannedMethod");
  if (a.sharedNotes !== b.sharedNotes) changed.push("sharedNotes");
  if (canonicalJSON(a.historicalPayments) !== canonicalJSON(b.historicalPayments)) {
    changed.push("historicalPayments");
  }
  return changed;
}

/**
 * Parts of the terms that may not change once an agreement is active. Amounts change through
 * adjustments that both sides approve, never by rewriting the agreement.
 */
export function amendmentViolations(current: TermsSnapshot, proposed: TermsSnapshot): TermsField[] {
  const locked: TermsField[] = ["principal", "originDate", "historicalPayments"];
  return diffTerms(current, proposed).filter((field) => locked.includes(field));
}
