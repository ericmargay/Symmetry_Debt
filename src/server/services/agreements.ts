import "server-only";
import { todayInTimeZone } from "@/domain/dates";
import {
  allowedVersionActions,
  hasBeenActivated,
  isNegotiating,
  otherRole,
  type PartyRole,
  type VersionAction,
} from "@/domain/lifecycle";
import { amendmentViolations, parseTerms, type TermsSnapshot } from "@/domain/terms";
import { cleanText } from "@/schemas/common";
import {
  createSharedDebtSchema,
  proposeTermsSchema,
  type CreateDebtFormValues,
  type ProposeTermsFormValues,
} from "@/schemas/debt";
import type { Actor } from "../actor";
import { actorDisplayName } from "../actor";
import { recordEvent } from "../audit";
import { prisma, type Tx } from "../db";
import { AppError } from "../errors";
import { notify } from "../notifications";
import { closeConversion, createInvitation, finalizeIfReady, type NewInvitation } from "./agreement-core";
import { refreshDebtStatus } from "./balances";
import { resolveContact } from "./contacts";
import { debtTermsColumns } from "./personal";
import { isUniqueViolation, lockDebt, requireDebtAccess, transaction, type DebtAccess } from "./shared";
import { assertValidTerms, buildTerms, termsHash } from "./terms-builder";
import { parseInput } from "./validation";

/**
 * Shared agreements.
 *
 * An agreement is a sequence of immutable versions of its terms. One side proposes a version;
 * the other accepts it, rejects it or asks for changes. Only a version that BOTH sides accepted
 * is in force. Changing an agreement that is already in force means proposing a new version,
 * and the previous one keeps governing until the new one is accepted.
 */

export interface CreatedAgreement {
  debtId: string;
  /** The share link for the other side. Null for drafts and when the other side is already linked. */
  invitation: NewInvitation | null;
  /** Where the invitation email should go, if anywhere. */
  inviteEmail: string | null;
}

export interface SharedAgreementSpec {
  idempotencyKey: string;
  myRole: PartyRole;
  /** The proposer's own contact entry for the other side. */
  contact: { id: string; name: string; linkedUserId: string | null };
  terms: TermsSnapshot;
  inviteEmail: string | null;
  shareAccountId: string | null;
  sourceDebtId: string | null;
  send: boolean;
}

/** Creates the agreement, its first version and (when sent) the share link. */
export async function createSharedAgreementTx(tx: Tx, actor: Actor, spec: SharedAgreementSpec): Promise<CreatedAgreement> {
  if (spec.inviteEmail && spec.inviteEmail === actor.email.toLowerCase()) {
    throw new AppError("invitation_self", { fields: { inviteEmail: "selfInvite" } });
  }
  if (spec.contact.linkedUserId === actor.id) throw new AppError("invitation_self");

  // Somebody who already shares an agreement with the proposer (their contact is linked) is
  // put on the other side directly: they will find the proposal waiting in their account.
  const linkedUser = spec.contact.linkedUserId
    ? await tx.user.findUnique({ where: { id: spec.contact.linkedUserId }, select: { id: true, name: true, email: true } })
    : null;

  const debt = await tx.debt.create({
    data: {
      mode: "SHARED",
      status: spec.send ? "PENDING_APPROVAL" : "DRAFT",
      createdById: actor.id,
      sourceDebtId: spec.sourceDebtId,
      sharedNotes: spec.terms.sharedNotes,
      idempotencyKey: spec.idempotencyKey,
      ...debtTermsColumns(spec.terms),
    },
  });

  const now = new Date();
  await tx.debtParticipant.create({
    data: {
      debtId: debt.id,
      role: spec.myRole,
      userId: actor.id,
      displayName: actorDisplayName(actor),
      identityConfirmedAt: now,
      joinedAt: now,
      counterpartyContactId: spec.contact.id,
    },
  });
  await tx.debtParticipant.create({
    data: {
      debtId: debt.id,
      role: otherRole(spec.myRole),
      userId: linkedUser?.id ?? null,
      displayName: linkedUser ? linkedUser.name?.trim() || spec.contact.name : spec.contact.name,
      identityConfirmedAt: linkedUser ? now : null,
      joinedAt: linkedUser ? now : null,
    },
  });

  if (spec.shareAccountId && spec.myRole === "CREDITOR") {
    const account = await tx.bankAccount.findFirst({
      where: { id: spec.shareAccountId, userId: actor.id },
      select: { id: true },
    });
    if (!account) throw new AppError("bank_account_not_found");
    await tx.bankAccountShare.create({ data: { bankAccountId: account.id, debtId: debt.id, sharedById: actor.id } });
  }

  const hash = termsHash(spec.terms);
  const version = await tx.debtVersion.create({
    data: {
      debtId: debt.id,
      number: 1,
      kind: "INITIAL",
      status: spec.send ? "PROPOSED" : "DRAFT",
      proposedByRole: spec.myRole,
      proposedById: actor.id,
      terms: spec.terms,
      termsHash: hash,
    },
  });

  await recordEvent(tx, {
    scope: "SHARED",
    type: "DEBT_CREATED",
    debtId: debt.id,
    actorId: actor.id,
    actorRole: spec.myRole,
    data: {
      concept: spec.terms.concept,
      amountMinor: spec.terms.principalMinor,
      currency: spec.terms.currency,
      role: spec.myRole,
      draft: !spec.send,
      fromPersonalRecord: spec.sourceDebtId !== null,
    },
  });

  if (!spec.send) return { debtId: debt.id, invitation: null, inviteEmail: null };

  const invitation = await sendVersion(tx, actor, {
    debtId: debt.id,
    versionId: version.id,
    versionNumber: 1,
    hash,
    role: spec.myRole,
    concept: spec.terms.concept,
    otherUserId: linkedUser?.id ?? null,
    inviteEmail: spec.inviteEmail,
  });
  return { debtId: debt.id, invitation, inviteEmail: invitation ? spec.inviteEmail : null };
}

