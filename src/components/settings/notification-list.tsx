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
      <ul className="flex flex-col gap-2">
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
                  "flex gap-3 rounded-xl border p-4 transition-colors outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
                  item.read ? "border-border bg-card" : "border-primary/30 bg-secondary/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-full",
                    item.category === "ACTION_REQUIRED" ? "bg-waiting-soft text-waiting" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cn("text-sm", item.read ? "font-medium" : "font-semibold")}>{t(`notifications.types.${item.type}.title`, params)}</span>
                    {!item.read && <span className="text-xs font-medium text-primary">{t("pages.inbox.unread")}</span>}
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
