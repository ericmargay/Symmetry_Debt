import "server-only";
import {
  checkConfirmation,
  checkNewMovement,
  computeBalance,
  countsTowardBalance,
  isOpenMovement,
  type MovementKind,
} from "@/domain/balance";
import { compareISO, fromISODate, toISODate, todayInTimeZone, addDays } from "@/domain/dates";
import {
  allowedMovementActions,
  canRecordMovement,
  movementStatusAfter,
  otherRole,
  type MovementAction,
  type PartyRole,
} from "@/domain/lifecycle";
import { usesBankAccount } from "@/domain/payment-methods";
import { cleanText, readAmount } from "@/schemas/common";
import {
  movementInputSchema,
  updateMovementSchema,
  type MovementFormValues,
  type UpdateMovementFormValues,
} from "@/schemas/debt";
import type { PaymentDecision } from "@/generated/prisma/client";
import type { Actor } from "../actor";
import { actorDisplayName } from "../actor";
import { recordEvent } from "../audit";
import { prisma, type Tx } from "../db";
import { AppError } from "../errors";
import { notify } from "../notifications";
import { deleteOrphanedFiles } from "./attachments";
import { maskedLabel } from "./bank-accounts";
import { refreshDebtStatus } from "./balances";
import { isUniqueViolation, lockDebt, requireDebtAccess, transaction, type DebtAccess } from "./shared";
import { parseInput } from "./validation";

/**
 * Movements: payments, adjustments and reversals.
 *
 *   PERSONAL  → the movement is a personal record. It changes the recorded balance at once and
 *               its owner can edit or delete it at any time.
 *
 *   SHARED    → the movement starts as PENDING. It only changes the confirmed balance once the
 *               OTHER side approves it. Whoever recorded it can never confirm it themselves.
 *               A confirmed movement is immutable; mistakes are corrected with a reversal or an
 *               adjustment that both sides approve.
 */

interface BankDetailsInput {
  method: string | null;
  originBank: string | null;
  destinationAccountId: string | null;
  destinationText: string | null;
  trackingKey: string | null;
}

/**
 * Works out which account the money went to. It must be an account of whoever receives the
 * money that the actor is allowed to see: their own, or one that was shared with them for this
 * very agreement. Only a masked label is stored with the movement.
 */
async function resolveBankDetails(
  tx: Tx,
  actor: Pick<Actor, "id">,
  debtId: string,
  access: DebtAccess,
  input: BankDetailsInput,
) {
  const relevant = usesBankAccount(input.method as never);
  if (!relevant) return null;

  let destinationAccountId: string | null = null;
  let destinationLabel: string | null = input.destinationText;

  if (input.destinationAccountId) {
    const account = await tx.bankAccount.findUnique({ where: { id: input.destinationAccountId } });
    let allowed = false;
    if (account) {
      if (account.userId === actor.id) {
        allowed = true;
      } else if (access.mode === "SHARED" && access.me?.identityConfirmedAt) {
        const share = await tx.bankAccountShare.findFirst({
          where: { debtId, bankAccountId: account.id, revokedAt: null },
          select: { id: true },
        });
        allowed = share !== null;
      }
    }
    if (!account || !allowed) throw new AppError("bank_account_not_found");
    destinationAccountId = account.id;
    destinationLabel = maskedLabel(account);
  }

  if (!input.originBank && !destinationAccountId && !destinationLabel && !input.trackingKey) return null;
  return {
    originBank: input.originBank,
    destinationAccountId,
    destinationLabel,
    trackingKey: input.trackingKey,
  };
}

function assertEffectiveDate(effectiveDate: string, originDate: Date, actor: Pick<Actor, "timeZone">) {
  // One day of tolerance: "today" depends on where each person is.
  const latest = addDays(todayInTimeZone(actor.timeZone), 1);
  if (compareISO(effectiveDate, latest) > 0) {
    throw new AppError("validation", { fields: { effectiveDate: "dateInFuture" } });
  }
  if (compareISO(effectiveDate, toISODate(originDate)) < 0) {
    throw new AppError("validation", { fields: { effectiveDate: "dateBeforeOrigin" } });
  }
}