/**
 * A version goes out: the proposer's acceptance is recorded (proposing terms IS accepting
 * them) and the other side is told — through a notification if they are already on the
 * agreement, or through a share link if they are not.
 */
async function sendVersion(
  tx: Tx,
  actor: Actor,
  input: {
    debtId: string;
    versionId: string;
    versionNumber: number;
    hash: string;
    role: PartyRole;
    concept: string;
    otherUserId: string | null;
    inviteEmail: string | null;
  },
): Promise<NewInvitation | null> {
  await tx.debtApproval.create({
    data: { versionId: input.versionId, role: input.role, userId: actor.id, decision: "ACCEPTED", termsHash: input.hash },
  });
  await recordEvent(tx, {
    scope: "SHARED",
    type: "VERSION_PROPOSED",
    debtId: input.debtId,
    actorId: actor.id,
    actorRole: input.role,
    versionId: input.versionId,
    data: { version: input.versionNumber },
  });

  if (input.otherUserId) {
    await notify(tx, {
      userId: input.otherUserId,
      type: "PROPOSAL_RECEIVED",
      debtId: input.debtId,
      data: { actor: actorDisplayName(actor), concept: input.concept },
    });
    return null;
  }

  const invitation = await createInvitation(tx, {
    debtId: input.debtId,
    role: otherRole(input.role),
    email: input.inviteEmail,
    invitedById: actor.id,
  });

  // If the address belongs to somebody who already uses the app, the invitation also shows up
  // in their account. They still have to open it and decide; nothing is linked by this.
  if (input.inviteEmail) {
    const recipient = await tx.user.findUnique({ where: { email: input.inviteEmail }, select: { id: true } });
    if (recipient) {
      await notify(tx, {
        userId: recipient.id,
        type: "INVITATION_RECEIVED",
        debtId: null,
        data: { actor: actorDisplayName(actor), invitationId: invitation.id },
      });
    }
  }
  return invitation;
}

export async function createSharedAgreement(actor: Actor, input: CreateDebtFormValues): Promise<CreatedAgreement> {
  const data = parseInput(createSharedDebtSchema, input);
  const terms = buildTerms(data, actor, { sharedNotes: data.sharedNotes });

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
      // A repeated submission: the link was already handed out the first time.
      if (existing) return { debtId: existing.id, invitation: null, inviteEmail: null };

      const contact = await resolveContact(tx, actor, data.counterparty);
      return createSharedAgreementTx(tx, actor, {
        idempotencyKey: data.idempotencyKey,
        myRole: data.myRole,
        contact,
        terms,
        inviteEmail: data.inviteEmail,
        shareAccountId: data.shareAccountId,
        sourceDebtId: null,
        send: data.send,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "idempotencyKey")) {
      const existing = await findExisting();
      if (existing) return { debtId: existing.id, invitation: null, inviteEmail: null };
    }
    throw error;
  }
}

