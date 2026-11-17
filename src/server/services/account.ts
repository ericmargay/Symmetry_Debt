import "server-only";
import { toISODate } from "@/domain/dates";
import { preferencesSchema, type PreferencesInput } from "@/schemas/settings";
import type { Actor } from "../actor";
import { recordEvent } from "../audit";
import { decryptField } from "../crypto";
import { prisma } from "../db";
import { AppError } from "../errors";
import { deleteOrphanedFiles } from "./attachments";
import { transaction } from "./shared";
import { parseInput } from "./validation";

export async function getPreferences(actor: Pick<Actor, "id">) {
  return prisma.userPreferences.findUniqueOrThrow({ where: { userId: actor.id } });
}

export async function updatePreferences(actor: Pick<Actor, "id">, input: PreferencesInput): Promise<void> {
  const data = parseInput(preferencesSchema, input);
  await prisma.userPreferences.update({ where: { userId: actor.id }, data });
}

export async function updateLocale(actor: Pick<Actor, "id">, locale: "es" | "en"): Promise<void> {
  await prisma.userPreferences.update({ where: { userId: actor.id }, data: { locale } });
}

/** Signs the user out everywhere (optionally keeping the session they are using right now). */
export async function revokeSessions(actor: Pick<Actor, "id">, keepSessionTokenHash?: string | null): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { userId: actor.id, ...(keepSessionTokenHash ? { sessionToken: { not: keepSessionTokenHash } } : {}) },
  });
  await recordEvent(prisma, { scope: "ACCOUNT", type: "SESSIONS_REVOKED", userId: actor.id, actorId: actor.id, data: { count } });
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data export
// ─────────────────────────────────────────────────────────────────────────────

function safeDecrypt(value: string | null): string | null {
  if (value === null) return null;
  try {
    return decryptField(value);
  } catch {
    return null;
  }
}

/**
 * Everything the app holds about the user, as one JSON document they can keep.
 *
 * For shared agreements it contains the agreement as the user sees it — including the other
 * person's name, which the user already knows — but never the other person's private data
 * (their notes, their contacts, their bank accounts).
 */
