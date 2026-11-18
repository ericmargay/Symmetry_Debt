import { Banknote, CheckCheck, CircleCheck, CircleDot, FileSignature, Flag, HandCoins, Handshake, Landmark, MessageSquareText, Paperclip, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { EventText, eventNote, isEventType } from "@/components/shared/event-text";
import { Ticks, type TickState } from "@/components/shared/ticks";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/server/services/overview";

const TICKS: Record<ActivityItem["weight"], TickState | null> = { personal: "personal", one_side: "one", both_sides: "both", neutral: null };

function iconFor(type: string) {
  if (type === "PAYMENT_CONFIRMED") return CheckCheck;
  if (type === "PAYMENT_REJECTED") return X;
  if (type.startsWith("PAYMENT_")) return Banknote;
  if (type === "AGREEMENT_ACTIVATED") return Handshake;
  if (type === "DEBT_SETTLED") return CircleCheck;
  if (type.startsWith("VERSION_") || type.startsWith("CONVERSION_") || type === "AMENDMENT_APPLIED") return FileSignature;
  if (type.startsWith("DEBT_") || type === "SCHEDULE_UPDATED") return HandCoins;
  if (type.startsWith("INVITATION_") || type.startsWith("PARTICIPANT_") || type === "IDENTITY_CONFIRMED") return UserRound;
  if (type.startsWith("DISPUTE_") || type.startsWith("CANCELLATION_")) return Flag;
  if (type === "COMMENT_ADDED") return MessageSquareText;
  if (type.startsWith("ATTACHMENT_")) return Paperclip;
  if (type.startsWith("BANK_")) return Landmark;
  return CircleDot;
}

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/**
 * History across debts, read like a bank statement: grouped by day ("Hoy", "Ayer", date),
 * one line per event with its icon, the debt it belongs to and the receipt ticks that say how
 * firm it is.
 */
export function ActivityList({ items, timeZone, grouped = true }: { items: ActivityItem[]; timeZone: string; grouped?: boolean }) {
  const t = useTranslations("labels");
  const days = useTranslations("dashboard.day");
  const locale = useLocale() as Locale;
  const intlLocale = intlLocales[locale] ?? intlLocales.es;
  const now = new Date();
  const today = dayKey(now, timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone);
  const timeFormat = new Intl.DateTimeFormat(intlLocale, { timeStyle: "short", timeZone });
  const dayFormat = new Intl.DateTimeFormat(intlLocale, { weekday: "long", day: "numeric", month: "long", timeZone });

  const visible = items.filter((item) => isEventType(item.type));
  const groups: Array<{ key: string; label: string; items: ActivityItem[] }> = [];
  for (const item of visible) {
    const key = grouped ? dayKey(item.at, timeZone) : "all";
    let group = groups.at(-1);
    if (!group || group.key !== key) {
      const label = key === today ? days("today") : key === yesterday ? days("yesterday") : dayFormat.format(item.at);
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <section key={group.key} aria-label={grouped ? group.label : undefined}>
          {grouped && <h3 className="mb-1.5 px-1 text-xs font-bold text-muted-foreground first-letter:uppercase">{group.label}</h3>}
          <ul className="flex flex-col">
            {group.items.map((item) => {
              const note = eventNote(item.data);
              const ticks = TICKS[item.weight];
              const Icon = iconFor(item.type);
              const body = (
                <>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-medium">
                      <EventText type={item.type} data={item.data} actorName={item.actorName} actorIsMe={item.actorIsMe} personal={item.mode === "PERSONAL"} />
                    </span>
                    {note && <span className="mt-0.5 block truncate text-sm text-muted-foreground">“{note}”</span>}
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {ticks && <Ticks state={ticks} />}
                      {item.concept && (
                        <span className="truncate">
                          {item.concept}
                          {item.counterpartyName ? ` · ${item.counterpartyName}` : ""}
                        </span>
                      )}
                      {item.mode && !item.concept && <span>{t(`mode.${item.mode === "PERSONAL" ? "personalShort" : "sharedShort"}`)}</span>}
                    </span>
                  </span>
                  <time dateTime={item.at.toISOString()} className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular">
                    {grouped ? timeFormat.format(item.at) : new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(item.at)}
                  </time>
                </>
              );
              return (
                <li key={item.id}>
                  {item.debtId ? (
                    <Link
                      href={`/app/debts/${item.debtId}`}
                      className={cn("flex items-start gap-3 rounded-2xl px-2 py-2.5 transition-colors outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring")}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 px-2 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
