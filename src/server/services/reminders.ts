import "server-only";
import { addDays, daysBetween, todayInTimeZone, toISODate } from "@/domain/dates";
import { computeBalance } from "@/domain/balance";
import { allocatePayments } from "@/domain/schedule";
import { prisma } from "../db";
import { flushEmailOutbox, notify } from "../notifications";
import { pruneRateLimitBuckets } from "../rate-limit";

/**
 * Due-date reminders.
 *
 * For every instalment that still has something pending, at most three reminders are created
 * per person: a few days before, on the day, and once it is overdue. Each one carries a
 * de-duplication key, so the job can run as often as you like — on a timer inside the server,
 * from an external scheduler, or both — without ever repeating itself.
 *
 *   Personal records  → only their owner is reminded.
 *   Shared agreements → both participants, each with their own wording.
 */

const DAYS_BEFORE = 3;

export interface ReminderRun {
  examined: number;
  created: number;
  emails: { sent: number; failed: number };
}

export async function runReminders(now: Date = new Date()): Promise<ReminderRun> {
  // Only look at instalments around today; everything else cannot produce a reminder.
  const utcToday = toISODate(now);
  const debts = await prisma.debt.findMany({
    where: {
      status: { in: ["ACTIVE", "DISPUTED"] },
      installments: { some: { dueDate: { lte: new Date(`${addDays(utcToday, DAYS_BEFORE + 1)}T00:00:00.000Z`) } } },
    },
    select: {
      id: true,
      mode: true,
      concept: true,
      currency: true,
      principalMinor: true,
      ownerId: true,
      ownerRole: true,
      contact: { select: { name: true } },
      owner: { select: { preferences: { select: { timeZone: true } } } },
      participants: {
        select: {
          role: true,
          userId: true,
          displayName: true,
          identityConfirmedAt: true,
          user: { select: { preferences: { select: { timeZone: true } } } },
        },
      },
      installments: { select: { id: true, sequence: true, dueDate: true, amountMinor: true } },
      payments: { select: { kind: true, status: true, amountMinor: true } },
    },
  });

  let created = 0;

  for (const debt of debts) {
    const balance = computeBalance(debt.mode, debt.principalMinor, debt.payments);
    if (balance.outstandingMinor <= 0n) continue;

    const recipients =
      debt.mode === "PERSONAL"
        ? debt.ownerId && debt.ownerRole
          ? [
              {
                userId: debt.ownerId,
                role: debt.ownerRole,
                counterparty: debt.contact?.name ?? "",
                timeZone: debt.owner?.preferences?.timeZone ?? "America/Mexico_City",
              },
            ]
          : []
        : debt.participants
            .filter((participant) => participant.userId && participant.identityConfirmedAt)
            .map((participant) => ({
              userId: participant.userId as string,
              role: participant.role,
              counterparty: debt.participants.find((other) => other.role !== participant.role)?.displayName ?? "",
              timeZone: participant.user?.preferences?.timeZone ?? "America/Mexico_City",
            }));

    for (const recipient of recipients) {
      const today = todayInTimeZone(recipient.timeZone, now);
      const progress = allocatePayments(
        debt.installments.map((installment) => ({
          sequence: installment.sequence,
          dueDate: toISODate(installment.dueDate),
          amountMinor: installment.amountMinor,
        })),
        { totalOwedMinor: balance.totalOwedMinor, paidMinor: balance.paidMinor, today },
      );

      for (const row of progress.rows) {
        if (row.remainingMinor <= 0n) continue;
        const installment = debt.installments.find((candidate) => candidate.sequence === row.sequence);
        if (!installment) continue;

        const daysLeft = daysBetween(today, row.dueDate);
        const type =
          daysLeft < 0
            ? ("INSTALLMENT_OVERDUE" as const)
            : daysLeft === 0
              ? ("INSTALLMENT_DUE_TODAY" as const)
              : daysLeft <= DAYS_BEFORE
                ? ("INSTALLMENT_DUE_SOON" as const)
                : null;
        if (!type) continue;

        const delivered = await notify(prisma, {
          userId: recipient.userId,
          type,
          debtId: debt.id,
          // Keyed by the instalment AND its date: a rescheduled instalment is reminded afresh.
          dedupeKey: `${type}:${installment.id}:${row.dueDate}:${recipient.userId}`,
          data: {
            concept: debt.concept,
            counterparty: recipient.counterparty,
            amountMinor: row.remainingMinor.toString(),
            currency: debt.currency,
            date: row.dueDate,
            role: recipient.role,
            days: Math.abs(daysLeft),
          },
        });
        if (delivered) created += 1;
      }
    }
  }

  const emails = await flushEmailOutbox(100);
  await pruneRateLimitBuckets().catch(() => 0);
  await prisma.session.deleteMany({ where: { expires: { lt: now } } }).catch(() => undefined);

  return { examined: debts.length, created, emails };
}