export async function recordMovement(
  actor: Actor,
  debtId: string,
  input: MovementFormValues,
): Promise<{ paymentId: string }> {
  const data = parseInput(movementInputSchema, input);

  const findExisting = () =>
    prisma.payment.findUnique({
      where: { debtId_idempotencyKey: { debtId, idempotencyKey: data.idempotencyKey } },
      select: { id: true },
    });

  try {
    return await transaction(async (tx) => {
      await lockDebt(tx, debtId);
      const access = await requireDebtAccess(tx, actor, debtId);

      const existing = await tx.payment.findUnique({
        where: { debtId_idempotencyKey: { debtId, idempotencyKey: data.idempotencyKey } },
        select: { id: true },
      });
      if (existing) return { paymentId: existing.id };

      const debt = await tx.debt.findUniqueOrThrow({
        where: { id: debtId },
        include: { payments: { select: { id: true, kind: true, status: true, amountMinor: true, reversesId: true } } },
      });

      if (!canRecordMovement(debt.mode, debt.status, data.kind)) throw new AppError("invalid_state");
      if (debt.mode === "SHARED" && !access.me?.identityConfirmedAt) throw new AppError("identity_unconfirmed");

      assertEffectiveDate(data.effectiveDate, debt.originDate, actor);

      // Adjustments and reversals change what was agreed, so they must say why.
      if (data.kind !== "PAYMENT" && !data.notes) {
        throw new AppError("validation", { fields: { notes: "required" } });
      }

      let amountMinor: bigint;
      let reversalTarget: (typeof debt.payments)[number] | null = null;
      if (data.kind === "REVERSAL") {
        reversalTarget = debt.payments.find((payment) => payment.id === data.reversesId) ?? null;
        if (!reversalTarget) throw new AppError("reversal_target_invalid");
        amountMinor = reversalTarget.amountMinor;
      } else {
        const amount = readAmount(data.amount ?? "", debt.currency);
        if ("error" in amount) throw new AppError("validation", { fields: { amount: amount.error } });
        amountMinor = amount.minor;
      }

      const balance = computeBalance(debt.mode, debt.principalMinor, debt.payments);
      const ruleError = checkNewMovement(
        debt.mode,
        balance,
        { kind: data.kind, amountMinor },
        reversalTarget && {
          kind: reversalTarget.kind,
          status: reversalTarget.status,
          amountMinor: reversalTarget.amountMinor,
          hasOpenReversal: debt.payments.some(
            (payment) => payment.reversesId === reversalTarget.id && isOpenMovement(payment.status),
          ),
        },
      );
      if (ruleError === "exceeds_balance") {
        throw new AppError("exceeds_balance", { fields: { amount: "amountExceedsBalance" } });
      }
      if (ruleError) throw new AppError(ruleError);

      const isPayment = data.kind === "PAYMENT";
      const bankDetails = isPayment
        ? await resolveBankDetails(tx, actor, debtId, access, { ...data, method: data.method })
        : null;

      const payment = await tx.payment.create({
        data: {
          debtId,
          kind: data.kind,
          status: debt.mode === "PERSONAL" ? "PERSONAL_RECORD" : "PENDING",
          amountMinor,
          effectiveDate: fromISODate(data.effectiveDate),
          recordedById: actor.id,
          recordedByRole: access.role,
          method: isPayment ? data.method : null,
          reference: isPayment ? data.reference : null,
          notes: data.notes,
          place: isPayment && data.method === "CASH" ? data.place : null,
          reversesId: reversalTarget?.id ?? null,
          idempotencyKey: data.idempotencyKey,
          ...(bankDetails ? { bankDetails: { create: bankDetails } } : {}),
        },
      });

      const eventData = {
        kind: data.kind,
        amountMinor,
        currency: debt.currency,
        effectiveDate: data.effectiveDate,
        method: isPayment ? data.method : null,
      };

      if (debt.mode === "PERSONAL") {
        await recordEvent(tx, {
          scope: "PERSONAL",
          type: "PAYMENT_RECORDED",
          debtId,
          actorId: actor.id,
          actorRole: access.role,
          paymentId: payment.id,
          data: eventData,
        });
        await refreshDebtStatus(tx, debtId, actor);
        return { paymentId: payment.id };
      }

      // Recording a movement is the recorder's side of the confirmation.
      await tx.paymentApproval.create({
        data: { paymentId: payment.id, role: access.role, userId: actor.id, decision: "APPROVED" },
      });
      await recordEvent(tx, {
        scope: "SHARED",
        type: "PAYMENT_RECORDED",
        debtId,
        actorId: actor.id,
        actorRole: access.role,
        paymentId: payment.id,
        data: eventData,
      });
      if (access.other?.userId) {
        await notify(tx, {
          userId: access.other.userId,
          type: "PAYMENT_TO_CONFIRM",
          debtId,
          data: {
            actor: actorDisplayName(actor),
            concept: debt.concept,
            amountMinor: amountMinor.toString(),
            currency: debt.currency,
            date: data.effectiveDate,
            paymentId: payment.id,
            kind: data.kind,
          },
        });
      }
      return { paymentId: payment.id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "idempotencyKey")) {
      const existing = await findExisting();
      if (existing) return { paymentId: existing.id };
    }
    if (isUniqueViolation(error, "Payment_one_live_reversal") || isUniqueViolation(error, "reversesId")) {
      throw new AppError("reversal_already_exists");
    }
    throw error;
  }
}

const DECISION_LOG: Record<MovementAction, PaymentDecision> = {
  approve: "APPROVED",
  reject: "REJECTED",
  ask: "CLARIFICATION_REQUESTED",
  clarify: "CLARIFIED",
  withdraw: "WITHDRAWN",
};

const DECISION_EVENT = {
  approve: "PAYMENT_CONFIRMED",
  reject: "PAYMENT_REJECTED",
  ask: "PAYMENT_CLARIFICATION_REQUESTED",
  clarify: "PAYMENT_CLARIFIED",
  withdraw: "PAYMENT_WITHDRAWN",
} as const;

const DECISION_NOTIFICATION = {
  approve: "PAYMENT_CONFIRMED",
  reject: "PAYMENT_REJECTED",
  ask: "PAYMENT_CLARIFICATION_REQUESTED",
  clarify: "PAYMENT_CLARIFIED",
  withdraw: "PAYMENT_WITHDRAWN",
} as const;

/**
 * One side answers a movement of a shared agreement.
 *
 * approve / reject / ask   → only the side that did NOT record it
 * clarify / withdraw       → only the side that recorded it
 */
export async function decideMovement(
  actor: Actor,
  paymentId: string,
  action: MovementAction,
  comment?: string | null,
): Promise<void> {
  const text = cleanText(comment ?? "", true).slice(0, 1000) || null;
  if ((action === "reject" || action === "ask" || action === "clarify") && !text) {
    throw new AppError("validation", { fields: { comment: "required" } });
  }

  const located = await prisma.payment.findUnique({ where: { id: paymentId }, select: { debtId: true } });
  if (!located) throw new AppError("not_found");
  const debtId = located.debtId;

  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    if (access.mode !== "SHARED") throw new AppError("invalid_state");
    if (!access.me?.identityConfirmedAt) throw new AppError("identity_unconfirmed");

    const debt = await tx.debt.findUniqueOrThrow({
      where: { id: debtId },
      include: { payments: { select: { id: true, kind: true, status: true, amountMinor: true } } },
    });
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

    const target = movementStatusAfter(action);
    // Repeating a decision that already took effect is harmless (double click, retry).
    if (payment.status === target && action !== "clarify") return;

    const allowed = allowedMovementActions(payment.status, access.role, payment.recordedByRole);
    if (!allowed.includes(action)) {
      const isRecorder = payment.recordedByRole === access.role;
      if (action === "approve" && isRecorder) throw new AppError("own_movement");
      throw new AppError("not_your_turn");
    }

    if (action === "approve") {
      if (!canRecordMovement("SHARED", debt.status, payment.kind)) throw new AppError("invalid_state");
      const balance = computeBalance("SHARED", debt.principalMinor, debt.payments);
      const ruleError = checkConfirmation(balance, { kind: payment.kind, amountMinor: payment.amountMinor });
      if (ruleError) throw new AppError(ruleError);
    }

    const now = new Date();
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: target,
        decidedAt: action === "ask" || action === "clarify" ? null : now,
        confirmedAt: action === "approve" ? now : null,
      },
    });
    await tx.paymentApproval.create({
      data: { paymentId: payment.id, role: access.role, userId: actor.id, decision: DECISION_LOG[action], comment: text },
    });
    await recordEvent(tx, {
      scope: "SHARED",
      type: DECISION_EVENT[action],
      debtId,
      actorId: actor.id,
      actorRole: access.role,
      paymentId: payment.id,
      data: {
        kind: payment.kind,
        amountMinor: payment.amountMinor,
        currency: debt.currency,
        effectiveDate: toISODate(payment.effectiveDate),
        comment: text,
      },
    });

    if (access.other?.userId) {
      await notify(tx, {
        userId: access.other.userId,
        type: DECISION_NOTIFICATION[action],
        debtId,
        data: {
          actor: actorDisplayName(actor),
          concept: debt.concept,
          amountMinor: payment.amountMinor.toString(),
          currency: debt.currency,
          date: toISODate(payment.effectiveDate),
          comment: text ?? undefined,
          paymentId: payment.id,
          kind: payment.kind,
        },
      });
    }

    if (action === "approve") await refreshDebtStatus(tx, debtId, actor);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Personal records: free to edit and delete
