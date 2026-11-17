import "server-only";
import { computeBalance, type Balance, type DebtMode, type MovementLike } from "@/domain/balance";
import { statusAfterBalanceChange, type DebtStatus } from "@/domain/lifecycle";
import type { Actor } from "../actor";
import { recordEvent } from "../audit";
import type { Db, Tx } from "../db";
import { notify } from "../notifications";

/** The balance of one debt, computed from its movements (never read from a stored total). */
export async function loadBalance(
  db: Db,
  debt: { id: string; mode: DebtMode; principalMinor: bigint },
): Promise<Balance> {
  const movements = await db.payment.findMany({
    where: { debtId: debt.id },
    select: { kind: true, status: true, amountMinor: true },
  });
  return computeBalance(debt.mode, debt.principalMinor, movements);
}

/** Balances for many debts with a single query. */
export async function loadBalances(
  db: Db,
  debts: ReadonlyArray<{ id: string; mode: DebtMode; principalMinor: bigint }>,
): Promise<Map<string, Balance>> {
  const result = new Map<string, Balance>();
  if (debts.length === 0) return result;

  const movements = await db.payment.findMany({
    where: { debtId: { in: debts.map((debt) => debt.id) } },
    select: { debtId: true, kind: true, status: true, amountMinor: true },
  });
  const byDebt = new Map<string, MovementLike[]>();
  for (const movement of movements) {
    const list = byDebt.get(movement.debtId);
    if (list) list.push(movement);
    else byDebt.set(movement.debtId, [movement]);
  }
  for (const debt of debts) {
    result.set(debt.id, computeBalance(debt.mode, debt.principalMinor, byDebt.get(debt.id) ?? []));
  }
  return result;
}

export interface StatusRefresh {
  status: DebtStatus;
  balance: Balance;
  change: "SETTLED" | "REOPENED" | null;
}

/**
 * After anything that may have moved the balance: settles the debt when nothing is left to pay
 * and reopens it if a correction leaves something pending again. Must run inside the same
 * transaction (and under the same row lock) as the change itself.
 */
export async function refreshDebtStatus(tx: Tx, debtId: string, actor: Pick<Actor, "id"> | null): Promise<StatusRefresh> {
  const debt = await tx.debt.findUniqueOrThrow({
    where: { id: debtId },
    select: {
      id: true,
      mode: true,
      status: true,
      principalMinor: true,
      concept: true,
      currency: true,
      participants: { select: { userId: true, role: true, displayName: true } },
    },
  });
  const balance = await loadBalance(tx, debt);
  const next = statusAfterBalanceChange(debt.status, balance.outstandingMinor);
  if (next === debt.status) return { status: debt.status, balance, change: null };

  const settled = next === "SETTLED";
  await tx.debt.update({
    where: { id: debt.id },
    data: { status: next, settledAt: settled ? new Date() : null, lockVersion: { increment: 1 } },
  });
  await recordEvent(tx, {
    scope: debt.mode === "PERSONAL" ? "PERSONAL" : "SHARED",
    type: settled ? "DEBT_SETTLED" : "DEBT_REOPENED",
    debtId: debt.id,
    actorId: actor?.id ?? null,
    data: { outstandingMinor: balance.outstandingMinor, currency: debt.currency },
  });

  if (settled && debt.mode === "SHARED") {
    for (const participant of debt.participants) {
      if (!participant.userId) continue;
      const other = debt.participants.find((candidate) => candidate.role !== participant.role);
      await notify(tx, {
        userId: participant.userId,
        type: "DEBT_SETTLED",
        debtId: debt.id,
        data: {
          concept: debt.concept,
          counterparty: other?.displayName,
          amountMinor: balance.totalOwedMinor.toString(),
          currency: debt.currency,
          role: participant.role,
        },
      });
    }
  }

  return { status: next, balance, change: settled ? "SETTLED" : "REOPENED" };
}
