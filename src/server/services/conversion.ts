import "server-only";
import { computeBalance, countsTowardBalance } from "@/domain/balance";
import { toISODate, todayInTimeZone } from "@/domain/dates";
import { allocatePayments, finalDueDate, type InstallmentInput, type ScheduleType } from "@/domain/schedule";
import { normalizeTerms, TERMS_VERSION, type TermsSnapshot } from "@/domain/terms";
import { conversionSchema, type ConversionFormValues } from "@/schemas/debt";
import type { Actor } from "../actor";
import { recordEvent } from "../audit";
import { prisma } from "../db";
import { AppError } from "../errors";
import { createSharedAgreementTx, type CreatedAgreement } from "./agreements";
import { isUniqueViolation, lockDebt, transaction } from "./shared";
import { assertValidTerms } from "./terms-builder";
import { parseInput } from "./validation";

/**
 * From a personal record to a shared agreement.
 *
 * Converting never touches the personal record. It writes a PROPOSAL — a brand-new shared
 * agreement that points back to the record — containing only what the owner chose to share.
 * The owner's personal payments do not become confirmed payments: the ones they select are
 * listed in the proposal as earlier payments to be recognised, and they only count once the
 * other person has explicitly accepted that proposal.
 *
 * Until then, and if the proposal is rejected or withdrawn, the personal record stays exactly
 * as it was. When the agreement comes into force the record becomes a read-only archive.
 */

function scheduleFor(
  installments: readonly InstallmentInput[],
  originalType: ScheduleType,
  changed: boolean,
): { type: ScheduleType; installments: InstallmentInput[] } {
  if (installments.length === 0) return { type: "NONE", installments: [] };
  if (installments.length === 1) return { type: "SINGLE", installments: [...installments] };
  return { type: changed || originalType === "SINGLE" || originalType === "NONE" ? "CUSTOM" : originalType, installments: [...installments] };
}

