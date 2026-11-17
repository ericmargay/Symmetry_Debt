/**
 * Every notification the app can raise, with the category that decides how insistent it is:
 *
 *   ACTION_REQUIRED  somebody is waiting for the reader, or something was refused. Always shown.
 *   ACTIVITY         something happened, nothing to do.
 *   REMINDER         due dates. Can be switched off.
 */
export const NOTIFICATION_CATEGORIES = {
  INVITATION_RECEIVED: "ACTION_REQUIRED",
  PROPOSAL_RECEIVED: "ACTION_REQUIRED",
  CHANGES_REQUESTED: "ACTION_REQUIRED",
  PROPOSAL_REJECTED: "ACTION_REQUIRED",
  IDENTITY_CONFIRMATION_NEEDED: "ACTION_REQUIRED",
  PAYMENT_TO_CONFIRM: "ACTION_REQUIRED",
  PAYMENT_REJECTED: "ACTION_REQUIRED",
  PAYMENT_CLARIFICATION_REQUESTED: "ACTION_REQUIRED",
  PAYMENT_CLARIFIED: "ACTION_REQUIRED",
  CANCELLATION_REQUESTED: "ACTION_REQUIRED",
  DISPUTE_OPENED: "ACTION_REQUIRED",

  PROPOSAL_ACCEPTED: "ACTIVITY",
  PROPOSAL_WITHDRAWN: "ACTIVITY",
  AGREEMENT_ACTIVE: "ACTIVITY",
  AMENDMENT_APPLIED: "ACTIVITY",
  IDENTITY_CONFIRMED: "ACTIVITY",
  PARTICIPANT_REMOVED: "ACTIVITY",
  PAYMENT_CONFIRMED: "ACTIVITY",
  PAYMENT_WITHDRAWN: "ACTIVITY",
  DISPUTE_RESOLVED: "ACTIVITY",
  AGREEMENT_CANCELLED: "ACTIVITY",
  CANCELLATION_DECLINED: "ACTIVITY",
  DEBT_SETTLED: "ACTIVITY",
  COMMENT_ADDED: "ACTIVITY",
  BANK_DETAILS_SHARED: "ACTIVITY",

  INSTALLMENT_DUE_SOON: "REMINDER",
  INSTALLMENT_DUE_TODAY: "REMINDER",
  INSTALLMENT_OVERDUE: "REMINDER",
} as const;

export type NotificationType = keyof typeof NOTIFICATION_CATEGORIES;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[NotificationType];

export const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_CATEGORIES) as NotificationType[];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(NOTIFICATION_CATEGORIES, value);
}

/** What a notification carries. Everything is optional; each type uses what it needs. */
export interface NotificationData {
  /** Who did it. */
  actor?: string;
  /** Concept of the debt. */
  concept?: string;
  /** Name of the other side, as the reader knows them. */
  counterparty?: string;
  amountMinor?: string;
  currency?: string;
  /** Calendar date (ISO) — due date or effective date. */
  date?: string;
  comment?: string;
  /** Email of the person who joined, for the proposer to recognise them. */
  email?: string;
  invitationId?: string;
  paymentId?: string;
  /** Kind of movement, when the wording depends on it. */
  kind?: "PAYMENT" | "ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE" | "REVERSAL";
  /** Which side the READER is on, when the wording depends on it. */
  role?: "DEBTOR" | "CREDITOR";
  days?: number;
}

/** Where a notification takes the reader (app-internal path, without the base path). */
export function notificationHref(type: NotificationType, debtId: string | null, data: NotificationData): string {
  if (type === "INVITATION_RECEIVED" && data.invitationId) return `/invite/${data.invitationId}`;
  if (debtId) return `/app/debts/${debtId}`;
  return "/app/notifications";
}
