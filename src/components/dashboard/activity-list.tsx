import Link from "next/link";
import { useTranslations } from "next-intl";
import { DateTimeText } from "@/components/shared/dates";
import { EventText, eventNote, isEventType } from "@/components/shared/event-text";
import { WeightMark } from "@/components/shared/weight-badge";
import type { ActivityItem } from "@/server/services/overview";

/** A compact list of history entries across debts. */
export function ActivityList({ items, timeZone }: { items: ActivityItem[]; timeZone: string }) {
  const t = useTranslations("labels");
  return (
    <ul className="flex flex-col divide-y divide-border">
      {items
        .filter((item) => isEventType(item.type))
        .map((item) => {
          const note = eventNote(item.data);
          const body = (
            <>
              <span className="mt-0.5 shrink-0">
                {item.weight === "neutral" ? (
                  <span className="block size-4" aria-hidden />
                ) : (
                  <WeightMark weight={item.weight === "personal" ? "personal" : item.weight === "both_sides" ? "both_sides" : "one_side"} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">
                  <EventText type={item.type} data={item.data} actorName={item.actorName} actorIsMe={item.actorIsMe} personal={item.mode === "PERSONAL"} />
                </span>
                {note && <span className="mt-1 block truncate text-sm text-muted-foreground">“{note}”</span>}
                <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {item.concept && (
                    <span className="truncate">
                      {item.concept}
                      {item.counterpartyName ? ` · ${item.counterpartyName}` : ""}
                    </span>
                  )}
                  {item.mode && <span>{t(`mode.${item.mode === "PERSONAL" ? "personalShort" : "sharedShort"}`)}</span>}
                  <DateTimeText date={item.at} timeZone={timeZone} />
                </span>
              </span>
            </>
          );
          return (
            <li key={item.id}>
              {item.debtId ? (
                <Link href={`/app/debts/${item.debtId}`} className="-mx-2 flex gap-3 rounded-lg px-2 py-3 outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring">
                  {body}
                </Link>
              ) : (
                <div className="flex gap-3 py-3">{body}</div>
              )}
            </li>
          );
        })}
    </ul>
  );
}
