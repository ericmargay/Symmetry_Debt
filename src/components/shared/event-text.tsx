import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";

/** Event types that have a sentence in the "timeline.event" messages. */
export const EVENT_TYPES = [
  "DEBT_CREATED",
  "DEBT_UPDATED",
  "SCHEDULE_UPDATED",
  "DEBT_SETTLED",
  "DEBT_REOPENED",
  "DEBT_CANCELLED",
  "PAYMENT_RECORDED",
  "PAYMENT_UPDATED",
  "PAYMENT_DELETED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REJECTED",
  "PAYMENT_CLARIFICATION_REQUESTED",
  "PAYMENT_CLARIFIED",
  "PAYMENT_WITHDRAWN",
  "VERSION_PROPOSED",
  "VERSION_ACCEPTED",
  "VERSION_REJECTED",
  "VERSION_CHANGES_REQUESTED",
  "VERSION_WITHDRAWN",
  "AGREEMENT_ACTIVATED",
  "AMENDMENT_APPLIED",
  "INVITATION_CREATED",
  "INVITATION_REVOKED",
  "PARTICIPANT_JOINED",
  "IDENTITY_CONFIRMED",
  "PARTICIPANT_REMOVED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  "CANCELLATION_REQUESTED",
  "CANCELLATION_DECLINED",
  "CANCELLATION_WITHDRAWN",
  "CONVERSION_PROPOSED",
  "CONVERSION_COMPLETED",
  "CONVERSION_CLOSED",
  "COMMENT_ADDED",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_REMOVED",
  "BANK_DETAILS_SHARED",
  "BANK_DETAILS_REVOKED",
  "BANK_ACCOUNT_CREATED",
  "BANK_ACCOUNT_UPDATED",
  "BANK_ACCOUNT_ARCHIVED",
  "DATA_EXPORTED",
  "SESSIONS_REVOKED",
  "INSTALLMENT_OVERDUE",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : fallback;
}

/** The free text somebody wrote with an event (a comment, a reason), if any. */
export function eventNote(data: Record<string, unknown>): string | null {
  const note = text(data.text) || text(data.comment) || text(data.note);
  return note || null;
}

/**
 * One line of history, in the reader's language and from the reader's point of view
 * ("Registraste un pago…" / "Ana registró un pago…").
 */
export function EventText({
  type,
  data,
  actorName,
  actorIsMe,
  personal,
}: {
  type: string;
  data: Record<string, unknown>;
  actorName: string | null;
  actorIsMe: boolean;
  /** The event belongs to a personal record. */
  personal: boolean;
}) {
  const t = useTranslations("timeline");
  const locale = useLocale() as Locale;
  if (!isEventType(type)) return null;

  const amountMinor = text(data.amountMinor);
  const currency = text(data.currency);
  const amount =
    /^-?[0-9]+$/.test(amountMinor) && currency
      ? formatMoney(BigInt(amountMinor), currency, intlLocales[locale] ?? intlLocales.es)
      : "";

  return (
    <>
      {t(`event.${type}`, {
        by: actorIsMe ? "me" : "other",
        actor: actorName ?? t("system"),
        scope: personal ? "personal" : "shared",
        amount,
        kind: text(data.kind, "PAYMENT"),
        version: text(data.version, "1"),
        name: text(data.name),
        fileName: text(data.fileName),
        label: text(data.label),
        reason: text(data.reason, "other"),
        sequence: text(data.sequence),
      })}
    </>
  );
}