async function loadAgreement(tx: Tx, debtId: string) {
  return tx.debt.findUniqueOrThrow({
    where: { id: debtId },
    include: { versions: { orderBy: { number: "asc" }, include: { approvals: true } } },
  });
}

function requireConfirmedParticipant(access: DebtAccess): asserts access is DebtAccess & { me: NonNullable<DebtAccess["me"]> } {
  if (access.mode !== "SHARED" || !access.me) throw new AppError("not_found");
  if (!access.me.identityConfirmedAt) throw new AppError("identity_unconfirmed");
}

/** Rewrites a draft that has not been sent yet. Only its author can. */
export async function updateDraft(actor: Actor, debtId: string, input: ProposeTermsFormValues): Promise<void> {
  const data = parseInput(proposeTermsSchema, input);
  const terms = buildTerms(data, actor, { sharedNotes: data.sharedNotes });

  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const debt = await loadAgreement(tx, debtId);
    if (debt.status !== "DRAFT" || debt.createdById !== actor.id) throw new AppError("invalid_state");
    const draft = debt.versions.find((version) => version.status === "DRAFT");
    if (!draft) throw new AppError("invalid_state");

    await tx.debtVersion.update({ where: { id: draft.id }, data: { terms, termsHash: termsHash(terms) } });
    await tx.debt.update({
      where: { id: debtId },
      data: { ...debtTermsColumns(terms), sharedNotes: terms.sharedNotes, lockVersion: { increment: 1 } },
    });
  });
}

/** Sends a draft: it becomes a proposal and the share link is created. */
export async function sendDraft(actor: Actor, debtId: string, inviteEmail: string | null): Promise<CreatedAgreement> {
  const email = inviteEmail ? inviteEmail.trim().toLowerCase() : null;
  if (email && email === actor.email.toLowerCase()) {
    throw new AppError("invitation_self", { fields: { inviteEmail: "selfInvite" } });
  }

  return transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const debt = await loadAgreement(tx, debtId);
    if (debt.status !== "DRAFT" || debt.createdById !== actor.id) throw new AppError("invalid_state");
    const draft = debt.versions.find((version) => version.status === "DRAFT");
    if (!draft) throw new AppError("invalid_state");

    const terms = parseTerms(draft.terms);
    assertValidTerms(terms, todayInTimeZone(actor.timeZone));

    await tx.debtVersion.update({ where: { id: draft.id }, data: { status: "PROPOSED" } });
    await tx.debt.update({ where: { id: debtId }, data: { status: "PENDING_APPROVAL", lockVersion: { increment: 1 } } });

    const invitation = await sendVersion(tx, actor, {
      debtId,
      versionId: draft.id,
      versionNumber: draft.number,
      hash: draft.termsHash,
      role: access.role,
      concept: terms.concept,
      otherUserId: access.other?.userId ?? null,
      inviteEmail: email,
    });
    return { debtId, invitation, inviteEmail: invitation ? email : null };
  });
}

/**
 * Proposes new terms.
 *
 *   While negotiating  → a counter-proposal that replaces whatever was on the table.
 *   Once in force      → an amendment. It may change the concept, the schedule, the planned
 *                        method and the notes, but not the amount: amounts only change through
 *                        adjustments that both sides approve.
 */
