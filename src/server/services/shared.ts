import "server-only";
import type { DebtMode } from "@/domain/balance";
import { toISODate, type ISODate } from "@/domain/dates";
import { otherRole, type DebtStatus, type PartyRole } from "@/domain/lifecycle";
import { Prisma } from "@/generated/prisma/client";
import type { Actor } from "../actor";
import { prisma, type Db, type Tx } from "../db";
import { AppError } from "../errors";

/**
 * Serialises every change to one debt. All services take this row lock first and only then
 * read the state they are about to change, so two requests can never both act on stale data
 * (double approvals, two payments overshooting the balance, racing proposals…).
 */
export async function lockDebt(tx: Tx, debtId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Debt" WHERE "id" = ${debtId} FOR UPDATE`;
  if (rows.length === 0) throw new AppError("not_found");
}

/** Runs `work` in a transaction with sensible limits. */
export function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(work, { maxWait: 10_000, timeout: 20_000 });
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!constraint) return true;
  const target = (error.meta as { target?: unknown; constraint?: unknown } | undefined) ?? {};
  return JSON.stringify(target).includes(constraint);
}

export function dateOrNull(value: Date | null | undefined): ISODate | null {
  return value ? toISODate(value) : null;
}

export const participantInclude = {
  user: { select: { id: true, name: true, email: true, image: true } },
} as const;

export type ParticipantRow = Prisma.DebtParticipantGetPayload<{ include: typeof participantInclude }>;

export interface DebtAccess {
  mode: DebtMode;
  status: DebtStatus;
  /** Which side the actor is on. */
  role: PartyRole;
  /** Shared agreements only. */
  me: ParticipantRow | null;
  other: ParticipantRow | null;
}

/**
 * The one authorisation rule for debts:
 *
 *   PERSONAL → only its owner.
 *   SHARED   → only its two participants.
 *
 * Anything else is reported as "not found", so the existence of a record is never revealed
 * to somebody who may not see it.
 */
export async function requireDebtAccess(db: Db, actor: Pick<Actor, "id">, debtId: string): Promise<DebtAccess> {
  const debt = await db.debt.findUnique({
    where: { id: debtId },
    select: {
      mode: true,
      status: true,
      ownerId: true,
      ownerRole: true,
      participants: { include: participantInclude },
    },
  });
  if (!debt) throw new AppError("not_found");

  if (debt.mode === "PERSONAL") {
    if (debt.ownerId !== actor.id || !debt.ownerRole) throw new AppError("not_found");
    return { mode: "PERSONAL", status: debt.status, role: debt.ownerRole, me: null, other: null };
  }

  const me = debt.participants.find((participant) => participant.userId === actor.id);
  if (!me) throw new AppError("not_found");
  const other = debt.participants.find((participant) => participant.role === otherRole(me.role)) ?? null;
  return { mode: "SHARED", status: debt.status, role: me.role, me, other };
}

/** Bumps the optimistic-concurrency counter; call once per state-changing transaction. */
export async function touchDebt(tx: Tx, debtId: string, data: Prisma.DebtUncheckedUpdateInput = {}): Promise<void> {
  await tx.debt.update({ where: { id: debtId }, data: { ...data, lockVersion: { increment: 1 } } });
}

export function displayName(user: { name: string | null; email: string } | null | undefined, fallback: string): string {
  if (!user) return fallback;
  return user.name?.trim() || user.email.split("@")[0];
}
