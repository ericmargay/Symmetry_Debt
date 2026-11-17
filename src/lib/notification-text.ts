import { formatISODate, isISODate } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import type { NotificationData } from "./notification-types";

/**
 * Turns the data stored with a notification into the values its message expects.
 * Every placeholder always gets a value, so a message can use any of them safely.
 */
export function notificationParams(data: NotificationData, locale: Locale): Record<string, string | number> {
  const intlLocale = intlLocales[locale];
  let amount = "";
  if (data.amountMinor && data.currency && /^-?[0-9]+$/.test(data.amountMinor)) {
    amount = formatMoney(BigInt(data.amountMinor), data.currency, intlLocale);
  }
  return {
    actor: data.actor ?? "",
    concept: data.concept ?? "",
    counterparty: data.counterparty ?? "",
    amount,
    date: data.date && isISODate(data.date) ? formatISODate(data.date, intlLocale) : "",
    comment: data.comment ?? "",
    email: data.email ?? "",
    role: data.role ?? "DEBTOR",
    kind: data.kind ?? "PAYMENT",
    days: data.days ?? 0,
  };
}

/** Reads the JSON stored in the database as notification data, ignoring anything unexpected. */
export function readNotificationData(value: unknown): NotificationData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const text = (key: string) => (typeof source[key] === "string" ? (source[key] as string) : undefined);
  return {
    actor: text("actor"),
    concept: text("concept"),
    counterparty: text("counterparty"),
    amountMinor: text("amountMinor"),
    currency: text("currency"),
    date: text("date"),
    comment: text("comment"),
    email: text("email"),
    invitationId: text("invitationId"),
    paymentId: text("paymentId"),
    role: source.role === "DEBTOR" || source.role === "CREDITOR" ? source.role : undefined,
    kind:
      source.kind === "PAYMENT" ||
      source.kind === "ADJUSTMENT_INCREASE" ||
      source.kind === "ADJUSTMENT_DECREASE" ||
      source.kind === "REVERSAL"
        ? source.kind
        : undefined,
    days: typeof source.days === "number" ? source.days : undefined,
  };
}
