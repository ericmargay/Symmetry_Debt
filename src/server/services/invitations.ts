import "server-only";
import { toISODate } from "@/domain/dates";
import type { PartyRole, VersionAction } from "@/domain/lifecycle";
import { parseTerms, type TermsSnapshot } from "@/domain/terms";
import { defaultLocale, isLocale } from "@/i18n/config";
import type { Actor } from "../actor";
import { actorDisplayName } from "../actor";
import { recordEvent } from "../audit";
import { prisma } from "../db";
import { appUrl } from "../env";
import { AppError } from "../errors";
import { emailEnabled, sendEmail } from "../mail";
import { renderInvitationEmail } from "../mail/templates";
import { notify } from "../notifications";
import { finalizeIfReady } from "./agreement-core";
import { applyVersionDecision } from "./agreements";
import { maskEmail, resolveInvitationAccess } from "./invitation-access";
import { lockDebt, transaction } from "./shared";

/**
 * Share links.
 *
 * A link lets the person on the other side open a proposal after signing in. What happens next
 * depends on who they turn out to be:
 *
 *   - the invitation names an email and it is their verified address → they are who the
 *     proposer meant, and their acceptance puts the agreement into force;
 *   - anything else (no email on the invitation, or a different account) → they can still read
 *     and answer, but the agreement only comes into force after the proposer confirms that the
 *     person who joined is the right one.
 *
 * Holding the link never exposes more than the proposal itself, and an email address alone
 * never gives access to anything.
 */

export type InvitationState =
  | "open"
  | "expired"
  | "revoked"
  | "used"
  | "declined"
  | "closed" // the agreement is no longer waiting for an answer
  | "own" // the viewer is the person who sent it
  | "member"; // the viewer is already on the agreement

export interface InvitationView {
  state: InvitationState;
  invitationId: string;
  debtId: string;
  /** Role offered to the viewer. */
  role: PartyRole;
  proposer: { name: string; email: string | null; image: string | null };
  /** Present only while the invitation can be answered. */
  proposal: {
    versionId: string;
    versionNumber: number;
    termsHash: string;
    terms: TermsSnapshot;
    changeNote: string | null;
    proposedAt: Date;
    receipts: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
  } | null;
  expiresAt: Date;
  /** How the viewer's identity will be treated if they answer. */
  identity: "matches" | "different_account" | "not_specified";
  /** Masked hint of the address the invitation was sent to, when it is a different account. */
  intendedFor: string | null;
}