// ─────────────────────────────────────────────────────────────────────────────

async function loadOwnPersonalMovement(tx: Tx, actor: Pick<Actor, "id">, paymentId: string) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { debt: { select: { id: true, mode: true, ownerId: true, ownerRole: true, status: true, currency: true, originDate: true, principalMinor: true } } },
  });
  if (!payment || payment.debt.mode !== "PERSONAL" || payment.debt.ownerId !== actor.id) throw new AppError("not_found");
  return payment;
}

export async function updatePersonalMovement(
  actor: Actor,
  paymentId: string,
  input: UpdateMovementFormValues,
): Promise<void> {
  const data = parseInput(updateMovementSchema, input);
  const located = await prisma.payment.findUnique({ where: { id: paymentId }, select: { debtId: true } });
  if (!located) throw new AppError("not_found");

  await transaction(async (tx) => {
    await lockDebt(tx, located.debtId);
    const payment = await loadOwnPersonalMovement(tx, actor, paymentId);
    const debt = payment.debt;
    if (debt.status !== "ACTIVE" && debt.status !== "SETTLED") throw new AppError("invalid_state");
    const access = await requireDebtAccess(tx, actor, debt.id);

    assertEffectiveDate(data.effectiveDate, debt.originDate, actor);
    const amount = readAmount(data.amount ?? "", debt.currency);
    if ("error" in amount) throw new AppError("validation", { fields: { amount: amount.error } });
    if (payment.kind !== "PAYMENT" && !data.notes) throw new AppError("validation", { fields: { notes: "required" } });

    // Check the new amount against the balance as if this movement did not exist yet.
    const others = await tx.payment.findMany({
      where: { debtId: debt.id, id: { not: payment.id } },
      select: { kind: true, status: true, amountMinor: true },
    });
    const balance = computeBalance("PERSONAL", debt.principalMinor, others);
    const ruleError = checkNewMovement("PERSONAL", balance, { kind: payment.kind, amountMinor: amount.minor });
    if (ruleError === "exceeds_balance" || ruleError === "nothing_to_pay") {
      throw new AppError("exceeds_balance", { fields: { amount: "amountExceedsBalance" } });
    }
    if (ruleError) throw new AppError(ruleError);

    const isPayment = payment.kind === "PAYMENT";
    const bankDetails = isPayment
      ? await resolveBankDetails(tx, actor, debt.id, access, { ...data, method: data.method })
      : null;

    await tx.paymentBankDetails.deleteMany({ where: { paymentId: payment.id } });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        amountMinor: amount.minor,
        effectiveDate: fromISODate(data.effectiveDate),
        method: isPayment ? data.method : null,
        reference: isPayment ? data.reference : null,
        notes: data.notes,
        place: isPayment && data.method === "CASH" ? data.place : null,
        ...(bankDetails ? { bankDetails: { create: bankDetails } } : {}),
      },
    });
    await recordEvent(tx, {
      scope: "PERSONAL",
      type: "PAYMENT_UPDATED",
      debtId: debt.id,
      actorId: actor.id,
      actorRole: debt.ownerRole,
      paymentId: payment.id,
      data: {
        kind: payment.kind,
        currency: debt.currency,
        before: { amountMinor: payment.amountMinor, effectiveDate: toISODate(payment.effectiveDate) },
        amountMinor: amount.minor,
        effectiveDate: data.effectiveDate,
      },
    });
    await refreshDebtStatus(tx, debt.id, actor);
  });
}