export async function exportUserData(actor: Actor) {
  const [user, contacts, bankAccounts, personalDebts, participations, notifications, accountEvents] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: actor.id }, include: { preferences: true } }),
    prisma.contact.findMany({ where: { ownerId: actor.id }, orderBy: { createdAt: "asc" } }),
    prisma.bankAccount.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "asc" } }),
    prisma.debt.findMany({
      where: { mode: "PERSONAL", ownerId: actor.id },
      orderBy: { createdAt: "asc" },
      include: {
        contact: { select: { name: true } },
        installments: { orderBy: { sequence: "asc" } },
        payments: { orderBy: { effectiveDate: "asc" }, include: { bankDetails: true } },
        attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, paymentId: true, createdAt: true } },
        events: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.debtParticipant.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: "asc" },
      include: {
        debt: {
          include: {
            participants: { select: { role: true, displayName: true, userId: true } },
            installments: { orderBy: { sequence: "asc" } },
            payments: { orderBy: { effectiveDate: "asc" }, include: { approvals: true, bankDetails: true } },
            versions: { orderBy: { number: "asc" }, include: { approvals: true } },
            attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, paymentId: true, uploaderId: true, createdAt: true } },
            events: { where: { scope: "SHARED" }, orderBy: { createdAt: "asc" } },
          },
        },
      },
    }),
    prisma.notification.findMany({ where: { userId: actor.id }, orderBy: { createdAt: "asc" } }),
    prisma.auditEvent.findMany({ where: { scope: "ACCOUNT", userId: actor.id }, orderBy: { createdAt: "asc" } }),
  ]);

  const money = (value: bigint) => value.toString();
  const movement = (payment: (typeof personalDebts)[number]["payments"][number]) => ({
    id: payment.id,
    kind: payment.kind,
    status: payment.status,
    origin: payment.origin,
    amountMinor: money(payment.amountMinor),
    effectiveDate: toISODate(payment.effectiveDate),
    recordedAt: payment.recordedAt,
    recordedByRole: payment.recordedByRole,
    method: payment.method,
    reference: payment.reference,
    notes: payment.notes,
    place: payment.place,
    reversesId: payment.reversesId,
    confirmedAt: payment.confirmedAt,
    bank: payment.bankDetails
      ? {
          originBank: payment.bankDetails.originBank,
          destination: payment.bankDetails.destinationLabel,
          trackingKey: payment.bankDetails.trackingKey,
        }
      : null,
  });
  const termsOf = (debt: (typeof personalDebts)[number]) => ({
    concept: debt.concept,
    currency: debt.currency,
    amountMinor: money(debt.principalMinor),
    originDate: toISODate(debt.originDate),
    dueDate: debt.dueDate ? toISODate(debt.dueDate) : null,
    scheduleType: debt.scheduleType,
    plannedMethod: debt.plannedMethod,
    installments: debt.installments.map((installment) => ({
      sequence: installment.sequence,
      dueDate: toISODate(installment.dueDate),
      amountMinor: money(installment.amountMinor),
    })),
  });

  await recordEvent(prisma, { scope: "ACCOUNT", type: "DATA_EXPORTED", userId: actor.id, actorId: actor.id });

  return {
    format: "symmetry-debt-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "Amounts are integers in the minor unit of their currency (cents). Dates without a time are calendar dates.",
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      preferences: user.preferences
        ? {
            locale: user.preferences.locale,
            timeZone: user.preferences.timeZone,
            defaultCurrency: user.preferences.defaultCurrency,
            remindersEnabled: user.preferences.remindersEnabled,
            emailActionRequired: user.preferences.emailActionRequired,
            emailActivity: user.preferences.emailActivity,
            emailReminders: user.preferences.emailReminders,
          }
        : null,
    },
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      notes: contact.notes,
      linkedToRegisteredUser: contact.linkedUserId !== null,
      archivedAt: contact.archivedAt,
      createdAt: contact.createdAt,
    })),
    bankAccounts: bankAccounts.map((account) => ({
      id: account.id,
      alias: account.alias,
      bankName: account.bankName,
      holderName: account.holderName,
      clabe: safeDecrypt(account.clabeEnc),
      accountNumber: safeDecrypt(account.accountNumberEnc),
      currency: account.currency,
      isPreferred: account.isPreferred,
      createdAt: account.createdAt,
    })),
    personalRecords: personalDebts.map((debt) => ({
      id: debt.id,
      kind: "PERSONAL_RECORD — written by you, not confirmed by anybody else",
      status: debt.status,
      myRole: debt.ownerRole,
      counterparty: debt.contact?.name ?? null,
      ...termsOf(debt),
      privateNotes: debt.privateNotes,
      createdAt: debt.createdAt,
      settledAt: debt.settledAt,
      movements: debt.payments.map(movement),
      receipts: debt.attachments,
      history: debt.events.map((event) => ({ type: event.type, at: event.createdAt, data: event.data })),
    })),
    sharedAgreements: participations.map((participation) => {
      const debt = participation.debt;
      const other = debt.participants.find((participant) => participant.role !== participation.role);
      return {
        id: debt.id,
        kind: "SHARED_AGREEMENT — only what both sides accepted is confirmed",
        status: debt.status,
        myRole: participation.role,
        counterparty: other?.displayName ?? null,
        ...termsOf(debt as never),
        sharedNotes: debt.sharedNotes,
        myPrivateNote: participation.privateNote,
        createdAt: debt.createdAt,
        settledAt: debt.settledAt,
        cancelledAt: debt.cancelledAt,
        versions: debt.versions.map((version) => ({
          number: version.number,
          kind: version.kind,
          status: version.status,
          proposedByRole: version.proposedByRole,
          terms: version.terms,
          termsHash: version.termsHash,
          changeNote: version.changeNote,
          createdAt: version.createdAt,
          decidedAt: version.decidedAt,
          answers: version.approvals.map((approval) => ({
            role: approval.role,
            decision: approval.decision,
            comment: approval.comment,
            at: approval.createdAt,
          })),
        })),
        movements: debt.payments.map((payment) => ({
          ...movement(payment as never),
          answers: payment.approvals.map((approval) => ({
            role: approval.role,
            decision: approval.decision,
            comment: approval.comment,
            at: approval.createdAt,
          })),
        })),
        receipts: debt.attachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          sha256: attachment.sha256,
          paymentId: attachment.paymentId,
          uploadedByMe: attachment.uploaderId === actor.id,
          createdAt: attachment.createdAt,
        })),
        history: debt.events
          .filter((event) => {
            const data = event.data as Record<string, unknown> | null;
            return !(data && typeof data.onlyRole === "string" && data.onlyRole !== participation.role);
          })
          .map((event) => ({ type: event.type, at: event.createdAt, byRole: event.actorRole, data: event.data })),
      };
    }),
    notifications: notifications.map((notification) => ({
      type: notification.type,
      category: notification.category,
      data: notification.data,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    })),
    accountHistory: accountEvents.map((event) => ({ type: event.type, at: event.createdAt, data: event.data })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Account deletion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deletes the account.
 *
 *   - Everything that is only the user's is erased: profile, sessions, contacts, bank accounts,
 *     personal records with their receipts, notifications.
 *   - Shared agreements belong to two people. They stay available to the other person, with
 *     the user's name as it appeared there but no longer linked to any account. Agreements
 *     that nobody else is part of are erased too.
 *   - It is refused while an agreement is in force with a balance pending, so nobody can walk
 *     away from an open agreement by deleting their account. Those have to be settled or
 *     cancelled first.
 */
export async function deleteAccount(actor: Actor, confirmationEmail: string): Promise<void> {
  if (confirmationEmail.trim().toLowerCase() !== actor.email.toLowerCase()) {
    throw new AppError("confirmation_mismatch", { fields: { confirmation: "confirmText" } });
  }

  const storageKeys = await transaction(async (tx) => {
    const open = await tx.debt.count({
      where: {
        mode: "SHARED",
        status: { in: ["ACTIVE", "DISPUTED"] },
        participants: { some: { userId: actor.id } },
      },
    });
    if (open > 0) throw new AppError("account_has_active_agreements", { params: { count: open } });

    const keys: string[] = [];

    const personal = await tx.debt.findMany({
      where: { mode: "PERSONAL", ownerId: actor.id },
      select: { id: true, attachments: { select: { storageKey: true } } },
    });
    for (const debt of personal) keys.push(...debt.attachments.map((attachment) => attachment.storageKey));

    // Agreements still being negotiated simply end.
    const negotiating = await tx.debt.findMany({
      where: {
        mode: "SHARED",
        status: { in: ["DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED"] },
        participants: { some: { userId: actor.id } },
      },
      select: { id: true },
    });
    const now = new Date();
    for (const debt of negotiating) {
      await tx.debtVersion.updateMany({ where: { debtId: debt.id, status: "PROPOSED" }, data: { status: "WITHDRAWN", decidedAt: now } });
      await tx.debtVersion.deleteMany({ where: { debtId: debt.id, status: "DRAFT" } });
      await tx.invitation.updateMany({ where: { debtId: debt.id, status: "PENDING" }, data: { status: "REVOKED", respondedAt: now } });
      await tx.debt.update({
        where: { id: debt.id },
        data: { status: "CANCELLED", cancelledAt: now, closedReason: "account_deleted", lockVersion: { increment: 1 } },
      });
      await recordEvent(tx, { scope: "SHARED", type: "DEBT_CANCELLED", debtId: debt.id, data: { reason: "account_deleted" } });
    }

    // Agreements where the other seat is empty (nobody ever joined, or they left too) have no
    // one left to keep them for.
    const lonely = await tx.debt.findMany({
      where: {
        mode: "SHARED",
        participants: { some: { userId: actor.id }, none: { userId: { not: actor.id }, NOT: { userId: null } } },
      },
      select: { id: true, attachments: { select: { storageKey: true } } },
    });
    for (const debt of lonely) keys.push(...debt.attachments.map((attachment) => attachment.storageKey));
    if (lonely.length > 0) await tx.debt.deleteMany({ where: { id: { in: lonely.map((debt) => debt.id) } } });

    // Deleting the user cascades to their personal records, contacts, bank accounts (and the
    // shares of those accounts), sessions, preferences and notifications, and detaches them
    // from the agreements that remain.
    await tx.user.delete({ where: { id: actor.id } });
    return keys;
  });

  await deleteOrphanedFiles(storageKeys);
}
