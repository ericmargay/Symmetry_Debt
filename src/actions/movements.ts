"use server";

import { runAction } from "@/actions/_run";
import type { MovementAction } from "@/domain/lifecycle";
import type { MovementFormValues, UpdateMovementFormValues } from "@/schemas/debt";
import {
  addComment,
  decideMovement,
  deletePersonalMovement,
  recordMovement,
  updatePersonalMovement,
} from "@/server/services/movements";
import { deleteAttachment } from "@/server/services/attachments";

export async function recordMovementAction(debtId: string, input: MovementFormValues) {
  return runAction((actor) => recordMovement(actor, debtId, input));
}

export async function updateMovementAction(paymentId: string, input: UpdateMovementFormValues) {
  return runAction((actor) => updatePersonalMovement(actor, paymentId, input));
}

export async function deleteMovementAction(paymentId: string) {
  return runAction((actor) => deletePersonalMovement(actor, paymentId));
}

export async function decideMovementAction(paymentId: string, action: MovementAction, comment?: string | null) {
  return runAction((actor) => decideMovement(actor, paymentId, action, comment));
}

export async function addCommentAction(debtId: string, text: string) {
  return runAction((actor) => addComment(actor, debtId, text));
}

export async function deleteAttachmentAction(attachmentId: string) {
  return runAction((actor) => deleteAttachment(actor, attachmentId));
}
