"use server";

import { runAction } from "@/actions/_run";
import type { VersionAction } from "@/domain/lifecycle";
import type { ProposeTermsFormValues } from "@/schemas/debt";
import {
  answerCancellation,
  confirmCounterpartyIdentity,
  decideVersion,
  discardDraft,
  openDispute,
  proposeVersion,
  regenerateInvitation,
  removeCounterparty,
  requestCancellation,
  resolveDispute,
  sendDraft,
  setPrivateNote,
  updateDraft,
} from "@/server/services/agreements";
import { revokeBankShare, shareBankAccount } from "@/server/services/bank-accounts";
import { respondToInvitation, sendInvitationEmail, type InvitationAnswer } from "@/server/services/invitations";

export interface IssuedLink {
  inviteToken: string | null;
  emailedTo: string | null;
}

export async function updateDraftAction(debtId: string, input: ProposeTermsFormValues) {
  return runAction((actor) => updateDraft(actor, debtId, input));
}

export async function sendDraftAction(debtId: string, inviteEmail: string | null) {
  return runAction<IssuedLink>(
    async (actor) => {
      const created = await sendDraft(actor, debtId, inviteEmail);
      let emailedTo: string | null = null;
      if (created.invitation && created.inviteEmail) {
        const sent = await sendInvitationEmail(actor, { invitationId: created.invitation.id, token: created.invitation.token, email: created.inviteEmail });
        if (sent) emailedTo = created.inviteEmail;
      }
      return { inviteToken: created.invitation?.token ?? null, emailedTo };
    },
    { limit: "invitation" },
  );
}

export async function discardDraftAction(debtId: string) {
  return runAction((actor) => discardDraft(actor, debtId));
}

export async function proposeVersionAction(debtId: string, input: ProposeTermsFormValues) {
  return runAction((actor) => proposeVersion(actor, debtId, input));
}

export async function decideVersionAction(
  debtId: string,
  decision: { versionId: string; termsHash: string; action: VersionAction; comment?: string | null },
) {
  return runAction((actor) => decideVersion(actor, debtId, decision));
}

/** Answer given from the invitation page, by somebody who is not on the agreement yet. */
export async function respondToInvitationAction(key: string, answer: InvitationAnswer) {
  return runAction((actor) => respondToInvitation(actor, key, answer), { limit: "invitationLookup" });
}

export async function confirmIdentityAction(debtId: string) {
  return runAction((actor) => confirmCounterpartyIdentity(actor, debtId));
}

export async function removeCounterpartyAction(debtId: string) {
  return runAction<IssuedLink>(
    async (actor) => {
      const invitation = await removeCounterparty(actor, debtId);
      return { inviteToken: invitation.token, emailedTo: null };
    },
    { limit: "invitation" },
  );
}

/** New share link (the previous one stops working); optionally emailed. */
export async function regenerateInvitationAction(debtId: string, inviteEmail: string | null | undefined, sendEmail: boolean) {
  return runAction<IssuedLink>(
    async (actor) => {
      const { invitation, inviteEmail: email } = await regenerateInvitation(actor, debtId, inviteEmail);
      let emailedTo: string | null = null;
      if (sendEmail && email) {
        const sent = await sendInvitationEmail(actor, { invitationId: invitation.id, token: invitation.token, email });
        if (sent) emailedTo = email;
      }
      return { inviteToken: invitation.token, emailedTo };
    },
    { limit: "invitation" },
  );
}

export async function openDisputeAction(debtId: string, reason: string) {
  return runAction((actor) => openDispute(actor, debtId, reason));
}

export async function resolveDisputeAction(debtId: string, note: string | null) {
  return runAction((actor) => resolveDispute(actor, debtId, note));
}

export async function requestCancellationAction(debtId: string, reason: string) {
  return runAction((actor) => requestCancellation(actor, debtId, reason));
}

export async function answerCancellationAction(debtId: string, answer: "accept" | "decline" | "withdraw") {
  return runAction((actor) => answerCancellation(actor, debtId, answer));
}

export async function setPrivateNoteAction(debtId: string, note: string | null) {
  return runAction((actor) => setPrivateNote(actor, debtId, note));
}

export async function shareBankAccountAction(debtId: string, accountId: string) {
  return runAction((actor) => shareBankAccount(actor, debtId, accountId));
}

export async function revokeBankShareAction(debtId: string, accountId: string) {
  return runAction((actor) => revokeBankShare(actor, debtId, accountId));
}
