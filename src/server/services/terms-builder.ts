import "server-only";
import { todayInTimeZone, type ISODate } from "@/domain/dates";
import { finalDueDate, normalizeSchedule } from "@/domain/schedule";
import {
  canonicalTerms,
  normalizeTerms,
  TERMS_VERSION,
  validateTerms,
  type TermsError,
  type TermsSnapshot,
} from "@/domain/terms";
import { readAmount, type ValidationKey } from "@/schemas/common";
import type { TermsInput } from "@/schemas/debt";
import type { Actor } from "../actor";
import { sha256Hex } from "../crypto";
import { AppError } from "../errors";

const TERMS_ERROR_FIELDS: Record<TermsError, [field: string, key: ValidationKey]> = {
  malformed: ["_", "invalid"],
  historical_exceeds_principal: ["previousPayments", "previousPaymentsTooMuch"],
  historical_before_origin: ["previousPayments", "dateBeforeOrigin"],
  historical_in_future: ["previousPayments", "dateInFuture"],
  origin_in_future: ["originDate", "dateInFuture"],
  installment_before_origin: ["schedule", "dateBeforeOrigin"],
  due_date_mismatch: ["schedule", "invalid"],
  schedule_empty: ["schedule", "scheduleEmpty"],
  schedule_too_many: ["schedule", "scheduleCount"],
  schedule_invalid_date: ["schedule", "date"],
  schedule_amount_not_positive: ["schedule", "amountNotPositive"],
  schedule_dates_not_ascending: ["schedule", "scheduleOrder"],
  schedule_sum_mismatch: ["schedule", "scheduleSum"],
  schedule_single_needs_one: ["schedule", "scheduleEmpty"],
  schedule_none_must_be_empty: ["schedule", "invalid"],
};

export function termsHash(terms: TermsSnapshot): string {
  return sha256Hex(canonicalTerms(terms));
}

export function assertValidTerms(terms: TermsSnapshot, today: ISODate): void {
  const errors = validateTerms(terms, { today });
  if (errors.length === 0) return;
  const fields: Record<string, string> = {};
  for (const error of errors) {
    const [field, key] = TERMS_ERROR_FIELDS[error];
    if (!(field in fields)) fields[field] = key;
  }
  throw new AppError("terms_invalid", { fields });
}

export interface BuildTermsOptions {
  sharedNotes?: string | null;
  balanceAsOf?: ISODate | null;
}

/**
 * Turns what was typed in a form into a validated terms snapshot.
 * Every amount is parsed here, on the server, against the currency of the debt.
 */
export function buildTerms(input: TermsInput, actor: Pick<Actor, "timeZone">, options: BuildTermsOptions = {}): TermsSnapshot {
  const fields: Record<string, string> = {};

  const principal = readAmount(input.amount, input.currency);
  if ("error" in principal) fields.amount = principal.error;

  const installments = input.schedule.installments.map((installment, index) => {
    const amount = readAmount(installment.amount, input.currency);
    if ("error" in amount) {
      fields[`schedule.installments.${index}.amount`] = amount.error;
      return null;
    }
    return { sequence: index + 1, dueDate: installment.dueDate, amountMinor: amount.minor };
  });

  const previousPayments = input.previousPayments.map((payment, index) => {
    const amount = readAmount(payment.amount, input.currency);
    if ("error" in amount) {
      fields[`previousPayments.${index}.amount`] = amount.error;
      return null;
    }
    return {
      effectiveDate: payment.effectiveDate,
      amountMinor: amount.minor.toString(),
      method: payment.method,
      note: payment.note,
    };
  });

  if (Object.keys(fields).length > 0 || "error" in principal) throw new AppError("validation", { fields });

  const ordered = normalizeSchedule(installments.filter((installment) => installment !== null));
  const terms = normalizeTerms({
    v: TERMS_VERSION,
    concept: input.concept,
    currency: input.currency,
    principalMinor: principal.minor.toString(),
    originDate: input.originDate,
    dueDate: finalDueDate(ordered),
    balanceAsOf: options.balanceAsOf ?? null,
    scheduleType: input.schedule.type,
    installments: ordered.map((installment) => ({
      sequence: installment.sequence,
      dueDate: installment.dueDate,
      amountMinor: installment.amountMinor.toString(),
    })),
    plannedMethod: input.plannedMethod,
    sharedNotes: options.sharedNotes ?? null,
    historicalPayments: previousPayments.filter((payment) => payment !== null),
  });

  assertValidTerms(terms, todayInTimeZone(actor.timeZone));
  return terms;
}
