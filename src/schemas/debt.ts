import { z } from "zod";
import { MOVEMENT_KINDS } from "@/domain/balance";
import { MAX_INSTALLMENTS, SCHEDULE_TYPES } from "@/domain/schedule";
import { CONCEPT_MAX, MAX_HISTORICAL_PAYMENTS, NOTES_MAX, SHORT_NOTE_MAX } from "@/domain/terms";
import {
  amountText,
  currencySchema,
  idempotencyKeySchema,
  idSchema,
  isoDateSchema,
  optionalEmail,
  optionalId,
  optionalMethod,
  optionalNote,
  optionalText,
  requiredNote,
  requiredText,
  roleSchema,
} from "./common";
import { contactRefSchema } from "./contact";

/**
 * Amounts travel as text ("1500.50") and are parsed on the server against the debt's currency
 * with the same exact parser the form uses for its preview. Nothing is ever a float.
 */

export const scheduleInputSchema = z.object({
  type: z.enum(SCHEDULE_TYPES),
  installments: z
    .array(z.object({ dueDate: isoDateSchema, amount: amountText }))
    .max(MAX_INSTALLMENTS, "scheduleCount"),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export const previousPaymentSchema = z.object({
  amount: amountText,
  effectiveDate: isoDateSchema,
  method: optionalMethod,
  note: optionalText(SHORT_NOTE_MAX),
});

/** What the terms of any debt are made of, as typed in a form. */
export const termsInputSchema = z.object({
  concept: requiredText(CONCEPT_MAX),
  currency: currencySchema,
  amount: amountText,
  originDate: isoDateSchema,
  schedule: scheduleInputSchema,
  plannedMethod: optionalMethod,
  previousPayments: z.array(previousPaymentSchema).max(MAX_HISTORICAL_PAYMENTS),
});
export type TermsInput = z.infer<typeof termsInputSchema>;

const whoSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  /** Which side the person filling the form is on. */
  myRole: roleSchema,
  counterparty: contactRefSchema,
});

export const createPersonalDebtSchema = whoSchema.extend(termsInputSchema.shape).extend({
  mode: z.literal("PERSONAL"),
  privateNotes: optionalNote(NOTES_MAX),
  /** One of my accounts, where I expect to be paid (only when I am the creditor). */
  receivingAccountId: optionalId,
});

export const createSharedDebtSchema = whoSchema.extend(termsInputSchema.shape).extend({
  mode: z.literal("SHARED"),
  sharedNotes: optionalNote(NOTES_MAX),
  /** Optional: who the link is meant for. Lets their identity be confirmed automatically. */
  inviteEmail: optionalEmail,
  /** One of my accounts to share with the other side for receiving payments (creditor only). */
  shareAccountId: optionalId,
  /** false = keep as a draft, do not create the link yet. */
  send: z.boolean(),
});

export const createDebtSchema = z.discriminatedUnion("mode", [createPersonalDebtSchema, createSharedDebtSchema]);
export type CreateDebtFormValues = z.input<typeof createDebtSchema>;
export type CreatePersonalDebtInput = z.infer<typeof createPersonalDebtSchema>;
export type CreateSharedDebtInput = z.infer<typeof createSharedDebtSchema>;

export const updatePersonalDebtSchema = termsInputSchema.omit({ previousPayments: true }).extend({
  myRole: roleSchema,
  counterparty: contactRefSchema,
  privateNotes: optionalNote(NOTES_MAX),
  receivingAccountId: optionalId,
});
export type UpdatePersonalDebtFormValues = z.input<typeof updatePersonalDebtSchema>;

/** New terms for a shared agreement: a draft being edited, a counter-proposal or an amendment. */
export const proposeTermsSchema = termsInputSchema.extend({
  idempotencyKey: idempotencyKeySchema,
  sharedNotes: optionalNote(NOTES_MAX),
  /** Message to the other side explaining what changes and why. */
  changeNote: optionalNote(1000),
});
export type ProposeTermsFormValues = z.input<typeof proposeTermsSchema>;

export const movementInputSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  kind: z.enum(MOVEMENT_KINDS),
  /** Ignored for reversals, which always undo the whole payment. */
  amount: amountText.optional(),
  effectiveDate: isoDateSchema,
  /** How it was actually paid. */
  method: optionalMethod,
  reference: optionalText(120),
  notes: optionalNote(1000),
  /** Cash: where it was handed over. */
  place: optionalText(160),
  originBank: optionalText(80),
  /** A saved account of whoever receives the money. */
  destinationAccountId: optionalId,
  /** Or a free description of where it was sent. */
  destinationText: optionalText(120),
  /** SPEI tracking key. */
  trackingKey: optionalText(60),
  /** Reversals: the payment being undone. */
  reversesId: optionalId,
});
export type MovementFormValues = z.input<typeof movementInputSchema>;
export type MovementInput = z.infer<typeof movementInputSchema>;

export const updateMovementSchema = movementInputSchema.omit({ idempotencyKey: true, kind: true, reversesId: true });
export type UpdateMovementFormValues = z.input<typeof updateMovementSchema>;

export const commentSchema = z.object({ text: requiredNote(1000) });

export const conversionSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  /**
   * FULL_HISTORY: share the original amount plus the payments selected below.
   * BALANCE_ONLY: share only what is still owed today, with no history.
   */
  history: z.enum(["FULL_HISTORY", "BALANCE_ONLY"]),
  /** Personal payments the owner wants both sides to recognise. */
  paymentIds: z.array(idSchema).max(MAX_HISTORICAL_PAYMENTS),
  /** Personal notes are private; they are only copied when this is ticked. */
  includeNotes: z.boolean(),
  /** Copy the receipts of the selected payments (and of the debt) to the shared agreement. */
  includeReceipts: z.boolean(),
  inviteEmail: optionalEmail,
  shareAccountId: optionalId,
});
export type ConversionFormValues = z.input<typeof conversionSchema>;