export async function proposeVersion(actor: Actor, debtId: string, input: ProposeTermsFormValues): Promise<{ versionId: string }> {
  const data = parseInput(proposeTermsSchema, input);

  try {
    return await transaction(async (tx) => {
      await lockDebt(tx, debtId);
      const access = await requireDebtAccess(tx, actor, debtId);
      requireConfirmedParticipant(access);
      const debt = await loadAgreement(tx, debtId);

      const repeated = debt.versions.find((version) => version.idempotencyKey === data.idempotencyKey);
      if (repeated) return { versionId: repeated.id };

      const amending = debt.status === "ACTIVE" || debt.status === "DISPUTED";
      const negotiating = debt.status === "PENDING_APPROVAL" || debt.status === "CHANGES_REQUESTED";
      if (!amending && !negotiating) throw new AppError("invalid_state");

      const current = debt.versions.find((version) => version.id === debt.currentVersionId) ?? null;
      const open = debt.versions.find((version) => version.status === "PROPOSED") ?? null;
      const latest = debt.versions[debt.versions.length - 1];
      const reference = current ?? open ?? latest;
      const referenceTerms = parseTerms(reference.terms);

      let terms: TermsSnapshot;
      if (amending) {
        // Recognised payments and the amount belong to the terms the agreement started with.
        terms = buildTerms({ ...data, previousPayments: [] }, actor, {
          sharedNotes: data.sharedNotes,
          balanceAsOf: referenceTerms.balanceAsOf,
        });
        terms = { ...terms, historicalPayments: referenceTerms.historicalPayments };
        assertValidTerms(terms, todayInTimeZone(actor.timeZone));
        if (amendmentViolations(referenceTerms, terms).length > 0) throw new AppError("terms_locked_fields");
      } else {
        terms = buildTerms(data, actor, { sharedNotes: data.sharedNotes, balanceAsOf: referenceTerms.balanceAsOf });
      }

      const hash = termsHash(terms);
      // Proposing exactly what is already on the table (or already in force) changes nothing.
      if ((open && hash === open.termsHash) || (amending && current && hash === current.termsHash)) {
        throw new AppError("terms_unchanged");
      }

      const now = new Date();
      if (open) {
        await tx.debtVersion.update({ where: { id: open.id }, data: { status: "SUPERSEDED", decidedAt: now } });
      }
      const version = await tx.debtVersion.create({
        data: {
          debtId,
          number: latest.number + 1,
          kind: amending ? "AMENDMENT" : "INITIAL",
          status: "PROPOSED",
          proposedByRole: access.role,
          proposedById: actor.id,
          terms,
          termsHash: hash,
          changeNote: data.changeNote,
          idempotencyKey: data.idempotencyKey,
        },
      });

      if (negotiating) {
        await tx.debt.update({
          where: { id: debtId },
          data: {
            ...debtTermsColumns(terms),
            sharedNotes: terms.sharedNotes,
            status: "PENDING_APPROVAL",
            lockVersion: { increment: 1 },
          },
        });
      } else {
        await tx.debt.update({ where: { id: debtId }, data: { lockVersion: { increment: 1 } } });
      }

      await tx.debtApproval.create({
        data: { versionId: version.id, role: access.role, userId: actor.id, decision: "ACCEPTED", termsHash: hash },
      });
      await recordEvent(tx, {
        scope: "SHARED",
        type: "VERSION_PROPOSED",
        debtId,
        actorId: actor.id,
        actorRole: access.role,
        versionId: version.id,
        data: { version: version.number, amendment: amending, note: data.changeNote },
      });
      if (access.other?.userId) {
        await notify(tx, {
          userId: access.other.userId,
          type: "PROPOSAL_RECEIVED",
          debtId,
          data: { actor: actorDisplayName(actor), concept: terms.concept, comment: data.changeNote ?? undefined },
        });
      }
      return { versionId: version.id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "idempotencyKey")) {
      const existing = await prisma.debtVersion.findUnique({
        where: { debtId_idempotencyKey: { debtId, idempotencyKey: data.idempotencyKey } },
        select: { id: true },
      });
      if (existing) return { versionId: existing.id };
    }
    throw error;
  }
}

export interface VersionDecision {
  versionId: string;
  /** Hash of the terms the person was looking at. Guards against answering stale terms. */
  termsHash: string;
  action: VersionAction;
  comment?: string | null;
}

/**
 * Applies one side's answer to the open proposal. The caller has locked the debt and checked
 * that `role` may answer; this is shared with the invitation flow.
 */
export async function applyVersionDecision(
  tx: Tx,
  actor: Actor,
  context: { debtId: string; role: PartyRole; otherUserId: string | null },
  decision: VersionDecision,
): Promise<void> {
  const comment = cleanText(decision.comment ?? "", true).slice(0, 1000) || null;
  const debt = await loadAgreement(tx, context.debtId);
  const version = debt.versions.find((candidate) => candidate.id === decision.versionId);
  if (!version) throw new AppError("not_found");

  // The terms on the table changed while this person was reading the previous ones.
  if (version.status !== "PROPOSED" || version.termsHash !== decision.termsHash) throw new AppError("stale");

  const allowed = allowedVersionActions(version.status, context.role, version.proposedByRole);
  if (!allowed.includes(decision.action)) {
    throw new AppError(decision.action === "accept" && version.proposedByRole === context.role ? "own_proposal" : "not_your_turn");
  }
  if (decision.action === "request_changes" && !comment) {
    throw new AppError("validation", { fields: { comment: "required" } });
  }

  const terms = parseTerms(version.terms);
  const now = new Date();
  const notifyOther = async (type: "PROPOSAL_ACCEPTED" | "PROPOSAL_REJECTED" | "CHANGES_REQUESTED" | "PROPOSAL_WITHDRAWN") => {
    if (!context.otherUserId) return;
    await notify(tx, {
      userId: context.otherUserId,
      type,
      debtId: context.debtId,
      data: { actor: actorDisplayName(actor), concept: terms.concept, comment: comment ?? undefined },
    });
  };
  const event = (type: "VERSION_ACCEPTED" | "VERSION_REJECTED" | "VERSION_CHANGES_REQUESTED" | "VERSION_WITHDRAWN") =>
    recordEvent(tx, {
      scope: "SHARED",
      type,
      debtId: context.debtId,
      actorId: actor.id,
      actorRole: context.role,
      versionId: version.id,
      data: { version: version.number, comment },
    });

  if (decision.action === "withdraw") {
    await tx.debtVersion.update({ where: { id: version.id }, data: { status: "WITHDRAWN", decidedAt: now } });
    await event("VERSION_WITHDRAWN");
    if (version.kind === "INITIAL") {
      // Nothing was ever agreed: withdrawing the proposal closes the agreement.
      await tx.debt.update({
        where: { id: debt.id },
        data: { status: "CANCELLED", cancelledAt: now, closedReason: "withdrawn", lockVersion: { increment: 1 } },
      });
      await tx.invitation.updateMany({
        where: { debtId: debt.id, status: "PENDING" },
        data: { status: "REVOKED", respondedAt: now },
      });
      await recordEvent(tx, {
        scope: "SHARED",
        type: "DEBT_CANCELLED",
        debtId: debt.id,
        actorId: actor.id,
        actorRole: context.role,
        data: { reason: "withdrawn" },
      });
      await closeConversion(tx, debt, "withdrawn");
    }
    await notifyOther("PROPOSAL_WITHDRAWN");
    return;
  }

  await tx.debtApproval.create({
    data: {
      versionId: version.id,
      role: context.role,
      userId: actor.id,
      decision: decision.action === "accept" ? "ACCEPTED" : decision.action === "reject" ? "REJECTED" : "CHANGES_REQUESTED",
      termsHash: version.termsHash,
      comment,
    },
  });

  if (decision.action === "accept") {
    await event("VERSION_ACCEPTED");
    const inForce = await finalizeIfReady(tx, debt.id, actor);
    // When it did not take effect yet it is because the proposer still has to confirm who
    // joined; they get their own notification for that.
    if (inForce) await notifyOther("PROPOSAL_ACCEPTED");
    return;
  }

  if (decision.action === "reject") {
    await tx.debtVersion.update({ where: { id: version.id }, data: { status: "REJECTED", decidedAt: now } });
    await event("VERSION_REJECTED");
    if (version.kind === "INITIAL") {
      await tx.debt.update({
        where: { id: debt.id },
        data: { status: "CANCELLED", cancelledAt: now, closedReason: "rejected", lockVersion: { increment: 1 } },
      });
      await tx.invitation.updateMany({
        where: { debtId: debt.id, status: "PENDING" },
        data: { status: "REVOKED", respondedAt: now },
      });
      await recordEvent(tx, {
        scope: "SHARED",
        type: "DEBT_CANCELLED",
        debtId: debt.id,
        actorId: actor.id,
        actorRole: context.role,
        data: { reason: "rejected" },
      });
      await closeConversion(tx, debt, "rejected");
    }
    await notifyOther("PROPOSAL_REJECTED");
    return;
  }

  // request_changes
  await tx.debtVersion.update({ where: { id: version.id }, data: { status: "CHANGES_REQUESTED", decidedAt: now } });
  if (version.kind === "INITIAL") {
    await tx.debt.update({ where: { id: debt.id }, data: { status: "CHANGES_REQUESTED", lockVersion: { increment: 1 } } });
  }
  await event("VERSION_CHANGES_REQUESTED");
  await notifyOther("CHANGES_REQUESTED");
}

/** A participant answers the proposal that is on the table. */
export async function decideVersion(actor: Actor, debtId: string, decision: VersionDecision): Promise<void> {
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    if (access.mode !== "SHARED" || !access.me) throw new AppError("not_found");
    await applyVersionDecision(
      tx,
      actor,
      { debtId, role: access.role, otherUserId: access.other?.userId ?? null },
      decision,
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Who is on the other side
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The proposer confirms that whoever joined through the link is the person they meant.
 * Needed only when the invitation did not name that person's verified email address.
 */
export async function confirmCounterpartyIdentity(actor: Actor, debtId: string): Promise<void> {
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const other = access.other;
    if (!other?.userId) throw new AppError("invalid_state");
    if (other.identityConfirmedAt) return;

    await tx.debtParticipant.update({ where: { id: other.id }, data: { identityConfirmedAt: new Date() } });
    await recordEvent(tx, {
      scope: "SHARED",
      type: "IDENTITY_CONFIRMED",
      debtId,
      actorId: actor.id,
      actorRole: access.role,
      data: { name: other.displayName },
    });
    const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId }, select: { concept: true } });
    await notify(tx, {
      userId: other.userId,
      type: "IDENTITY_CONFIRMED",
      debtId,
      data: { actor: actorDisplayName(actor), concept: debt.concept },
    });
    await finalizeIfReady(tx, debtId, actor);
  });
}

