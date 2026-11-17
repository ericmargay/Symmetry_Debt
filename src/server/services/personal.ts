import "server-only";
import { fromISODate, toISODate } from "@/domain/dates";
import { minorFromString } from "@/domain/money";
import { diffTerms, type TermsSnapshot } from "@/domain/terms";
import {
  createPersonalDebtSchema,
  updatePersonalDebtSchema,
  type CreateDebtFormValues,
  type UpdatePersonalDebtFormValues,
} from "@/schemas/debt";
import type { Actor } from "../actor";
import { recordEvent } from "../audit";
import { prisma, type Tx } from "../db";
import { AppError } from "../errors";
import { deleteOrphanedFiles } from "./attachments";
import { loadBalance, refreshDebtStatus } from "./balances";
import { resolveContact } from "./contacts";
import { isUniqueViolation, lockDebt, transaction } from "./shared";
import { buildTerms } from "./terms-builder";
import { parseInput } from "./validation";

/**
 * Personal tracking: records that belong to one person only.
 *
 * Nothing here ever asks anybody for approval, and nothing here is ever a bilateral
 * confirmation: the owner writes, edits and deletes their own records freely. Every change is
 * still written to the (private) history of the record.
 */

async function assertOwnAccount(tx: Tx, actor: Pick<Actor, "id">, accountId: string | null, isCreditor: boolean) {
  if (accountId === null) return null;
  // A receiving account only makes sense when the owner is the one being paid.
  if (!isCreditor) return null;
  const account = await tx.bankAccount.findFirst({ where: { id: accountId, userId: actor.id }, select: { id: true } });
  if (!account) throw new AppError("bank_account_not_found");
  return account.id;
}

export async function replaceInstallments(tx: Tx, debtId: string, terms: TermsSnapshot): Promise<void> {
  await tx.installment.deleteMany({ where: { debtId } });
  if (terms.installments.length === 0) return;
  await tx.installment.createMany({
    data: terms.installments.map((installment) => ({
      debtId,
      sequence: installment.sequence,
      dueDate: fromISODate(installment.dueDate),
      amountMinor: minorFromString(installment.amountMinor),
    })),
  });
}

/** The columns of Debt that mirror a terms snapshot. */
export function debtTermsColumns(terms: TermsSnapshot) {
  return {
    concept: terms.concept,
    currency: terms.currency,
    principalMinor: minorFromString(terms.principalMinor),
    originDate: fromISODate(terms.originDate),
    dueDate: terms.dueDate ? fromISODate(terms.dueDate) : null,
    balanceAsOf: terms.balanceAsOf ? fromISODate(terms.balanceAsOf) : null,
    scheduleType: terms.scheduleType,
    plannedMethod: terms.plannedMethod,
  };
}

export async function createPersonalDebt(actor: Actor, input: CreateDebtFormValues): Promise<{ debtId: string }> {
  const data = parseInput(createPersonalDebtSchema, input);
  const terms = buildTerms(data, actor);

  const findExisting = () =>
    prisma.debt.findUnique({
      where: { createdById_idempotencyKey: { createdById: actor.id, idempotencyKey: data.idempotencyKey } },
      select: { id: true },
    });

  try {
    return await transaction(async (tx) => {
      const existing = await tx.debt.findUnique({
        where: { createdById_idempotencyKey: { createdById: actor.id, idempotencyKey: data.idempotencyKey } },
        select: { id: true },
      });
      if (existing) return { debtId: existing.id };

      const contact = await resolveContact(tx, actor, data.counterparty);
      const receivingAccountId = await assertOwnAccount(tx, actor, data.receivingAccountId, data.myRole === "CREDITOR");

      const debt = await tx.debt.create({
        data: {
          mode: "PERSONAL",
          status: "ACTIVE",
          ownerId: actor.id,
          createdById: actor.id,
          ownerRole: data.myRole,
          contactId: contact.id,
          privateNotes: data.privateNotes,
          receivingAccountId,
          idempotencyKey: data.idempotencyKey,
          ...debtTermsColumns(terms),
        },
      });
      await replaceInstallments(tx, debt.id, terms);
      await recordEvent(tx, {
        scope: "PERSONAL",
        type: "DEBT_CREATED",
        debtId: debt.id,
        actorId: actor.id,
        actorRole: data.myRole,
        data: {
          concept: terms.concept,
          amountMinor: terms.principalMinor,
          currency: terms.currency,
          counterparty: contact.name,
          role: data.myRole,
        },
      });

      for (const previous of terms.historicalPayments) {
        const payment = await tx.payment.create({
          data: {
            debtId: debt.id,
            kind: "PAYMENT",
            status: "PERSONAL_RECORD",
            amountMinor: minorFromString(previous.amountMinor),
            effectiveDate: fromISODate(previous.effectiveDate),
            recordedById: actor.id,
            recordedByRole: data.myRole,
            method: previous.method,
            notes: previous.note,
          },
        });
        await recordEvent(tx, {
          scope: "PERSONAL",
          type: "PAYMENT_RECORDED",
          debtId: debt.id,
          actorId: actor.id,
          actorRole: data.myRole,
          paymentId: payment.id,
          data: {
            kind: "PAYMENT",
            amountMinor: previous.amountMinor,
            currency: terms.currency,
            effectiveDate: previous.effectiveDate,
            method: previous.method,
          },
        });
      }

      return { debtId: debt.id };
    });
  } catch (error) {
    // Two identical submissions raced: the first one won, hand back its result.
    if (isUniqueViolation(error)) {
      const existing = await findExisting();
      if (existing) return { debtId: existing.id };
    }
    throw error;
  }
}

