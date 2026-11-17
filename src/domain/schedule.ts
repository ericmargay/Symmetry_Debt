/**
 * Payment schedules: generating instalments and working out how far along each one is.
 *
 * Payments are not tied to a particular instalment. Whatever has been paid is poured over the
 * schedule in order (earliest due date first), which makes early and partial payments,
 * edits and reversals behave consistently: the progress is always a pure function of
 * "how much is owed", "how much has been paid" and "what is the schedule".
 */
import { addDays, addMonths, compareISO, isISODate, type ISODate } from "./dates";
import { minBigInt, splitEvenly, sumMinor } from "./money";

export const SCHEDULE_TYPES = ["NONE", "SINGLE", "WEEKLY", "MONTHLY", "CUSTOM"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const MAX_INSTALLMENTS = 120;

export interface InstallmentInput {
  sequence: number;
  dueDate: ISODate;
  amountMinor: bigint;
}

export interface GenerateScheduleParams {
  type: Exclude<ScheduleType, "NONE" | "CUSTOM">;
  totalMinor: bigint;
  firstDueDate: ISODate;
  /** Number of instalments. Ignored for SINGLE. */
  count?: number;
}

/** Builds an evenly split schedule. The last instalment absorbs the rounding difference. */
export function generateSchedule(params: GenerateScheduleParams): InstallmentInput[] {
  const { type, totalMinor, firstDueDate } = params;
  if (!isISODate(firstDueDate)) throw new RangeError("firstDueDate must be an ISO date");
  if (totalMinor <= 0n) throw new RangeError("totalMinor must be positive");

  const count = type === "SINGLE" ? 1 : (params.count ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
    throw new RangeError(`count must be between 1 and ${MAX_INSTALLMENTS}`);
  }

  const amounts = splitEvenly(totalMinor, count);
  return amounts.map((amountMinor, index) => ({
    sequence: index + 1,
    dueDate:
      type === "WEEKLY"
        ? addDays(firstDueDate, 7 * index)
        : type === "MONTHLY"
          ? addMonths(firstDueDate, index)
          : firstDueDate,
    amountMinor,
  }));
}

export type ScheduleError =
  | "empty"
  | "too_many"
  | "invalid_date"
  | "amount_not_positive"
  | "dates_not_ascending"
  | "sum_mismatch"
  | "single_needs_one"
  | "none_must_be_empty";

/**
 * Checks a schedule against the amount it has to cover.
 * Instalments must be in due-date order and add up to exactly `expectedTotalMinor`.
 */
export function validateSchedule(
  type: ScheduleType,
  installments: readonly InstallmentInput[],
  expectedTotalMinor: bigint,
): ScheduleError[] {
  const errors = new Set<ScheduleError>();

  if (type === "NONE") {
    if (installments.length > 0) errors.add("none_must_be_empty");
    return [...errors];
  }

  if (installments.length === 0) errors.add("empty");
  if (installments.length > MAX_INSTALLMENTS) errors.add("too_many");
  if (type === "SINGLE" && installments.length !== 1) errors.add("single_needs_one");

  let previous: ISODate | null = null;
  for (const installment of installments) {
    if (!isISODate(installment.dueDate)) {
      errors.add("invalid_date");
      continue;
    }
    if (installment.amountMinor <= 0n) errors.add("amount_not_positive");
    if (previous !== null && compareISO(installment.dueDate, previous) < 0) errors.add("dates_not_ascending");
    previous = installment.dueDate;
  }

  if (installments.length > 0 && sumMinor(installments.map((i) => i.amountMinor)) !== expectedTotalMinor) {
    errors.add("sum_mismatch");
  }

  return [...errors];
}

/** Renumbers instalments 1..n in due-date order (stable for equal dates). */
export function normalizeSchedule(installments: readonly InstallmentInput[]): InstallmentInput[] {
  return installments
    .map((installment, index) => ({ installment, index }))
    .sort(
      (a, b) =>
        compareISO(a.installment.dueDate, b.installment.dueDate) ||
        a.installment.sequence - b.installment.sequence ||
        a.index - b.index,
    )
    .map(({ installment }, index) => ({ ...installment, sequence: index + 1 }));
}

export type InstallmentState = "PAID" | "PARTIAL" | "OVERDUE" | "DUE_TODAY" | "UPCOMING" | "WAIVED";

export interface InstallmentProgress {
  sequence: number;
  dueDate: ISODate;
  /** Amount written in the schedule. */
  originalMinor: bigint;
  /** Amount that actually has to be paid for this instalment (lower if the debt was reduced). */
  scheduledMinor: bigint;
  paidMinor: bigint;
  remainingMinor: bigint;
  state: InstallmentState;
}

export interface ScheduleProgress {
  rows: InstallmentProgress[];
  /** Owed on top of the schedule (e.g. after an increase), with no due date yet. */
  unscheduledMinor: bigint;
  unscheduledPaidMinor: bigint;
  /** Paid beyond everything that is owed. Should stay at zero. */
  overpaidMinor: bigint;
  /** Sum of what is still missing from instalments whose due date has passed. */
  overdueMinor: bigint;
  overdueCount: number;
  /** Earliest instalment that still has something pending. */
  next: InstallmentProgress | null;
}

export interface AllocationInput {
  /** Principal plus increases minus decreases. */
  totalOwedMinor: bigint;
  /** Payments minus reversals. */
  paidMinor: bigint;
  today: ISODate;
}

/**
 * Pours what has been paid over the schedule.
 *
 * If the debt was reduced after the schedule was written, the reduction comes off the LAST
 * instalments (a discount shortens the tail of the plan). If it was increased, the extra
 * amount shows up as "unscheduled" until the schedule is rewritten.
 */
export function allocatePayments(
  installments: readonly InstallmentInput[],
  input: AllocationInput,
): ScheduleProgress {
  const ordered = normalizeSchedule(installments);
  const scheduledTotal = sumMinor(ordered.map((i) => i.amountMinor));
  const totalOwed = input.totalOwedMinor < 0n ? 0n : input.totalOwedMinor;
  const gap = totalOwed - scheduledTotal;

  const effective = ordered.map((i) => i.amountMinor);
  if (gap < 0n) {
    let toTrim = -gap;
    for (let index = effective.length - 1; index >= 0 && toTrim > 0n; index -= 1) {
      const cut = minBigInt(toTrim, effective[index]);
      effective[index] -= cut;
      toTrim -= cut;
    }
  }

  let available = input.paidMinor < 0n ? 0n : input.paidMinor;
  let overdueMinor = 0n;
  let overdueCount = 0;
  let next: InstallmentProgress | null = null;

  const rows = ordered.map((installment, index): InstallmentProgress => {
    const scheduledMinor = effective[index];
    const paidMinor = minBigInt(available, scheduledMinor);
    available -= paidMinor;
    const remainingMinor = scheduledMinor - paidMinor;

    let state: InstallmentState;
    if (scheduledMinor === 0n) state = "WAIVED";
    else if (remainingMinor === 0n) state = "PAID";
    else if (compareISO(installment.dueDate, input.today) < 0) state = "OVERDUE";
    else if (installment.dueDate === input.today) state = "DUE_TODAY";
    else if (paidMinor > 0n) state = "PARTIAL";
    else state = "UPCOMING";

    const row: InstallmentProgress = {
      sequence: installment.sequence,
      dueDate: installment.dueDate,
      originalMinor: installment.amountMinor,
      scheduledMinor,
      paidMinor,
      remainingMinor,
      state,
    };

    if (state === "OVERDUE") {
      overdueMinor += remainingMinor;
      overdueCount += 1;
    }
    if (next === null && remainingMinor > 0n) next = row;
    return row;
  });

  const unscheduledMinor = gap > 0n ? gap : 0n;
  const unscheduledPaidMinor = minBigInt(available, unscheduledMinor);
  available -= unscheduledPaidMinor;

  return {
    rows,
    unscheduledMinor,
    unscheduledPaidMinor,
    overpaidMinor: available,
    overdueMinor,
    overdueCount,
    next,
  };
}

/** The date by which everything should be paid: the last instalment's due date. */
export function finalDueDate(installments: readonly InstallmentInput[]): ISODate | null {
  let latest: ISODate | null = null;
  for (const installment of installments) {
    if (latest === null || compareISO(installment.dueDate, latest) > 0) latest = installment.dueDate;
  }
  return latest;
}