/**
 * "This is not the person I meant." Takes whoever joined off the agreement before it comes into
 * force. Their answer is discarded with the version it was given to, and a fresh link is made.
 */
export async function removeCounterparty(actor: Actor, debtId: string): Promise<NewInvitation> {
  return transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const other = access.other;
    const debt = await loadAgreement(tx, debtId);
    if (!other?.userId || other.identityConfirmedAt || !isNegotiating(debt.status) || debt.status === "DRAFT") {
      throw new AppError("invalid_state");
    }

    const removedUserId = other.userId;
    const removedName = other.displayName;
    const removedEmail = other.user?.email ?? null;
    const contact = access.me.counterpartyContactId
      ? await tx.contact.findUnique({ where: { id: access.me.counterpartyContactId }, select: { name: true } })
      : null;

    await tx.debtParticipant.update({
      where: { id: other.id },
      data: { userId: null, joinedAt: null, displayName: contact?.name ?? removedName },
    });

    // Whatever they answered was an answer to the current version: close it and put the same
    // terms back on the table as a new version nobody but the proposer has accepted.
    const now = new Date();
    const latest = debt.versions[debt.versions.length - 1];
    const open = debt.versions.find((version) => version.status === "PROPOSED");
    if (open) await tx.debtVersion.update({ where: { id: open.id }, data: { status: "SUPERSEDED", decidedAt: now } });
    const terms = parseTerms((open ?? latest).terms);
    const hash = termsHash(terms);
    const version = await tx.debtVersion.create({
      data: {
        debtId,
        number: latest.number + 1,
        kind: "INITIAL",
        status: "PROPOSED",
        proposedByRole: access.role,
        proposedById: actor.id,
        terms,
        termsHash: hash,
      },
    });
    await tx.debtApproval.create({
      data: { versionId: version.id, role: access.role, userId: actor.id, decision: "ACCEPTED", termsHash: hash },
    });
    await tx.debt.update({
      where: { id: debtId },
      data: { ...debtTermsColumns(terms), sharedNotes: terms.sharedNotes, status: "PENDING_APPROVAL", lockVersion: { increment: 1 } },
    });

    await recordEvent(tx, {
      scope: "SHARED",
      type: "PARTICIPANT_REMOVED",
      debtId,
      actorId: actor.id,
      actorRole: access.role,
      // Who it was stays between the proposer and the app.
      data: { onlyRole: access.role, name: removedName, email: removedEmail },
    });
    await notify(tx, {
      userId: removedUserId,
      type: "PARTICIPANT_REMOVED",
      debtId: null,
      data: { actor: actorDisplayName(actor), concept: terms.concept },
    });

    const previous = await tx.invitation.findFirst({ where: { debtId }, orderBy: { createdAt: "desc" }, select: { email: true } });
    return createInvitation(tx, { debtId, role: other.role, email: previous?.email ?? null, invitedById: actor.id });
  });
}