export async function proposeConversion(
  actor: Actor,
  personalDebtId: string,
  input: ConversionFormValues,
): Promise<CreatedAgreement> {
  const data = parseInput(conversionSchema, input);

  const findExisting = () =>
    prisma.debt.findUnique({
      where: { createdById_idempotencyKey: { createdById: actor.id, idempotencyKey: data.idempotencyKey } },
      select: { id: true },
    });

  try {
    return await transaction(async (tx) => {
      await lockDebt(tx, personalDebtId);

      const repeated = await tx.debt.findUnique({
        where: { createdById_idempotencyKey: { createdById: actor.id, idempotencyKey: data.idempotencyKey } },
        select: { id: true },
      });
      if (repeated) return { debtId: repeated.id, invitation: null, inviteEmail: null };

      const debt = await tx.debt.findFirst({
        where: { id: personalDebtId, mode: "PERSONAL", ownerId: actor.id },
        include: {
          contact: true,
          installments: { orderBy: { sequence: "asc" } },
          payments: { orderBy: { effectiveDate: "asc" } },
          attachments: true,
        },
      });
      if (!debt || !debt.contact || !debt.ownerRole) throw new AppError("not_found");
      if (debt.status === "CONVERTED") throw new AppError("already_converted");
      if (debt.status !== "ACTIVE") throw new AppError("invalid_state");

      const live = await tx.debt.findFirst({
        where: { sourceDebtId: debt.id, status: { not: "CANCELLED" } },
        select: { id: true },
      });
      if (live) throw new AppError("conversion_pending");

      const today = todayInTimeZone(actor.timeZone);
      const balance = computeBalance("PERSONAL", debt.principalMinor, debt.payments);
      if (balance.outstandingMinor <= 0n) throw new AppError("nothing_to_pay");

      const schedule = debt.installments.map((installment) => ({
        sequence: installment.sequence,
        dueDate: toISODate(installment.dueDate),
        amountMinor: installment.amountMinor,
      }));

      let principalMinor: bigint;
      let balanceAsOf: string | null;
      let installments: InstallmentInput[];
      let scheduleChanged: boolean;
      let historicalPayments: TermsSnapshot["historicalPayments"] = [];
      let sharedPaymentIds: string[] = [];

      if (data.history === "BALANCE_ONLY") {
        // Share only what is still owed today. None of the history leaves the personal record.
        principalMinor = balance.outstandingMinor;
        balanceAsOf = today;
        const progress = allocatePayments(schedule, {
          totalOwedMinor: balance.totalOwedMinor,
          paidMinor: balance.paidMinor,
          today,
        });
        installments = progress.rows
          .filter((row) => row.remainingMinor > 0n)
          .map((row, index) => ({ sequence: index + 1, dueDate: row.dueDate, amountMinor: row.remainingMinor }));
        const unscheduledRemaining = progress.unscheduledMinor - progress.unscheduledPaidMinor;
        if (installments.length > 0 && unscheduledRemaining > 0n) {
          installments[installments.length - 1].amountMinor += unscheduledRemaining;
        }
        scheduleChanged = true;
      } else {
        // Share the whole amount and the payments the owner picked. A payment that is not
        // picked is simply not part of the proposal.
        principalMinor = balance.totalOwedMinor;
        balanceAsOf = null;
        const selectable = debt.payments.filter(
          (payment) => payment.kind === "PAYMENT" && countsTowardBalance("PERSONAL", payment.status),
        );
        const selected = selectable.filter((payment) => data.paymentIds.includes(payment.id));
        if (selected.length !== new Set(data.paymentIds).size) throw new AppError("not_found");
        sharedPaymentIds = selected.map((payment) => payment.id);
        historicalPayments = selected.map((payment) => ({
          effectiveDate: toISODate(payment.effectiveDate),
          amountMinor: payment.amountMinor.toString(),
          method: payment.method,
          note: data.includeNotes ? payment.notes?.slice(0, 280) ?? null : null,
        }));

        // The schedule has to cover the whole amount; allocating with nothing paid applies any
        // adjustment recorded after the schedule was written.
        const progress = allocatePayments(schedule, { totalOwedMinor: principalMinor, paidMinor: 0n, today });
        installments = progress.rows
          .filter((row) => row.scheduledMinor > 0n)
          .map((row, index) => ({ sequence: index + 1, dueDate: row.dueDate, amountMinor: row.scheduledMinor }));
        if (installments.length > 0 && progress.unscheduledMinor > 0n) {
          installments[installments.length - 1].amountMinor += progress.unscheduledMinor;
        }
        scheduleChanged =
          installments.length !== schedule.length ||
          installments.some((installment, index) => installment.amountMinor !== schedule[index].amountMinor);
      }

      const shaped = scheduleFor(installments, debt.scheduleType, scheduleChanged);
      const terms = normalizeTerms({
        v: TERMS_VERSION,
        concept: debt.concept,
        currency: debt.currency,
        principalMinor: principalMinor.toString(),
        originDate: toISODate(debt.originDate),
        dueDate: finalDueDate(shaped.installments),
        balanceAsOf,
        scheduleType: shaped.type,
        installments: shaped.installments.map((installment) => ({
          sequence: installment.sequence,
          dueDate: installment.dueDate,
          amountMinor: installment.amountMinor.toString(),
        })),
        plannedMethod: debt.plannedMethod,
        // Private notes stay private unless the owner asks for them to be copied.
        sharedNotes: data.includeNotes ? debt.privateNotes : null,
        historicalPayments,
      });
      assertValidTerms(terms, today);

      const created = await createSharedAgreementTx(tx, actor, {
        idempotencyKey: data.idempotencyKey,
        myRole: debt.ownerRole,
        contact: debt.contact,
        terms,
        inviteEmail: data.inviteEmail,
        shareAccountId: data.shareAccountId,
        sourceDebtId: debt.id,
        send: true,
      });

      if (data.includeReceipts) {
        const receipts = debt.attachments.filter(
          (attachment) => attachment.paymentId === null || sharedPaymentIds.includes(attachment.paymentId),
        );
        if (receipts.length > 0) {
          // Same stored file, new row owned by the agreement (see deleteOrphanedFiles).
          await tx.attachment.createMany({
            data: receipts.map((attachment) => ({
              debtId: created.debtId,
              paymentId: null,
              uploaderId: actor.id,
              storageKey: attachment.storageKey,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              sha256: attachment.sha256,
            })),
          });
        }
      }

      await recordEvent(tx, {
        scope: "PERSONAL",
        type: "CONVERSION_PROPOSED",
        debtId: debt.id,
        actorId: actor.id,
        actorRole: debt.ownerRole,
        data: {
          sharedDebtId: created.debtId,
          history: data.history,
          sharedPayments: historicalPayments.length,
          amountMinor: principalMinor,
          currency: debt.currency,
        },
      });

      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error, "idempotencyKey")) {
      const existing = await findExisting();
      if (existing) return { debtId: existing.id, invitation: null, inviteEmail: null };
    }
    if (isUniqueViolation(error, "Debt_one_live_conversion") || isUniqueViolation(error, "sourceDebtId")) {
      throw new AppError("conversion_pending");
    }
    throw error;
  }
}
