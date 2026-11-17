/**
 * Balances.
 *
 * The balance of a debt is never stored: it is recomputed from its movements every time.
 * Which movements count depends on the mode of the debt, and that distinction is the heart of
 * the product:
 *
 *   PERSONAL  → what the owner wrote down (PERSONAL_RECORD). A "recorded" balance.
 *   SHARED    → only what both sides confirmed (CONFIRMED). A "confirmed" balance.
 *
 * Movements that are waiting for the other side are reported separately and never mixed in.
 */

export const MOVEMENT_KINDS = ["PAYMENT", "ADJUSTMENT_INCREASE", "ADJUSTMENT_DECREASE", "REVERSAL"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_STATUSES = [
  "PERSONAL_RECORD",
  "PENDING",
  "CLARIFICATION",
  "CONFIRMED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

export type DebtMode = "PERSONAL" | "SHARED";

/** How much weight a figure carries. */
export type ConfirmationLevel = "RECORDED" | "CONFIRMED";

export interface MovementLike {
  kind: MovementKind;
  status: MovementStatus;
  amountMinor: bigint;
}

export interface Balance {
  level: ConfirmationLevel;
  principalMinor: bigint;
  increasesMinor: bigint;
  decreasesMinor: bigint;
  /** principal + increases − decreases */
  totalOwedMinor: bigint;
  /** payments − reversals */
  paidMinor: bigint;
  /** totalOwed − paid */
  outstandingMinor: bigint;

  /** Shared only: movements waiting for the other side. They do NOT affect the figures above. */
  pendingPaymentsMinor: bigint;
  pendingIncreasesMinor: bigint;
  pendingDecreasesMinor: bigint;
  pendingReversalsMinor: bigint;
  pendingCount: number;
  /** What the balance would be if everything pending were confirmed. Informational. */
  projectedOutstandingMinor: bigint;
}

export function confirmationLevel(mode: DebtMode): ConfirmationLevel {
  return mode === "PERSONAL" ? "RECORDED" : "CONFIRMED";
}

/** Does this movement change the balance of a debt in this mode? */
export function countsTowardBalance(mode: DebtMode, status: MovementStatus): boolean {
  return mode === "PERSONAL" ? status === "PERSONAL_RECORD" : status === "CONFIRMED";
}

/** Is this movement waiting for the other side to answer? */
export function isAwaitingConfirmation(status: MovementStatus): boolean {
  return status === "PENDING" || status === "CLARIFICATION";
}

/** Is this movement still alive (counted or possibly counted later)? */
export function isOpenMovement(status: MovementStatus): boolean {
  return status === "PERSONAL_RECORD" || status === "CONFIRMED" || isAwaitingConfirmation(status);
}

export function computeBalance(
  mode: DebtMode,
  principalMinor: bigint,
  movements: Iterable<MovementLike>,
): Balance {
  let increases = 0n;
  let decreases = 0n;
  let payments = 0n;
  let reversals = 0n;
  let pendingPayments = 0n;
  let pendingIncreases = 0n;
  let pendingDecreases = 0n;
  let pendingReversals = 0n;
  let pendingCount = 0;

  for (const movement of movements) {
    if (countsTowardBalance(mode, movement.status)) {
      if (movement.kind === "PAYMENT") payments += movement.amountMinor;
      else if (movement.kind === "REVERSAL") reversals += movement.amountMinor;
      else if (movement.kind === "ADJUSTMENT_INCREASE") increases += movement.amountMinor;
      else decreases += movement.amountMinor;
    } else if (mode === "SHARED" && isAwaitingConfirmation(movement.status)) {
      pendingCount += 1;
      if (movement.kind === "PAYMENT") pendingPayments += movement.amountMinor;
      else if (movement.kind === "REVERSAL") pendingReversals += movement.amountMinor;
      else if (movement.kind === "ADJUSTMENT_INCREASE") pendingIncreases += movement.amountMinor;
      else pendingDecreases += movement.amountMinor;
    }
  }

  const totalOwed = principalMinor + increases - decreases;
  const paid = payments - reversals;
  const outstanding = totalOwed - paid;

  return {
    level: confirmationLevel(mode),
    principalMinor,
    increasesMinor: increases,
    decreasesMinor: decreases,
    totalOwedMinor: totalOwed,
    paidMinor: paid,
    outstandingMinor: outstanding,
    pendingPaymentsMinor: pendingPayments,
    pendingIncreasesMinor: pendingIncreases,
    pendingDecreasesMinor: pendingDecreases,
    pendingReversalsMinor: pendingReversals,
    pendingCount,
    projectedOutstandingMinor:
      outstanding - pendingPayments + pendingReversals + pendingIncreases - pendingDecreases,
  };
}

export type MovementRuleError =
  | "exceeds_balance"
  | "nothing_to_pay"
  | "reversal_target_invalid"
  | "reversal_amount_mismatch"
  | "reversal_already_exists";

export interface NewMovement {
  kind: MovementKind;
  amountMinor: bigint;
}

export interface ReversalTarget {
  kind: MovementKind;
  status: MovementStatus;
  amountMinor: bigint;
  /** A reversal of this payment already exists and is alive. */
  hasOpenReversal: boolean;
}

/**
 * Can this movement be recorded right now?
 *
 * A payment or a reduction may not take the debt below zero. Movements that are already waiting
 * for confirmation are taken into account so that two pending payments cannot add up to more
 * than what is owed.
 */
export function checkNewMovement(
  mode: DebtMode,
  balance: Balance,
  movement: NewMovement,
  reversalTarget?: ReversalTarget | null,
): MovementRuleError | null {
  if (movement.kind === "PAYMENT" || movement.kind === "ADJUSTMENT_DECREASE") {
    const room =
      balance.outstandingMinor - balance.pendingPaymentsMinor - balance.pendingDecreasesMinor;
    if (room <= 0n) return "nothing_to_pay";
    if (movement.amountMinor > room) return "exceeds_balance";
    return null;
  }

  if (movement.kind === "REVERSAL") {
    if (!reversalTarget) return "reversal_target_invalid";
    if (reversalTarget.kind !== "PAYMENT" || !countsTowardBalance(mode, reversalTarget.status)) {
      return "reversal_target_invalid";
    }
    if (reversalTarget.hasOpenReversal) return "reversal_already_exists";
    if (reversalTarget.amountMinor !== movement.amountMinor) return "reversal_amount_mismatch";
    return null;
  }

  return null;
}

/**
 * Can a pending movement still be confirmed? Checked again at approval time because other
 * movements may have been confirmed since it was recorded.
 */
export function checkConfirmation(balance: Balance, movement: NewMovement): MovementRuleError | null {
  if (movement.kind === "PAYMENT" || movement.kind === "ADJUSTMENT_DECREASE") {
    if (movement.amountMinor > balance.outstandingMinor) return "exceeds_balance";
  }
  return null;
}
