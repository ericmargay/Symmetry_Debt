import "server-only";
import { fromISODate } from "@/domain/dates";
import { otherRole, type PartyRole } from "@/domain/lifecycle";
import { minorFromString } from "@/domain/money";
import { openingBalanceMinor, parseTerms, type TermsSnapshot } from "@/domain/terms";
import type { Actor } from "../actor";
import { recordEvent } from "../audit";
import { randomToken, sha256Hex } from "../crypto";
import type { Tx } from "../db";
import { env } from "../env";
import { notify } from "../notifications";
import { refreshDebtStatus } from "./balances";
import { debtTermsColumns, replaceInstallments } from "./personal";

/**
 * Internals shared by the agreement and invitation services. Everything here assumes the
 * caller already holds the row lock of the debt.
 */

export interface NewInvitation {
  id: string;
  /** The secret that goes in the share link. It is returned once and never stored. */
  token: string;
  expiresAt: Date;
}

/** Creates the share link for the other side, replacing any link that was still live. */
export async function createInvitation(
  tx: Tx,
  input: { debtId: string; role: PartyRole; email: string | null; invitedById: string },
): Promise<NewInvitation> {
  await tx.invitation.updateMany({
    where: { debtId: input.debtId, status: "PENDING" },
    data: { status: "REVOKED", respondedAt: new Date() },
  });

  const token = randomToken();
  const expiresAt = new Date(Date.now() + env().INVITATION_TTL_DAYS * 24 * 3600 * 1000);
  const invitation = await tx.invitation.create({
    data: {
      debtId: input.debtId,
      tokenHash: sha256Hex(token),
      role: input.role,
      email: input.email,
      invitedById: input.invitedById,
      expiresAt,
    },
  });
  await recordEvent(tx, {
    scope: "SHARED",
    type: "INVITATION_CREATED",
    debtId: input.debtId,
    actorId: input.invitedById,
    actorRole: otherRole(input.role),
    // Who the link was meant for is the inviter's business only.
    data: { onlyRole: otherRole(input.role), hasEmail: input.email !== null },
  });
  return { id: invitation.id, token, expiresAt };
}

/**
 * Links the two participants' address books now that they share an agreement: each side's
 * contact for the other points at the other's account. This is the ONLY place where a contact
 * becomes linked to a registered user.
 */
