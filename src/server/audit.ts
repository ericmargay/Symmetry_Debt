import "server-only";
import type { PartyRole } from "@/domain/lifecycle";
import type { Db } from "./db";
import { toJson } from "./json";

/**
 * The audit trail. Every meaningful change writes one event, in the same transaction as the
 * change itself. Events are never updated or deleted on their own (a database trigger enforces
 * it); the timeline of a debt is simply its events in order.
 */
export const AUDIT_TYPES = [
  // debts
  "DEBT_CREATED",
  "DEBT_UPDATED",
  "SCHEDULE_UPDATED",
  "DEBT_SETTLED",
  "DEBT_REOPENED",
  "DEBT_CANCELLED",
  // movements
  "PAYMENT_RECORDED",
  "PAYMENT_UPDATED",
  "PAYMENT_DELETED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REJECTED",
  "PAYMENT_CLARIFICATION_REQUESTED",
  "PAYMENT_CLARIFIED",
  "PAYMENT_WITHDRAWN",
  // agreement terms
  "VERSION_PROPOSED",
  "VERSION_ACCEPTED",
  "VERSION_REJECTED",
  "VERSION_CHANGES_REQUESTED",
  "VERSION_WITHDRAWN",
  "AGREEMENT_ACTIVATED",
  "AMENDMENT_APPLIED",
  // people
  "INVITATION_CREATED",
  "INVITATION_REVOKED",
  "PARTICIPANT_JOINED",
  "IDENTITY_CONFIRMED",
  "PARTICIPANT_REMOVED",
  // disagreements
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  "CANCELLATION_REQUESTED",
  "CANCELLATION_DECLINED",
  "CANCELLATION_WITHDRAWN",
  // conversion (written on the personal record)
  "CONVERSION_PROPOSED",
  "CONVERSION_COMPLETED",
  "CONVERSION_CLOSED",
  // misc
  "COMMENT_ADDED",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_REMOVED",
  "BANK_DETAILS_SHARED",
  "BANK_DETAILS_REVOKED",
  // account
  "BANK_ACCOUNT_CREATED",
  "BANK_ACCOUNT_UPDATED",
  "BANK_ACCOUNT_ARCHIVED",
  "DATA_EXPORTED",
  "SESSIONS_REVOKED",
] as const;

export type AuditType = (typeof AUDIT_TYPES)[number];

export interface AuditInput {
  scope: "PERSONAL" | "SHARED" | "ACCOUNT";
  type: AuditType;
  debtId?: string | null;
  /** Owner of an ACCOUNT-scoped event. */
  userId?: string | null;
  actorId?: string | null;
  actorRole?: PartyRole | null;
  paymentId?: string | null;
  versionId?: string | null;
  data?: Record<string, unknown>;
}

export async function recordEvent(db: Db, event: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      scope: event.scope,
      type: event.type,
      debtId: event.debtId ?? null,
      userId: event.userId ?? null,
      actorId: event.actorId ?? null,
      actorRole: event.actorRole ?? null,
      paymentId: event.paymentId ?? null,
      versionId: event.versionId ?? null,
      data: event.data ? toJson(event.data) : undefined,
    },
  });
}
