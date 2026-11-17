import "server-only";
import { readNotificationData } from "@/lib/notification-text";
import {
  isNotificationType,
  notificationHref,
  type NotificationCategory,
  type NotificationData,
  type NotificationType,
} from "@/lib/notification-types";
import type { Actor } from "../actor";
import { prisma } from "../db";

export interface NotificationView {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  data: NotificationData;
  href: string;
  read: boolean;
  createdAt: Date;
}

export async function listNotifications(actor: Pick<Actor, "id">, limit = 50): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const views: NotificationView[] = [];
  for (const row of rows) {
    if (!isNotificationType(row.type)) continue;
    const data = readNotificationData(row.data);
    views.push({
      id: row.id,
      type: row.type,
      category: row.category,
      data,
      href: notificationHref(row.type, row.debtId, data),
      read: row.readAt !== null,
      createdAt: row.createdAt,
    });
  }
  return views;
}

export async function unreadNotificationCount(actor: Pick<Actor, "id">): Promise<number> {
  return prisma.notification.count({ where: { userId: actor.id, readAt: null } });
}

export async function markNotificationRead(actor: Pick<Actor, "id">, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(actor: Pick<Actor, "id">): Promise<void> {
  await prisma.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
}

/** Opening a debt takes care of whatever was pending to be read about it. */
export async function markDebtNotificationsRead(actor: Pick<Actor, "id">, debtId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId: actor.id, debtId, readAt: null },
    data: { readAt: new Date() },
  });
}