async function linkContacts(tx: Tx, debtId: string): Promise<void> {
  const participants = await tx.debtParticipant.findMany({
    where: { debtId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  for (const participant of participants) {
    const other = participants.find((candidate) => candidate.role !== participant.role);
    if (!participant.userId || !other?.userId || !other.user) continue;

    // Already have a contact linked to this person? Use it.
    let contact = await tx.contact.findFirst({ where: { ownerId: participant.userId, linkedUserId: other.userId } });

    if (!contact && participant.counterpartyContactId) {
      const chosen = await tx.contact.findFirst({
        where: { id: participant.counterpartyContactId, ownerId: participant.userId },
      });
      // The contact picked when proposing becomes the linked one, unless it already points at
      // somebody else.
      if (chosen && chosen.linkedUserId === null) {
        contact = await tx.contact.update({
          where: { id: chosen.id },
          data: { linkedUserId: other.userId, linkedAt: new Date(), archivedAt: null },
        });
      }
    }

    if (!contact) {
      contact = await tx.contact.create({
        data: {
          ownerId: participant.userId,
          name: other.user.name?.trim() || other.displayName,
          email: other.user.email,
          linkedUserId: other.userId,
          linkedAt: new Date(),
        },
      });
    }

    if (participant.counterpartyContactId !== contact.id) {
      await tx.debtParticipant.update({ where: { id: participant.id }, data: { counterpartyContactId: contact.id } });
    }
  }
}

/** Marks the personal record an agreement came from as converted (read-only archive). */
async function completeConversion(tx: Tx, debt: { id: string; sourceDebtId: string | null }, actor: Pick<Actor, "id"> | null) {
  if (!debt.sourceDebtId) return;
  const source = await tx.debt.findUnique({
    where: { id: debt.sourceDebtId },
    select: { id: true, mode: true, status: true },
  });
  if (!source || source.mode !== "PERSONAL") return;
  if (source.status !== "ACTIVE" && source.status !== "SETTLED") return;

  await tx.debt.update({
    where: { id: source.id },
    data: { status: "CONVERTED", lockVersion: { increment: 1 } },
  });
  await recordEvent(tx, {
    scope: "PERSONAL",
    type: "CONVERSION_COMPLETED",
    debtId: source.id,
    actorId: actor?.id ?? null,
    data: { sharedDebtId: debt.id },
  });
}

/** Tells the personal record that the proposal made from it did not go through. */
export async function closeConversion(
  tx: Tx,
  debt: { id: string; sourceDebtId: string | null },
  reason: "rejected" | "withdrawn" | "cancelled",
): Promise<void> {
  if (!debt.sourceDebtId) return;
  const source = await tx.debt.findUnique({ where: { id: debt.sourceDebtId }, select: { id: true, mode: true } });
  if (!source || source.mode !== "PERSONAL") return;
  await recordEvent(tx, {
    scope: "PERSONAL",
    type: "CONVERSION_CLOSED",
    debtId: source.id,
    data: { sharedDebtId: debt.id, reason },
  });
}

async function notifyBoth(
  tx: Tx,
  debtId: string,
  type: "AGREEMENT_ACTIVE" | "AMENDMENT_APPLIED",
  concept: string,
): Promise<void> {
  const participants = await tx.debtParticipant.findMany({ where: { debtId } });
  for (const participant of participants) {
    if (!participant.userId) continue;
    const other = participants.find((candidate) => candidate.role !== participant.role);
    await notify(tx, {
      userId: participant.userId,
      type,
      debtId,
      data: { concept, counterparty: other?.displayName, role: participant.role },
    });
  }
}

/**
 * Puts the open proposal into force if — and only if — both sides have accepted that exact
 * version and both are who they are supposed to be.
 *
 * This is the single place where anything becomes "confirmed by both sides".
 */
export async function finalizeIfReady(tx: Tx, debtId: string, actor: Pick<Actor, "id"> | null): Promise<boolean> {
  const debt = await tx.debt.findUniqueOrThrow({
    where: { id: debtId },
    include: {
      participants: true,
      versions: { where: { status: "PROPOSED" }, include: { approvals: true } },
    },
  });
  const version = debt.versions[0];
  if (!version) return false;

  const accepted = (role: PartyRole) =>
    version.approvals.some(
      (approval) => approval.role === role && approval.decision === "ACCEPTED" && approval.termsHash === version.termsHash,
    );
  if (!accepted("DEBTOR") || !accepted("CREDITOR")) return false;
  if (debt.participants.length !== 2) return false;
  if (debt.participants.some((participant) => !participant.userId || !participant.identityConfirmedAt)) return false;

  const terms: TermsSnapshot = parseTerms(version.terms);
  const now = new Date();

  if (version.kind === "INITIAL") {
    if (debt.status !== "PENDING_APPROVAL") return false;

    await tx.debtVersion.update({ where: { id: version.id }, data: { status: "ACCEPTED", decidedAt: now } });
    await tx.debt.update({
      where: { id: debt.id },
      data: {
        ...debtTermsColumns(terms),
        sharedNotes: terms.sharedNotes,
        status: "ACTIVE",
        currentVersionId: version.id,
        lockVersion: { increment: 1 },
      },
    });
    await replaceInstallments(tx, debt.id, terms);

    // Earlier payments both sides recognised by accepting these terms. They are confirmed
    // because both accepted this version — not because one side had them written down.
    for (const payment of terms.historicalPayments) {
      await tx.payment.create({
        data: {
          debtId: debt.id,
          kind: "PAYMENT",
          status: "CONFIRMED",
          origin: "HISTORICAL",
          amountMinor: minorFromString(payment.amountMinor),
          effectiveDate: fromISODate(payment.effectiveDate),
          method: payment.method,
          notes: payment.note,
          versionId: version.id,
          recordedById: version.proposedById,
          recordedByRole: version.proposedByRole,
          confirmedAt: now,
          decidedAt: now,
        },
      });
    }

    await linkContacts(tx, debt.id);
    await completeConversion(tx, debt, actor);

    await recordEvent(tx, {
      scope: "SHARED",
      type: "AGREEMENT_ACTIVATED",
      debtId: debt.id,
      actorId: actor?.id ?? null,
      versionId: version.id,
      data: {
        version: version.number,
        amountMinor: terms.principalMinor,
        currency: terms.currency,
        openingBalanceMinor: openingBalanceMinor(terms),
        historicalPayments: terms.historicalPayments.length,
      },
    });
    await notifyBoth(tx, debt.id, "AGREEMENT_ACTIVE", terms.concept);
    await refreshDebtStatus(tx, debt.id, actor);
    return true;
  }

  // AMENDMENT of an agreement that is already in force.
  if (debt.status !== "ACTIVE" && debt.status !== "DISPUTED") return false;

  if (debt.currentVersionId) {
    await tx.debtVersion.update({
      where: { id: debt.currentVersionId },
      data: { status: "SUPERSEDED", decidedAt: now },
    });
  }
  await tx.debtVersion.update({ where: { id: version.id }, data: { status: "ACCEPTED", decidedAt: now } });
  await tx.debt.update({
    where: { id: debt.id },
    data: {
      concept: terms.concept,
      dueDate: terms.dueDate ? fromISODate(terms.dueDate) : null,
      scheduleType: terms.scheduleType,
      plannedMethod: terms.plannedMethod,
      sharedNotes: terms.sharedNotes,
      currentVersionId: version.id,
      lockVersion: { increment: 1 },
    },
  });
  await replaceInstallments(tx, debt.id, terms);
  await recordEvent(tx, {
    scope: "SHARED",
    type: "AMENDMENT_APPLIED",
    debtId: debt.id,
    actorId: actor?.id ?? null,
    versionId: version.id,
    data: { version: version.number },
  });
  await notifyBoth(tx, debt.id, "AMENDMENT_APPLIED", terms.concept);
  return true;
}