/** Makes a new share link (the previous one stops working). */
export async function regenerateInvitation(
  actor: Actor,
  debtId: string,
  inviteEmail: string | null | undefined,
): Promise<{ invitation: NewInvitation; inviteEmail: string | null }> {
  const requested = inviteEmail === undefined ? undefined : inviteEmail ? inviteEmail.trim().toLowerCase() : null;
  if (requested && requested === actor.email.toLowerCase()) {
    throw new AppError("invitation_self", { fields: { inviteEmail: "selfInvite" } });
  }

  return transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId }, select: { status: true, createdById: true } });
    if (debt.status !== "PENDING_APPROVAL" && debt.status !== "CHANGES_REQUESTED") throw new AppError("invalid_state");
    if (access.other?.userId) throw new AppError("invitation_used");

    const previous = await tx.invitation.findFirst({ where: { debtId }, orderBy: { createdAt: "desc" }, select: { email: true } });
    const email = requested === undefined ? (previous?.email ?? null) : requested;
    const invitation = await createInvitation(tx, { debtId, role: otherRole(access.role), email, invitedById: actor.id });
    return { invitation, inviteEmail: email };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Disagreements and endings
// ─────────────────────────────────────────────────────────────────────────────

function requireReason(reason: string | null | undefined): string {
  const text = cleanText(reason ?? "", true).slice(0, 1000);
  if (!text) throw new AppError("validation", { fields: { reason: "required" } });
  return text;
}