/** Everything the invitation page needs — or null when the key means nothing to this viewer. */
export async function getInvitationView(actor: Actor, key: string): Promise<InvitationView | null> {
  const invitation = await resolveInvitationAccess(prisma, actor, key);
  if (!invitation) return null;

  const debt = await prisma.debt.findUnique({
    where: { id: invitation.debtId },
    include: {
      participants: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
      versions: { where: { status: "PROPOSED" } },
      attachments: {
        where: { paymentId: null },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!debt || debt.mode !== "SHARED") return null;

  const proposerParticipant = debt.participants.find((participant) => participant.role !== invitation.role);
  const proposerUser = proposerParticipant?.user ?? null;
  const isMember = debt.participants.some((participant) => participant.userId === actor.id);
  const isProposer = proposerUser?.id === actor.id;
  const version = debt.versions[0] ?? null;

  let state: InvitationState;
  if (isProposer) state = "own";
  else if (isMember) state = "member";
  else if (invitation.status === "REVOKED") state = "revoked";
  else if (invitation.status === "USED") state = "used";
  else if (invitation.status === "DECLINED") state = "declined";
  else if (invitation.expiresAt.getTime() < Date.now()) state = "expired";
  else if (debt.status !== "PENDING_APPROVAL" || !version) state = "closed";
  else state = "open";

  const identity =
    invitation.email === null ? "not_specified" : invitation.email === actor.email.toLowerCase() ? "matches" : "different_account";

  return {
    state,
    invitationId: invitation.id,
    debtId: debt.id,
    role: invitation.role,
    proposer: {
      name: proposerUser?.name?.trim() || proposerParticipant?.displayName || "",
      // Only somebody who can answer needs to know exactly who is asking.
      email: state === "open" ? (proposerUser?.email ?? null) : null,
      image: state === "open" ? (proposerUser?.image ?? null) : null,
    },
    proposal:
      state === "open" && version
        ? {
            versionId: version.id,
            versionNumber: version.number,
            termsHash: version.termsHash,
            terms: parseTerms(version.terms),
            changeNote: version.changeNote,
            proposedAt: version.createdAt,
            receipts: debt.attachments,
          }
        : null,
    expiresAt: invitation.expiresAt,
    identity,
    intendedFor: identity === "different_account" && invitation.email ? maskEmail(invitation.email) : null,
  };
}

export interface InvitationAnswer {
  versionId: string;
  termsHash: string;
  action: Extract<VersionAction, "accept" | "reject" | "request_changes">;
  comment?: string | null;
}

export interface InvitationOutcome {
  /** Where to send the person next. Null when they declined: they are not on the agreement. */
  debtId: string | null;
  /** The agreement came into force with this answer. */
  activated: boolean;
  /** Accepted, but waiting for the proposer to confirm who joined. */
  awaitingIdentity: boolean;
}

/**
 * The invited person answers the proposal.
 *
 * Accepting or asking for changes puts them on the agreement. Declining does not: the proposal
 * is closed and they keep no trace of it.
 */
export async function respondToInvitation(actor: Actor, key: string, answer: InvitationAnswer): Promise<InvitationOutcome> {
  const located = await resolveInvitationAccess(prisma, actor, key);
  if (!located) throw new AppError("invitation_invalid");

  return transaction(async (tx) => {
    await lockDebt(tx, located.debtId);

    const invitation = await tx.invitation.findUniqueOrThrow({ where: { id: located.id } });
    if (invitation.status === "USED") throw new AppError("invitation_used");
    if (invitation.status !== "PENDING") throw new AppError("invitation_invalid");
    if (invitation.expiresAt.getTime() < Date.now()) throw new AppError("invitation_expired");

    const debt = await tx.debt.findUniqueOrThrow({
      where: { id: invitation.debtId },
      include: { participants: true },
    });
    if (debt.mode !== "SHARED" || debt.status !== "PENDING_APPROVAL") throw new AppError("invitation_invalid");

    const seat = debt.participants.find((participant) => participant.role === invitation.role);
    const proposer = debt.participants.find((participant) => participant.role !== invitation.role);
    if (!seat || !proposer?.userId) throw new AppError("invitation_invalid");
    if (proposer.userId === actor.id) throw new AppError("invitation_self");
    if (seat.userId) throw new AppError("invitation_used");

    const now = new Date();
    const context = { debtId: debt.id, role: invitation.role, otherUserId: proposer.userId };

    if (answer.action === "reject") {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "DECLINED", respondedAt: now },
      });
      await applyVersionDecision(tx, actor, context, answer);
      return { debtId: null, activated: false, awaitingIdentity: false };
    }

    // Their verified address is the one the invitation names → they are who the proposer meant.
    const identityMatches = invitation.email !== null && invitation.email === actor.email.toLowerCase();

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "USED", usedById: actor.id, respondedAt: now },
    });
    await tx.debtParticipant.update({
      where: { id: seat.id },
      data: {
        userId: actor.id,
        displayName: actorDisplayName(actor),
        joinedAt: now,
        identityConfirmedAt: identityMatches ? now : null,
      },
    });
    await recordEvent(tx, {
      scope: "SHARED",
      type: "PARTICIPANT_JOINED",
      debtId: debt.id,
      actorId: actor.id,
      actorRole: invitation.role,
      data: { name: actorDisplayName(actor), identityConfirmed: identityMatches },
    });

    if (!identityMatches) {
      await notify(tx, {
        userId: proposer.userId,
        type: "IDENTITY_CONFIRMATION_NEEDED",
        debtId: debt.id,
        data: { actor: actorDisplayName(actor), concept: debt.concept, email: actor.email },
      });
    }

    await applyVersionDecision(tx, actor, context, answer);

    const after = await tx.debt.findUniqueOrThrow({ where: { id: debt.id }, select: { status: true } });
    const activated = after.status === "ACTIVE" || after.status === "SETTLED";
    return {
      debtId: debt.id,
      activated,
      awaitingIdentity: answer.action === "accept" && !activated,
    };
  });
}

/**
 * Emails the share link, in the language the recipient uses if they already have an account
 * and in the inviter's language otherwise. Best effort: the link also works when copied by hand.
 */
export async function sendInvitationEmail(
  actor: Actor,
  input: { invitationId: string; token: string; email: string },
): Promise<boolean> {
  if (!emailEnabled()) return false;
  const base = appUrl();
  if (!base) return false;

  const invitation = await prisma.invitation.findUnique({ where: { id: input.invitationId } });
  if (!invitation || invitation.status !== "PENDING" || invitation.invitedById !== actor.id) return false;

  const recipient = await prisma.user.findUnique({
    where: { email: input.email },
    select: { preferences: { select: { locale: true } } },
  });
  const recipientLocale = recipient?.preferences?.locale;
  const locale = isLocale(recipientLocale) ? recipientLocale : (actor.locale ?? defaultLocale);

  const result = await sendEmail(
    renderInvitationEmail({
      to: input.email,
      locale,
      inviterName: actorDisplayName(actor),
      url: `${base}/invite/${input.token}`,
      expiresAt: invitation.expiresAt,
    }),
  );
  if (!result.sent) return false;

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { lastSentAt: new Date(), sendCount: { increment: 1 } },
  });
  return true;
}

/** Invitations addressed to the actor's verified email that are still waiting for an answer. */
export async function listInvitationsForActor(actor: Pick<Actor, "id" | "email">) {
  const invitations = await prisma.invitation.findMany({
    where: {
      email: actor.email.toLowerCase(),
      status: "PENDING",
      expiresAt: { gt: new Date() },
      debt: { status: "PENDING_APPROVAL", participants: { none: { userId: actor.id } } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      debt: {
        select: {
          participants: { select: { role: true, displayName: true, user: { select: { name: true } } } },
        },
      },
    },
  });

  return invitations.map((invitation) => {
    const proposer = invitation.debt.participants.find((participant) => participant.role !== invitation.role);
    return {
      id: invitation.id,
      role: invitation.role,
      proposerName: proposer?.user?.name?.trim() || proposer?.displayName || "",
      createdAt: invitation.createdAt,
      expiresOn: toISODate(invitation.expiresAt),
    };
  });
}

export { finalizeIfReady };
