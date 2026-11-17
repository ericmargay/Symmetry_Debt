"use server";

import { runAction } from "@/actions/_run";
import { markAllNotificationsRead, markNotificationRead } from "@/server/services/inbox";

export async function markNotificationReadAction(notificationId: string) {
  return runAction((actor) => markNotificationRead(actor, notificationId));
}

export async function markAllNotificationsReadAction() {
  return runAction((actor) => markAllNotificationsRead(actor));
}
