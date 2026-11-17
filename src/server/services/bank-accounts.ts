import "server-only";
import { hasBeenActivated } from "@/domain/lifecycle";
import { bankAccountInputSchema, type BankAccountFormValues } from "@/schemas/bank-account";
import type { Actor } from "../actor";
import { actorDisplayName } from "../actor";
import { recordEvent } from "../audit";
import { decryptField, encryptField, EncryptionKeyError } from "../crypto";
import { prisma, type Db } from "../db";
import { AppError } from "../errors";
import { notify } from "../notifications";
import { lockDebt, requireDebtAccess, transaction } from "./shared";
import { parseInput } from "./validation";

/**
 * Bank accounts where a user can receive money.
 *
 * They are private: nobody else can see them unless the owner explicitly shares one with the
 * other participant of a specific agreement (BankAccountShare). CLABE and account number are
 * encrypted at rest; lists only ever show the last four digits.
 */

export interface BankAccountSummary {
  id: string;
  alias: string;
  bankName: string;
  holderName: string;
  clabeLast4: string | null;
  accountLast4: string | null;
  currency: string;
  isPreferred: boolean;
  sharedInAgreements: number;
}

export interface BankAccountNumbers {
  clabe: string | null;
  accountNumber: string | null;
}

/** What the other side of an agreement gets to see: enough to make a transfer, nothing else. */
export interface SharedBankDetails extends BankAccountNumbers {
  accountId: string;
  bankName: string;
  holderName: string;
  currency: string;
}

function encrypt(value: string | null): string | null {
  if (value === null) return null;
  try {
    return encryptField(value);
  } catch (error) {
    if (error instanceof EncryptionKeyError) throw new AppError("encryption_unavailable", { cause: error });
    throw error;
  }
}

function decrypt(value: string | null): string | null {
  if (value === null) return null;
  try {
    return decryptField(value);
  } catch (error) {
    if (error instanceof EncryptionKeyError) throw new AppError("encryption_unavailable", { cause: error });
    throw error;
  }
}

function last4(value: string | null): string | null {
  return value === null ? null : value.slice(-4);
}

/** "BBVA México •••• 9719" — safe to keep in history after the account itself is gone. */
export function maskedLabel(account: { bankName: string; clabeLast4: string | null; accountLast4: string | null }): string {
  const digits = account.clabeLast4 ?? account.accountLast4;
  return digits ? `${account.bankName} •••• ${digits}` : account.bankName;
}

export async function listBankAccounts(actor: Pick<Actor, "id">): Promise<BankAccountSummary[]> {
  const accounts = await prisma.bankAccount.findMany({
    where: { userId: actor.id },
    orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { shares: { where: { revokedAt: null } } } } },
  });
  return accounts.map((account) => ({
    id: account.id,
    alias: account.alias,
    bankName: account.bankName,
    holderName: account.holderName,
    clabeLast4: account.clabeLast4,
    accountLast4: account.accountLast4,
    currency: account.currency,
    isPreferred: account.isPreferred,
    sharedInAgreements: account._count.shares,
  }));
}

/** The full numbers, for the owner only (to copy them or to edit the account). */
export async function revealBankAccount(actor: Pick<Actor, "id">, accountId: string): Promise<BankAccountNumbers> {
  const account = await prisma.bankAccount.findFirst({ where: { id: accountId, userId: actor.id } });
  if (!account) throw new AppError("bank_account_not_found");
  return { clabe: decrypt(account.clabeEnc), accountNumber: decrypt(account.accountNumberEnc) };
}

export async function createBankAccount(actor: Actor, input: BankAccountFormValues): Promise<string> {
  const data = parseInput(bankAccountInputSchema, input);
  return transaction(async (tx) => {
    const existing = await tx.bankAccount.count({ where: { userId: actor.id } });
    const preferred = data.isPreferred || existing === 0;
    if (preferred) {
      await tx.bankAccount.updateMany({ where: { userId: actor.id, isPreferred: true }, data: { isPreferred: false } });
    }
    const account = await tx.bankAccount.create({
      data: {
        userId: actor.id,
        alias: data.alias,
        bankName: data.bankName,
        holderName: data.holderName,
        clabeEnc: encrypt(data.clabe),
        clabeLast4: last4(data.clabe),
        accountNumberEnc: encrypt(data.accountNumber),
        accountLast4: last4(data.accountNumber),
        currency: data.currency,
        isPreferred: preferred,
      },
    });
    await recordEvent(tx, {
      scope: "ACCOUNT",
      type: "BANK_ACCOUNT_CREATED",
      userId: actor.id,
      actorId: actor.id,
      data: { label: maskedLabel(account) },
    });
    return account.id;
  });
}

export async function updateBankAccount(actor: Actor, accountId: string, input: BankAccountFormValues): Promise<void> {
  const data = parseInput(bankAccountInputSchema, input);
  await transaction(async (tx) => {
    const account = await tx.bankAccount.findFirst({ where: { id: accountId, userId: actor.id } });
    if (!account) throw new AppError("bank_account_not_found");
    if (data.isPreferred && !account.isPreferred) {
      await tx.bankAccount.updateMany({ where: { userId: actor.id, isPreferred: true }, data: { isPreferred: false } });
    }
    const updated = await tx.bankAccount.update({
      where: { id: account.id },
      data: {
        alias: data.alias,
        bankName: data.bankName,
        holderName: data.holderName,
        clabeEnc: encrypt(data.clabe),
        clabeLast4: last4(data.clabe),
        accountNumberEnc: encrypt(data.accountNumber),
        accountLast4: last4(data.accountNumber),
        currency: data.currency,
        isPreferred: data.isPreferred || account.isPreferred,
      },
    });
    await recordEvent(tx, {
      scope: "ACCOUNT",
      type: "BANK_ACCOUNT_UPDATED",
      userId: actor.id,
      actorId: actor.id,
      data: { label: maskedLabel(updated) },
    });
  });
}