/** Flags the agreement as disputed. It stays that way until whoever raised it resolves it. */
export async function openDispute(actor: Actor, debtId: string, reason: string): Promise<void> {
  const text = requireReason(reason);
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    if (access.status !== "ACTIVE") throw new AppError("invalid_state");

    const debt = await tx.debt.update({
      where: { id: debtId },
      data: {
        status: "DISPUTED",
        disputeOpenedByRole: access.role,
        disputeOpenedAt: new Date(),
        disputeReason: text,
        lockVersion: { increment: 1 },
      },
    });
    await recordEvent(tx, {
      scope: "SHARED",
      type: "DISPUTE_OPENED",
      debtId,
      actorId: actor.id,
      actorRole: access.role,
      data: { comment: text },
    });
    if (access.other?.userId) {
      await notify(tx, {
        userId: access.other.userId,
        type: "DISPUTE_OPENED",
        debtId,
        data: { actor: actorDisplayName(actor), concept: debt.concept, comment: text },
      });
    }
  });
}

export async function resolveDispute(actor: Actor, debtId: string, note?: string | null): Promise<void> {
  const text = cleanText(note ?? "", true).slice(0, 1000) || null;
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId } });
    if (debt.status !== "DISPUTED") throw new AppError("invalid_state");
    // Only the side that raised the dispute can say it is settled.
    if (debt.disputeOpenedByRole !== access.role) throw new AppError("not_your_turn");

    await tx.debt.update({
      where: { id: debtId },
      data: {
        status: "ACTIVE",
        disputeOpenedByRole: null,
        disputeOpenedAt: null,
        disputeReason: null,
        lockVersion: { increment: 1 },
      },
    });
    await recordEvent(tx, {
      scope: "SHARED",
      type: "DISPUTE_RESOLVED",
      debtId,
      actorId: actor.id,
      actorRole: access.role,
      data: { comment: text },
    });
    if (access.other?.userId) {
      await notify(tx, {
        userId: access.other.userId,
        type: "DISPUTE_RESOLVED",
        debtId,
        data: { actor: actorDisplayName(actor), concept: debt.concept, comment: text ?? undefined },
      });
    }
    // A balance that reached zero during the dispute settles now.
    await refreshDebtStatus(tx, debtId, actor);
  });
}

/**
 * Ending an agreement.
 *
 *   Before it is in force → either side can simply walk away.
 *   Once in force         → it takes both: one asks, the other agrees.
 */