export async function deletePersonalMovement(actor: Actor, paymentId: string): Promise<void> {
  const located = await prisma.payment.findUnique({ where: { id: paymentId }, select: { debtId: true } });
  if (!located) throw new AppError("not_found");

  const storageKeys = await transaction(async (tx) => {
    await lockDebt(tx, located.debtId);
    const payment = await loadOwnPersonalMovement(tx, actor, paymentId);
    const debt = payment.debt;
    if (debt.status !== "ACTIVE" && debt.status !== "SETTLED") throw new AppError("invalid_state");

    const attachments = await tx.attachment.findMany({ where: { paymentId: payment.id }, select: { storageKey: true } });
    await tx.payment.delete({ where: { id: payment.id } });
    await recordEvent(tx, {
      scope: "PERSONAL",
      type: "PAYMENT_DELETED",
      debtId: debt.id,
      actorId: actor.id,
      actorRole: debt.ownerRole,
      data: {
        kind: payment.kind,
        amountMinor: payment.amountMinor,
        currency: debt.currency,
        effectiveDate: toISODate(payment.effectiveDate),
      },
    });
    await refreshDebtStatus(tx, debt.id, actor);
    return attachments.map((attachment) => attachment.storageKey);
  });
  await deleteOrphanedFiles(storageKeys);
}

/** Free-text note on the timeline. In a shared agreement the other side is told. */
export async function addComment(actor: Actor, debtId: string, rawText: string): Promise<void> {
  const text = cleanText(rawText ?? "", true);
  if (!text) throw new AppError("validation", { fields: { text: "required" } });
  if (text.length > 1000) throw new AppError("validation", { fields: { text: "tooLong" } });

  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId }, select: { concept: true } });
    await recordEvent(tx, {
      scope: access.mode === "PERSONAL" ? "PERSONAL" : "SHARED",
      type: "COMMENT_ADDED",
      debtId,
      actorId: actor.id,
      actorRole: access.role,
      data: { text },
    });
    if (access.mode === "SHARED" && access.other?.userId) {
      await notify(tx, {
        userId: access.other.userId,
        type: "COMMENT_ADDED",
        debtId,
        data: { actor: actorDisplayName(actor), concept: debt.concept, comment: text.slice(0, 200) },
      });
    }
  });
}

export type { MovementKind, PartyRole };
export { countsTowardBalance, otherRole };