export async function setPreferredBankAccount(actor: Actor, accountId: string): Promise<void> {
  await transaction(async (tx) => {
    const account = await tx.bankAccount.findFirst({ where: { id: accountId, userId: actor.id } });
    if (!account) throw new AppError("bank_account_not_found");
    await tx.bankAccount.updateMany({ where: { userId: actor.id, isPreferred: true }, data: { isPreferred: false } });
    await tx.bankAccount.update({ where: { id: account.id }, data: { isPreferred: true } });
  });
}

/**
 * Deletes the account for good. Whoever it was shared with loses access immediately; payments
 * that mention it keep only the masked label they were recorded with.
 */
export async function deleteBankAccount(actor: Actor, accountId: string): Promise<void> {
  await transaction(async (tx) => {
    const account = await tx.bankAccount.findFirst({ where: { id: accountId, userId: actor.id } });
    if (!account) throw new AppError("bank_account_not_found");
    await tx.bankAccount.delete({ where: { id: account.id } });
    if (account.isPreferred) {
      const next = await tx.bankAccount.findFirst({ where: { userId: actor.id }, orderBy: { createdAt: "asc" } });
      if (next) await tx.bankAccount.update({ where: { id: next.id }, data: { isPreferred: true } });
    }
    await recordEvent(tx, {
      scope: "ACCOUNT",
      type: "BANK_ACCOUNT_ARCHIVED",
      userId: actor.id,
      actorId: actor.id,
      data: { label: maskedLabel(account) },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sharing with the other side of an agreement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The creditor explicitly allows the debtor of ONE agreement to see the details needed to pay
 * into one of the creditor's accounts.
 */
export async function shareBankAccount(actor: Actor, debtId: string, accountId: string): Promise<void> {
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    if (access.mode !== "SHARED" || access.role !== "CREDITOR") throw new AppError("forbidden");
    if (access.status === "CANCELLED") throw new AppError("invalid_state");

    const account = await tx.bankAccount.findFirst({ where: { id: accountId, userId: actor.id } });
    if (!account) throw new AppError("bank_account_not_found");

    await tx.bankAccountShare.upsert({
      where: { bankAccountId_debtId: { bankAccountId: account.id, debtId } },
      update: { revokedAt: null, sharedById: actor.id },
      create: { bankAccountId: account.id, debtId, sharedById: actor.id },
    });
    await recordEvent(tx, {
      scope: "SHARED",
      type: "BANK_DETAILS_SHARED",
      debtId,
      actorId: actor.id,
      actorRole: "CREDITOR",
      data: { label: maskedLabel(account) },
    });

    if (access.other?.userId && access.other.identityConfirmedAt && hasBeenActivated(access.status)) {
      const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId }, select: { concept: true } });
      await notify(tx, {
        userId: access.other.userId,
        type: "BANK_DETAILS_SHARED",
        debtId,
        data: { actor: actorDisplayName(actor), concept: debt.concept },
      });
    }
  });
}

export async function revokeBankShare(actor: Actor, debtId: string, accountId: string): Promise<void> {
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    if (access.mode !== "SHARED") throw new AppError("forbidden");

    const share = await tx.bankAccountShare.findFirst({
      where: { debtId, bankAccountId: accountId, revokedAt: null, bankAccount: { userId: actor.id } },
      include: { bankAccount: true },
    });
    if (!share) throw new AppError("bank_account_not_found");

    await tx.bankAccountShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
    await recordEvent(tx, {
      scope: "SHARED",
      type: "BANK_DETAILS_REVOKED",
      debtId,
      actorId: actor.id,
      actorRole: access.role,
      data: { label: maskedLabel(share.bankAccount) },
    });
  });
}

/**
 * Bank details the actor may see for a debt because the other side shared them.
 * Empty unless the agreement is in force and the actor is a confirmed participant.
 */
export async function sharedBankDetailsFor(db: Db, actor: Pick<Actor, "id">, debtId: string): Promise<SharedBankDetails[]> {
  const access = await requireDebtAccess(db, actor, debtId);
  if (access.mode !== "SHARED" || !access.me?.identityConfirmedAt || !hasBeenActivated(access.status)) return [];

  const shares = await db.bankAccountShare.findMany({
    where: { debtId, revokedAt: null, bankAccount: { userId: { not: actor.id } } },
    include: { bankAccount: true },
    orderBy: { createdAt: "asc" },
  });

  return shares.map(({ bankAccount }) => ({
    accountId: bankAccount.id,
    bankName: bankAccount.bankName,
    holderName: bankAccount.holderName,
    currency: bankAccount.currency,
    clabe: decrypt(bankAccount.clabeEnc),
    accountNumber: decrypt(bankAccount.accountNumberEnc),
  }));
}

/** Accounts of the actor that are currently shared in a debt. */
export async function mySharesFor(db: Db, actor: Pick<Actor, "id">, debtId: string) {
  const shares = await db.bankAccountShare.findMany({
    where: { debtId, revokedAt: null, bankAccount: { userId: actor.id } },
    include: { bankAccount: true },
    orderBy: { createdAt: "asc" },
  });
  return shares.map(({ bankAccount }) => ({
    accountId: bankAccount.id,
    alias: bankAccount.alias,
    label: maskedLabel(bankAccount),
  }));
}