export async function requestCancellation(actor: Actor, debtId: string, reason: string): Promise<void> {
  const text = requireReason(reason);
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId } });
    const now = new Date();

    if (debt.status === "DRAFT") throw new AppError("invalid_state"); // drafts are discarded, see discardDraft

    if (isNegotiating(debt.status)) {
      await tx.debtVersion.updateMany({ where: { debtId, status: "PROPOSED" }, data: { status: "WITHDRAWN", decidedAt: now } });
      await tx.debt.update({
        where: { id: debtId },
        data: { status: "CANCELLED", cancelledAt: now, closedReason: "cancelled", lockVersion: { increment: 1 } },
      });
      await tx.invitation.updateMany({ where: { debtId, status: "PENDING" }, data: { status: "REVOKED", respondedAt: now } });
      await recordEvent(tx, {
        scope: "SHARED",
        type: "DEBT_CANCELLED",
        debtId,
        actorId: actor.id,
        actorRole: access.role,
        data: { reason: "cancelled", comment: text },
      });
      await closeConversion(tx, debt, "cancelled");
      if (access.other?.userId) {
        await notify(tx, {
          userId: access.other.userId,
          type: "AGREEMENT_CANCELLED",
          debtId,
          data: { actor: actorDisplayName(actor), concept: debt.concept, comment: text },
        });
      }
      return;
    }

    if (debt.status !== "ACTIVE" && debt.status !== "DISPUTED") throw new AppError("invalid_state");
    if (debt.cancelRequestedByRole) throw new AppError("conflict");

    await tx.debt.update({
      where: { id: debtId },
      data: { cancelRequestedByRole: access.role, cancelRequestedAt: now, cancelRequestReason: text, lockVersion: { increment: 1 } },
    });
    await recordEvent(tx, {
      scope: "SHARED",
      type: "CANCELLATION_REQUESTED",
      debtId,
      actorId: actor.id,
      actorRole: access.role,
      data: { comment: text },
    });
    if (access.other?.userId) {
      await notify(tx, {
        userId: access.other.userId,
        type: "CANCELLATION_REQUESTED",
        debtId,
        data: { actor: actorDisplayName(actor), concept: debt.concept, comment: text },
      });
    }
  });
}

/** The other side accepts or declines; whoever asked can take the request back. */
export async function answerCancellation(actor: Actor, debtId: string, answer: "accept" | "decline" | "withdraw"): Promise<void> {
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId } });
    if (!debt.cancelRequestedByRole || (debt.status !== "ACTIVE" && debt.status !== "DISPUTED")) {
      throw new AppError("invalid_state");
    }
    const isRequester = debt.cancelRequestedByRole === access.role;
    if (answer === "withdraw" ? !isRequester : isRequester) throw new AppError("not_your_turn");

    const clear = { cancelRequestedByRole: null, cancelRequestedAt: null, cancelRequestReason: null };
    const now = new Date();

    if (answer === "accept") {
      await tx.debt.update({
        where: { id: debtId },
        data: { ...clear, status: "CANCELLED", cancelledAt: now, closedReason: "mutual", lockVersion: { increment: 1 } },
      });
      await tx.debtVersion.updateMany({ where: { debtId, status: "PROPOSED" }, data: { status: "WITHDRAWN", decidedAt: now } });
      await recordEvent(tx, {
        scope: "SHARED",
        type: "DEBT_CANCELLED",
        debtId,
        actorId: actor.id,
        actorRole: access.role,
        data: { reason: "mutual" },
      });
    } else {
      await tx.debt.update({ where: { id: debtId }, data: { ...clear, lockVersion: { increment: 1 } } });
      await recordEvent(tx, {
        scope: "SHARED",
        type: answer === "decline" ? "CANCELLATION_DECLINED" : "CANCELLATION_WITHDRAWN",
        debtId,
        actorId: actor.id,
        actorRole: access.role,
      });
    }

    if (access.other?.userId && answer !== "withdraw") {
      await notify(tx, {
        userId: access.other.userId,
        type: answer === "accept" ? "AGREEMENT_CANCELLED" : "CANCELLATION_DECLINED",
        debtId,
        data: { actor: actorDisplayName(actor), concept: debt.concept },
      });
    }
  });
}

/** Throws away a draft that was never sent. Nobody else ever saw it, so nothing is kept. */
export async function discardDraft(actor: Actor, debtId: string): Promise<void> {
  await transaction(async (tx) => {
    await lockDebt(tx, debtId);
    const access = await requireDebtAccess(tx, actor, debtId);
    requireConfirmedParticipant(access);
    const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId }, select: { status: true, createdById: true } });
    if (debt.status !== "DRAFT" || debt.createdById !== actor.id) throw new AppError("invalid_state");
    await tx.debt.delete({ where: { id: debtId } });
  });
}

/** Notes on a shared agreement that only their author can read. */
export async function setPrivateNote(actor: Actor, debtId: string, note: string | null): Promise<void> {
  const text = cleanText(note ?? "", true).slice(0, 2000) || null;
  const access = await requireDebtAccess(prisma, actor, debtId);
  if (access.mode !== "SHARED" || !access.me) throw new AppError("not_found");
  await prisma.debtParticipant.update({ where: { id: access.me.id }, data: { privateNote: text } });
}

export { hasBeenActivated };