export async function updatePersonalDebt(
  actor: Actor,
  debtId: string,
  input: UpdatePersonalDebtFormValues,
): Promise<void> {
  const data = parseInput(updatePersonalDebtSchema, input);
  const terms = buildTerms({ ...data, previousPayments: [] }, actor);

  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const debt = await tx.debt.findFirst({
      where: { id: debtId, mode: "PERSONAL", ownerId: actor.id },
      include: { installments: { orderBy: { sequence: "asc" } }, contact: true },
    });
    if (!debt) throw new AppError("not_found");
    if (debt.status !== "ACTIVE" && debt.status !== "SETTLED") throw new AppError("invalid_state");

    // The new amount cannot be lower than what has already been recorded as paid.
    const balance = await loadBalance(tx, { id: debt.id, mode: "PERSONAL", principalMinor: minorFromString(terms.principalMinor) });
    if (balance.outstandingMinor < 0n) {
      throw new AppError("validation", { fields: { amount: "amountBelowPaid" } });
    }

    const contact = await resolveContact(tx, actor, data.counterparty);
    const receivingAccountId = await assertOwnAccount(tx, actor, data.receivingAccountId, data.myRole === "CREDITOR");

    const previousTerms: TermsSnapshot = {
      v: 1,
      concept: debt.concept,
      currency: debt.currency,
      principalMinor: debt.principalMinor.toString(),
      originDate: toISODate(debt.originDate),
      dueDate: debt.dueDate ? toISODate(debt.dueDate) : null,
      balanceAsOf: null,
      scheduleType: debt.scheduleType,
      installments: debt.installments.map((installment) => ({
        sequence: installment.sequence,
        dueDate: toISODate(installment.dueDate),
        amountMinor: installment.amountMinor.toString(),
      })),
      plannedMethod: debt.plannedMethod,
      sharedNotes: null,
      historicalPayments: [],
    };
    const changed = diffTerms(previousTerms, terms);

    await tx.debt.update({
      where: { id: debt.id },
      data: {
        ownerRole: data.myRole,
        contactId: contact.id,
        privateNotes: data.privateNotes,
        receivingAccountId,
        ...debtTermsColumns(terms),
        lockVersion: { increment: 1 },
      },
    });
    if (changed.includes("schedule")) await replaceInstallments(tx, debt.id, terms);

    const roleChanged = debt.ownerRole !== data.myRole;
    const contactChanged = debt.contactId !== contact.id;
    if (changed.length > 0 || roleChanged || contactChanged) {
      await recordEvent(tx, {
        scope: "PERSONAL",
        type: changed.length === 1 && changed[0] === "schedule" && !roleChanged && !contactChanged ? "SCHEDULE_UPDATED" : "DEBT_UPDATED",
        debtId: debt.id,
        actorId: actor.id,
        actorRole: data.myRole,
        data: {
          changed: [...changed, ...(roleChanged ? ["role"] : []), ...(contactChanged ? ["counterparty"] : [])],
          before: { concept: debt.concept, amountMinor: debt.principalMinor, currency: debt.currency },
          after: { concept: terms.concept, amountMinor: terms.principalMinor, currency: terms.currency },
        },
      });
    }

    await refreshDebtStatus(tx, debt.id, actor);
  });
}

/** Cancels (keeps the record, stops counting it) or reopens a personal record. */
export async function setPersonalDebtCancelled(actor: Actor, debtId: string, cancelled: boolean): Promise<void> {
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const debt = await tx.debt.findFirst({ where: { id: debtId, mode: "PERSONAL", ownerId: actor.id } });
    if (!debt) throw new AppError("not_found");

    if (cancelled) {
      if (debt.status !== "ACTIVE") throw new AppError("invalid_state");
      await tx.debt.update({
        where: { id: debt.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), closedReason: "owner", lockVersion: { increment: 1 } },
      });
      await recordEvent(tx, { scope: "PERSONAL", type: "DEBT_CANCELLED", debtId: debt.id, actorId: actor.id, data: { reason: "owner" } });
      return;
    }

    if (debt.status !== "CANCELLED") throw new AppError("invalid_state");
    await tx.debt.update({
      where: { id: debt.id },
      data: { status: "ACTIVE", cancelledAt: null, closedReason: null, lockVersion: { increment: 1 } },
    });
    await recordEvent(tx, { scope: "PERSONAL", type: "DEBT_REOPENED", debtId: debt.id, actorId: actor.id, data: { reason: "owner" } });
    await refreshDebtStatus(tx, debt.id, actor);
  });
}

/**
 * Deletes a personal record and everything attached to it, for good. It is the owner's own
 * data. A shared agreement proposed from it is not affected: it simply loses its link back.
 */
export async function deletePersonalDebt(actor: Actor, debtId: string): Promise<void> {
  const storageKeys = await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const debt = await tx.debt.findFirst({
      where: { id: debtId, mode: "PERSONAL", ownerId: actor.id },
      select: { id: true, attachments: { select: { storageKey: true } } },
    });
    if (!debt) throw new AppError("not_found");
    await tx.debt.delete({ where: { id: debt.id } });
    return debt.attachments.map((attachment) => attachment.storageKey);
  });
  await deleteOrphanedFiles(storageKeys);
}
