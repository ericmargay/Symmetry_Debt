"use server";

import { runAction } from "@/actions/_run";
import type { ConversionFormValues, CreateDebtFormValues, UpdatePersonalDebtFormValues } from "@/schemas/debt";
import { createSharedAgreement } from "@/server/services/agreements";
import { proposeConversion } from "@/server/services/conversion";
import { sendInvitationEmail } from "@/server/services/invitations";
import { createPersonalDebt, deletePersonalDebt, setPersonalDebtCancelled, updatePersonalDebt } from "@/server/services/personal";

export interface CreatedDebt {
  debtId: string;
  /** Secret of the share link, shown once so the person can copy and send it. */
  inviteToken: string | null;
  /** The invitation was also emailed to this address. */
  emailedTo: string | null;
}

export async function createDebtAction(input: CreateDebtFormValues) {
  return runAction<CreatedDebt>(
    async (actor) => {
      if (input.mode === "PERSONAL") {
        const { debtId } = await createPersonalDebt(actor, input);
        return { debtId, inviteToken: null, emailedTo: null };
      }
      const created = await createSharedAgreement(actor, input);
      let emailedTo: string | null = null;
      if (created.invitation && created.inviteEmail) {
        const sent = await sendInvitationEmail(actor, {
          invitationId: created.invitation.id,
          token: created.invitation.token,
          email: created.inviteEmail,
        });
        if (sent) emailedTo = created.inviteEmail;
      }
      return { debtId: created.debtId, inviteToken: created.invitation?.token ?? null, emailedTo };
    },
    { limit: input.mode === "SHARED" ? "invitation" : undefined },
  );
}

export async function updatePersonalDebtAction(debtId: string, input: UpdatePersonalDebtFormValues) {
  return runAction((actor) => updatePersonalDebt(actor, debtId, input));
}

export async function deletePersonalDebtAction(debtId: string) {
  return runAction((actor) => deletePersonalDebt(actor, debtId));
}

export async function setPersonalDebtCancelledAction(debtId: string, cancelled: boolean) {
  return runAction((actor) => setPersonalDebtCancelled(actor, debtId, cancelled));
}

/** "Invitar a confirmar esta deuda": proposes a shared agreement from a personal record. */
export async function proposeConversionAction(debtId: string, input: ConversionFormValues) {
  return runAction<CreatedDebt>(
    async (actor) => {
      const created = await proposeConversion(actor, debtId, input);
      let emailedTo: string | null = null;
      if (created.invitation && created.inviteEmail) {
        const sent = await sendInvitationEmail(actor, {
          invitationId: created.invitation.id,
          token: created.invitation.token,
          email: created.inviteEmail,
        });
        if (sent) emailedTo = created.inviteEmail;
      }
      return { debtId: created.debtId, inviteToken: created.invitation?.token ?? null, emailedTo };
    },
    // The link is shown once, on the page that asked for it: refreshing that page now would
    // redirect away (the record can no longer be converted) before the owner could copy it.
    { limit: "invitation", revalidate: false },
  );
}
