import "server-only";
import { defaultLocale, isLocale } from "@/i18n/config";
import { readNotificationData } from "@/lib/notification-text";
import {
  isNotificationType,
  NOTIFICATION_CATEGORIES,
  type NotificationData,
  type NotificationType,
} from "@/lib/notification-types";
import { prisma, type Db } from "./db";
import { appUrl, env } from "./env";
import { toJson } from "./json";
import { emailEnabled, sendEmail } from "./mail";
import { renderNotificationEmail } from "./mail/templates";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  debtId?: string | null;
  data?: NotificationData;
  /** When set, the same key is only ever delivered once (scheduled reminders). */
  dedupeKey?: string;
}

/**
 * Creates an in-app notification, in the same transaction as whatever caused it.
 *
 * Whether an email also goes out is decided here from the recipient's preferences; the email
 * itself is sent later, outside the transaction (see `flushEmailOutbox`).
 * Returns false when nothing was created (reminders switched off, or a duplicate).
 */
export async function notify(db: Db, input: NotifyInput): Promise<boolean> {
  const category = NOTIFICATION_CATEGORIES[input.type];
  const preferences = await db.userPreferences.findUnique({ where: { userId: input.userId } });

  if (category === "REMINDER" && preferences && !preferences.remindersEnabled) return false;

  const wantsEmail =
    category === "ACTION_REQUIRED"
      ? (preferences?.emailActionRequired ?? true)
      : category === "ACTIVITY"
        ? (preferences?.emailActivity ?? false)
        : (preferences?.emailReminders ?? false);

  const { count } = await db.notification.createMany({
    data: [
      {
        userId: input.userId,
        type: input.type,
        category,
        debtId: input.debtId ?? null,
        data: toJson(input.data ?? {}),
        dedupeKey: input.dedupeKey ?? null,
        emailPending: wantsEmail && emailEnabled(),
      },
    ],
    skipDuplicates: true,
  });
  return count > 0;
}

const MAX_EMAIL_ATTEMPTS = 3;

/**
 * Sends the emails that are still owed. Safe to call from several instances at once: each
 * notification is claimed with a conditional update before anything is sent.
 */
export async function flushEmailOutbox(limit = 25): Promise<{ sent: number; failed: number }> {
  if (!emailEnabled()) return { sent: 0, failed: 0 };
  const base = appUrl();
  if (!base) return { sent: 0, failed: 0 };

  const pending = await prisma.notification.findMany({
    where: { emailPending: true, emailAttempts: { lt: MAX_EMAIL_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { include: { preferences: true } } },
  });

  let sent = 0;
  let failed = 0;

  for (const notification of pending) {
    const claimed = await prisma.notification.updateMany({
      where: { id: notification.id, emailPending: true, emailAttempts: notification.emailAttempts },
      data: { emailAttempts: { increment: 1 } },
    });
    if (claimed.count === 0) continue;

    if (!isNotificationType(notification.type)) {
      await prisma.notification.update({ where: { id: notification.id }, data: { emailPending: false } });
      continue;
    }

    const locale = notification.user.preferences?.locale;
    const result = await sendEmail(
      renderNotificationEmail({
        to: notification.user.email,
        locale: isLocale(locale) ? locale : defaultLocale,
        type: notification.type,
        debtId: notification.debtId,
        data: readNotificationData(notification.data),
        appUrl: base,
      }),
    );

    if (result.sent) {
      sent += 1;
      await prisma.notification.update({
        where: { id: notification.id },
        data: { emailPending: false, emailedAt: new Date() },
      });
    } else {
      failed += 1;
      if (notification.emailAttempts + 1 >= MAX_EMAIL_ATTEMPTS || result.reason === "disabled") {
        await prisma.notification.update({ where: { id: notification.id }, data: { emailPending: false } });
      }
    }
  }

  return { sent, failed };
}

/** Fire-and-forget flush for use after a request has been answered. Never throws. */
export async function flushEmailOutboxQuietly(): Promise<void> {
  try {
    if (env().EMAIL_PROVIDER === "none") return;
    await flushEmailOutbox();
  } catch (error) {
    console.error("[notifications] email outbox flush failed:", error instanceof Error ? error.message : error);
  }
}
