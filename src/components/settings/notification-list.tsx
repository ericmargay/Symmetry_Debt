"use client";

import { BellRing, CalendarClock, Info } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/actions/inbox";
import { DateTimeText } from "@/components/shared/dates";
import { ActionButton } from "@/components/shared/dialogs";
import type { Locale } from "@/i18n/config";
import { notificationParams } from "@/lib/notification-text";
import { cn } from "@/lib/utils";
import type { NotificationView } from "@/server/services/inbox";

const ICONS = { ACTION_REQUIRED: BellRing, ACTIVITY: Info, REMINDER: CalendarClock } as const;

/** The inbox. Texts are rendered here, in the reader's language, from the data of each notice. */
export function NotificationList({ items, timeZone }: { items: NotificationView[]; timeZone: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const unread = items.filter((item) => !item.read).length;

  return (
    <>
      {unread > 0 && (
        <div className="mb-3 flex justify-end">
          <ActionButton variant="outline" size="sm" action={() => markAllNotificationsReadAction()}>
            {t("pages.inbox.markAll")}
          </ActionButton>
        </div>
      )}
      <ul className="surface divide-y divide-border overflow-hidden">
        {items.map((item) => {
          const Icon = ICONS[item.category];
          const params = notificationParams(item.data, locale);
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                onClick={() => {
                  if (!item.read) void markNotificationReadAction(item.id);
                }}
                className={cn(
                  "relative flex gap-3.5 px-4 py-4 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-5",
                  !item.read && "bg-secondary/35",
                )}
              >
                {!item.read && <span className="absolute top-1/2 left-1.5 size-2 -translate-y-1/2 rounded-full bg-primary sm:left-2" aria-hidden />}
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-2xl",
                    item.category === "ACTION_REQUIRED" ? "bg-waiting text-white" : item.category === "REMINDER" ? "bg-secondary text-primary" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  <Icon className="size-[1.1rem]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn("text-sm", item.read ? "font-semibold" : "font-bold")}>{t(`notifications.types.${item.type}.title`, params)}</span>
                    {!item.read && <span className="rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-bold text-primary-foreground">{t("pages.inbox.unread")}</span>}
                  </span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{t(`notifications.types.${item.type}.body`, params)}</span>
                  <span className="mt-1.5 block text-xs text-muted-foreground">
                    {t(`pages.inbox.category.${item.category}`)} · <DateTimeText date={item.createdAt} timeZone={timeZone} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
